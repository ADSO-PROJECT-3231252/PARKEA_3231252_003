require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const ErrorCodes = require('./constants/errorCodes');

const app = express();

// Security headers
app.use(helmet());

// Only allow requests from the frontend
app.use(cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

// Centralized error handler
app.use((err, req, res, next) => {
    // Errors from express.json(): a body that is not valid JSON, or one larger
    // than its limit (100 kB). They are the client's fault, so they are not
    // logged, and the parser's own message is not sent.
    if (err.type === 'entity.parse.failed') {
        return res.status(400).json({ code: ErrorCodes.INVALID_JSON, message: 'The request body is not valid JSON' });
    }
    if (err.type === 'entity.too.large') {
        return res.status(413).json({ code: ErrorCodes.PAYLOAD_TOO_LARGE, message: 'The request body is too large' });
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
