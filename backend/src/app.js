require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');

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

// 404 handler
app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

// Centralized error handler
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
    });
});

module.exports = app;