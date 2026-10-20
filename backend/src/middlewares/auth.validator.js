const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');

const validateRegister = [
    body('fullName')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Full name is required')
        .isLength({ max: 70 }).withMessage('Full name must be at most 70 characters'),
    body('email')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email')
        .isLength({ max: 100 }).withMessage('Email must be at most 100 characters'),
    body('password')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .notEmpty().withMessage('Password is required')
        .isLength({ min: 8, max: 20 }).withMessage('Password must be between 8 and 20 characters')
        .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
        .matches(/[0-9]/).withMessage('Password must include a number')
        .matches(/[^A-Za-z0-9]/).withMessage('Password must include a special character'),
    body('confirmPassword')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    body('phone')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Phone is required')
        .matches(/^[0-9]{10}$/).withMessage('Phone must be exactly 10 digits'),
    body('documentType')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .notEmpty().withMessage('Document type is required')
        .isIn(['CC', 'TI', 'CE', 'PASSPORT']).withMessage('Invalid document type'),
    body('documentNumber')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Document number is required')
        .isAlphanumeric().withMessage('Document number must contain only letters and numbers')
        .isLength({ max: 15 }).withMessage('Document number must be at most 15 characters'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

const validateLogin = [
    body('email')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email'),
    body('password')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .notEmpty().withMessage('Password is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

module.exports = { validateRegister, validateLogin };