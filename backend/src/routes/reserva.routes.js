const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { verificarToken } = require('../middlewares/auth.middleware');
const reservaController = require('../controllers/reserva.controller');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');

// The ids and the dates must be text; missing ones are still reported by the
// controller as MISSING_REQUIRED_FIELDS
// Answers 400 VALIDATION_ERROR with the fields that failed
const responderErrores = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
    }
    next();
};

const validarCamposReserva = [
    body(['zoneId', 'vehicleId', 'startTime', 'endTime'])
        .custom(isTextOrMissing).withMessage((value, { path }) => `${path} must be text`),
    // HU-27: true for a stay without an exit time; only a real boolean is accepted
    body('openEnded').optional().custom((value) => typeof value === 'boolean').withMessage('openEnded must be true or false'),
    responderErrores,
];

// HU-27 AC-06: the hours shown in the confirmation dialog, if the client sends them
const validarTerminar = [
    body('expectedHours').optional().isInt({ min: 1, max: 24 }).withMessage('expectedHours must be a whole number from 1 to 24').toInt(),
    responderErrores,
];

// HU-28: the exit time the user saw, plus either a later exit time (paid
// now) or a switch to an open stay. The payment fields are checked by the
// controller, as in the payments route.
const validarAmpliar = [
    body(['fromEndTime', 'newEndTime'])
        .custom(isTextOrMissing).withMessage((value, { path }) => `${path} must be text`),
    body('fromEndTime')
        .notEmpty().withMessage('fromEndTime is required').bail()
        .isISO8601({ strict: true }).withMessage('fromEndTime must be a date'),
    body('openEnded').optional().custom((value) => value === true).withMessage('openEnded can only be true'),
    body('newEndTime').custom((value, { req }) => {
        if (req.body.openEnded === true) {
            if (value !== undefined) throw new Error('Send newEndTime or openEnded, not both');
            return true;
        }
        if (value === undefined || value === null || value === '') throw new Error('newEndTime is required');
        if (Number.isNaN(Date.parse(value)) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(value)) throw new Error('newEndTime must be a date and time');
        return true;
    }),
    responderErrores,
];

// POST /api/reservations — create a reservation (HU-14)
router.post('/', verificarToken, validarCamposReserva, reservaController.crear);

// GET /api/reservations — list the authenticated user's reservations (HU-18)
router.get('/', verificarToken, reservaController.misReservas);

// GET /api/reservations/:id — reservation confirmation details (HU-15)
router.get('/:id', verificarToken, reservaController.obtenerConfirmacion);

// PATCH /api/reservations/:id/cancel — cancel a reservation (HU-16)
router.patch('/:id/cancel', verificarToken, reservaController.cancelar);

// PATCH /api/reservations/:id/finish — finish an open stay (HU-27)
router.patch('/:id/finish', verificarToken, validarTerminar, reservaController.terminar);

// PATCH /api/reservations/:id/extend — extend a stay or leave it open (HU-28)
router.patch('/:id/extend', verificarToken, validarAmpliar, reservaController.ampliar);

module.exports = router;
