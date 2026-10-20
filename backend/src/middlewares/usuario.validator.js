const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');

const validarEditarPerfil = [
    // Ambos campos son opcionales aca porque el frontend solo envia el que
    // realmente cambio (nombre o telefono). .optional() solo se salta la
    // cadena cuando la clave no viene en el request; un string vacio explicito
    // sigue fallando notEmpty(), asi que "" no sirve para borrar el nombre.
    body('fullName')
        .optional()
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Full name is required')
        .isLength({ max: 70 }).withMessage('Full name must be at most 70 characters'),
    body('phone')
        .optional()
        .custom(isTextOrMissing).withMessage('Phone must be text').bail()
        .matches(/^[0-9]{10}$/).withMessage('Phone must be exactly 10 digits'),
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