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

module.exports = router;
