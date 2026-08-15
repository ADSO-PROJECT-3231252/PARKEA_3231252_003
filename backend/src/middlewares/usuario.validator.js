const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');

const validarEditarPerfil = [
    body('fullName')
        .trim()
        .notEmpty().withMessage('Full name is required')
        .isLength({ max: 100 }).withMessage('Full name must be at most 100 characters'),
    body('phone')
        .optional()
        .matches(/^[0-9]{7,15}$/).withMessage('Phone must contain only digits (7-15 characters)'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

const validarCambiarPassword = [
    body('currentPassword').notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .isLength({ min: 8 }).withMessage('Password must be at least 8 characters')
        .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
        .matches(/[0-9]/).withMessage('Password must include a number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must include a special character'),
    body('confirmNewPassword')
        .custom((value, { req }) => value === req.body.newPassword)
        .withMessage('Passwords do not match'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

module.exports = { validarEditarPerfil, validarCambiarPassword };