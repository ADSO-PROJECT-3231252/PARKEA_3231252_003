const { body } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');

const validarSolicitarRecuperacion = [
    body('email')
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email'),
    (req, res, next) => {
        const { validationResult } = require('express-validator');
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

const validarRestablecerPassword = [
    body('token').notEmpty().withMessage('Token is required'),
        body('newPassword')
        .isLength({ min: 8, max: 20 }).withMessage('Password must be between 8 and 20 characters')
        .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
        .matches(/[0-9]/).withMessage('Password must include a number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must include a special character'),
    body('confirmNewPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    (req, res, next) => {
        const { validationResult } = require('express-validator');
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

module.exports = { validarSolicitarRecuperacion, validarRestablecerPassword };