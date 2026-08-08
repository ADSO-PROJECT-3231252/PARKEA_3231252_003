const express = require('express');
const router = express.Router();
const { crearPago } = require('../controllers/pago.controller');
const { verificarToken } = require('../middlewares/auth.middleware');

router.post('/:reservationId', verificarToken, crearPago);

module.exports = router;