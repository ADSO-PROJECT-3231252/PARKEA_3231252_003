require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const ErrorCodes = require('./constants/errorCodes');

const app = express();

// On Azure the API runs behind one proxy. Trusting that one hop makes req.ip
// the visitor's address instead of the proxy's, so the attempt limits
// (middlewares/rateLimit.js) count each visitor separately.
app.set('trust proxy', 1);

// Security headers
app.use(helmet());

// Only allow requests from the frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));

// Reads the JSON and form bodies. An error while reading a body is marked, so
// the error handler can answer it with the project's own codes (#185, #258).
function readBody(parser) {
    return (req, res, next) => {
        parser(req, res, (err) => {
            if (err) err.isBodyError = true;
            next(err);
        });
    };
}

app.use(readBody(express.json()));
app.use(readBody(express.urlencoded({ extended: true })));

// Health check route, useful to confirm the server is running
app.get('/api/health', (req, res) => {
    res.status(200).json({ status: 'ok', service: 'PARKEA API' });
});

// Mount all API routes under /api
app.use('/api', require('./routes'));

// 404 handler, with a code like every other error
app.use((req, res) => {
    res.status(404).json({ code: ErrorCodes.ROUTE_NOT_FOUND, message: 'Route not found' });
});

// Errors while reading the request body. They are the client's fault, so they
// are not logged, and the parser's own code and message are never sent: they
// describe its internals (for example "Z_DATA_ERROR"), not what to fix.
// Returns [status, body], or null when it is not a body error caused by the client.
function bodyErrorAnswer(err) {
    if (!err.isBodyError || err.status >= 500) return null;

    switch (err.type) {
        // Larger than 100 kB, or a form with more than 1000 fields
        case 'entity.too.large':
        case 'parameters.too.many':
            return [413, { code: ErrorCodes.PAYLOAD_TOO_LARGE, message: 'The request body is too large' }];
        // A Content-Encoding other than gzip, deflate or br, or an unknown charset
        case 'encoding.unsupported':
        case 'charset.unsupported':
            return [415, { code: ErrorCodes.UNSUPPORTED_MEDIA_TYPE, message: 'The request body uses an unsupported encoding or charset' }];
        // Not valid JSON, or a gzip, deflate or br body that is damaged
        default:
            return [400, { code: ErrorCodes.INVALID_JSON, message: 'The request body is not valid JSON' }];
    }
}

// Centralized error handler
app.use((err, req, res, next) => {
    const bodyError = bodyErrorAnswer(err);
    if (bodyError) {
        const [status, body] = bodyError;
        return res.status(status).json(body);
    }

    const status = err.status || 500;

    // Unexpected errors keep their details in the server log only: the
    // message can include database or file system details.
    if (status >= 500) {
        console.error(err.stack);
        return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Internal server error' });
    }

    res.status(status).json({
        code: err.code || ErrorCodes.INTERNAL_ERROR,
        message: err.message,
    });
});

module.exports = app;
