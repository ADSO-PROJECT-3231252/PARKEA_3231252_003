const { body, validationResult } = require('express-validator');

const validateRegister = [
    body('fullName')
        .trim()
        .notEmpty()
        .withMessage('El nombre completo es obligatorio')
        .isLength({ max: 100 })
        .withMessage('El nombre no puede superar los 100 caracteres'),

    body('email')
        .trim()
        .notEmpty()
        .withMessage('El correo es obligatorio')
        .isEmail()
        .withMessage('El correo no es válido'),

    body('password')
        .notEmpty()
        .withMessage('La contraseña es obligatoria')
        .isLength({ min: 6 })
        .withMessage('La contraseña debe tener mínimo 6 caracteres'),

    body('phone')
        .optional()
        .isLength({ max: 20 })
        .withMessage('El teléfono no puede superar los 20 caracteres'),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            });
        }

        next();
    }
];
const validateLogin = [
    body('email')
        .isEmail()
        .withMessage('Correo inválido'),

    body('password')
        .notEmpty()
        .withMessage('La contraseña es obligatoria'),

    (req, res, next) => {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({
                errors: errors.array()
            });
        }

        next();
    }
];

module.exports = {
    validateRegister,
    validateLogin
};