const { body, validationResult } = require('express-validator');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');
const { normalizeName, isValidName, isValidPhone } = require('../utils/personRules');

// The sign-up rules of the email and the password. The seeder of the primary
// administrator runs them too (#370), so the account it creates can always
// sign in and change its password with the screens of the app.
const registerEmail = body('email')
    .custom(isTextOrMissing).withMessage('Email must be text').bail()
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email')
    .isLength({ max: 100 }).withMessage('Email must be at most 100 characters');

const registerPassword = body('password')
    .custom(isTextOrMissing).withMessage('Password must be text').bail()
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 20 }).withMessage('Password must be between 8 and 20 characters')
    .matches(/[A-Z]/).withMessage('Password must include an uppercase letter')
    .matches(/[0-9]/).withMessage('Password must include a number')
    .matches(/[^A-Za-z0-9]/).withMessage('Password must include a special character');

const validateRegister = [
    body('fullName')
        .custom(isTextOrMissing).withMessage('Full name must be text').bail()
        .customSanitizer(normalizeName)
        .notEmpty().withMessage('Full name is required').bail()
        .custom(isValidName).withMessage('Full name must have 2 to 70 characters: letters joined by one space, hyphen or apostrophe'),
    registerEmail,
    registerPassword,
    body('confirmPassword')
        .custom((value, { req }) => value === req.body.password)
        .withMessage('Passwords do not match'),
    body('phone')
        .custom(isTextOrMissing).withMessage('Phone must be text').bail()
        .trim()
        .notEmpty().withMessage('Phone is required').bail()
        .custom(isValidPhone).withMessage('Phone must be a Colombian mobile number: 10 digits starting with 3'),
    body('documentType')
        .custom(isTextOrMissing).withMessage('Document type must be text').bail()
        .notEmpty().withMessage('Document type is required')
        .isIn(['CC', 'TI', 'CE', 'PASSPORT']).withMessage('Invalid document type'),
    body('documentNumber')
        .custom(isTextOrMissing).withMessage('Document number must be text').bail()
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
        .custom(isTextOrMissing).withMessage('Email must be text').bail()
        .trim()
        .notEmpty().withMessage('Email is required')
        .isEmail().withMessage('Invalid email'),
    body('password')
        .custom(isTextOrMissing).withMessage('Password must be text').bail()
        .notEmpty().withMessage('Password is required'),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

module.exports = { validateRegister, validateLogin, registerEmail, registerPassword };
