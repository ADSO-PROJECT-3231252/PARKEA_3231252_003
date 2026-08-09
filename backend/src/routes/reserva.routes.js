const router = require('express').Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const reservaController = require('../controllers/reserva.controller');

// POST /api/reservations — create a reservation (HU-14)
router.post('/', verificarToken, reservaController.crear);

// GET /api/reservations/:id — reservation confirmation details (HU-15)
router.get('/:id', verificarToken, reservaController.obtenerConfirmacion);

// PATCH /api/reservations/:id/cancel — cancel a reservation (HU-16)
router.patch('/:id/cancel', verificarToken, reservaController.cancelar);

module.exports = router;