const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');

const validarCambiarRol = [
    body('role')
        .notEmpty().withMessage('Role is required')
        .isIn(['admin', 'user']).withMessage('Invalid role'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

const validarCambiarEstado = [
    body('isActive')
        .notEmpty().withMessage('isActive is required')
        .isBoolean().withMessage('isActive must be true or false'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

module.exports = { validarCambiarRol, validarCambiarEstado };