const express = require('express');
const router = express.Router();
const { crearPago, pagarSaldo } = require('../controllers/pago.controller');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');

// #316: only user accounts pay reservations; an administrator gets 403 FORBIDDEN_ROLE
const soloUsuarios = [verificarToken, verificarRol('user')];

router.post('/:reservationId', soloUsuarios, crearPago);

// HU-27: pay the balance of a finished open stay
router.post('/:reservationId/balance', soloUsuarios, pagarSaldo);

module.exports = router;
