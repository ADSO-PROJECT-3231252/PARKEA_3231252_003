const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');

function answerErrors(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
    }
    next();
}

// HU-30: POST /api/auth/verify-email
const validarVerificarCorreo = [
    body('token')
        .custom(isTextOrMissing).withMessage('Token must be text').bail()
        .notEmpty().withMessage('Token is required'),
    answerErrors,
];

// HU-30: POST /api/auth/resend-verification
const validarReenviarVerificacion = [
    body('email')
        .custom(isTextOrMissing).withMessage('Email must be text').bail()
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email'),
    answerErrors,
];

module.exports = { validarVerificarCorreo, validarReenviarVerificacion };
