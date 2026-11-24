const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');
const { normalizeName, isValidName, isValidPhone } = require('../utils/personRules');

const validarEditarPerfil = [
    // Both fields are optional here because the frontend only sends the one
    // that changed (name or phone). .optional() only skips the chain when the
    // key is missing from the request; an explicit empty string still fails
    // notEmpty(), so "" cannot be used to erase the name.
    body('fullName')
        .optional()
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .customSanitizer(normalizeName)
        .notEmpty().withMessage('Full name is required').bail()
        .custom(isValidName).withMessage('Full name must have 2 to 70 characters: letters joined by one space, hyphen or apostrophe'),
    body('phone')
        .optional()
        .custom(isTextOrMissing).withMessage('Phone must be text').bail()
        .trim()
        .custom(isValidPhone).withMessage('Phone must be a Colombian mobile number: 10 digits starting with 3'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

const validarCambiarPassword = [
    body('currentPassword')
        .custom(isTextOrMissing).withMessage('Current password must be text').bail()
        .notEmpty().withMessage('Current password is required'),
    body('newPassword')
        .custom(isTextOrMissing).withMessage('New password must be text').bail()
        .isLength({ min: 8, max: 20 }).withMessage('Password must be between 8 and 20 characters')
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
