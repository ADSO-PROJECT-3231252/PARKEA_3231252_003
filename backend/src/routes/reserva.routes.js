const router = require('express').Router();
const { body, validationResult } = require('express-validator');
const { verificarToken } = require('../middlewares/auth.middleware');
const reservaController = require('../controllers/reserva.controller');
const ErrorCodes = require('../constants/errorCodes');
const { isTextOrMissing } = require('../utils/validation');

// The ids and the dates must be text; missing ones are still reported by the
// controller as MISSING_REQUIRED_FIELDS
const validarCamposReserva = [
    body(['zoneId', 'vehicleId', 'startTime', 'endTime'])
        .custom(isTextOrMissing).withMessage((value, { path }) => `${path} must be text`),
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errors.array() });
        }
        next();
    },
];

// POST /api/reservations — create a reservation (HU-14)
router.post('/', verificarToken, validarCamposReserva, reservaController.crear);

// GET /api/reservations — list the authenticated user's reservations (HU-18)
router.get('/', verificarToken, reservaController.misReservas);

// GET /api/reservations/:id — reservation confirmation details (HU-15)
router.get('/:id', verificarToken, reservaController.obtenerConfirmacion);

// PATCH /api/reservations/:id/cancel — cancel a reservation (HU-16)
router.patch('/:id/cancel', verificarToken, reservaController.cancelar);

module.exports = router;
