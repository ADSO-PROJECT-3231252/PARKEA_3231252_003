const express = require('express');
const router = express.Router();
const { crearPago, pagarSaldo } = require('../controllers/pago.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/:reservationId', verificarToken, crearPago);

// HU-27: pay the balance of a finished open stay
router.post('/:reservationId/balance', verificarToken, pagarSaldo);

module.exports = router;
