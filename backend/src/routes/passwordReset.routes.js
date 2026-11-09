const router = require('express').Router();
const { validarSolicitarRecuperacion, validarRestablecerPassword } = require('../middlewares/passwordReset.validator');
const passwordResetController = require('../controllers/passwordReset.controller');
const { forgotPasswordLimiter } = require('../middlewares/rateLimit');

// POST /api/auth/forgot-password — HU-07 phase 1
router.post('/forgot-password', forgotPasswordLimiter, validarSolicitarRecuperacion, passwordResetController.solicitarRecuperacion);

// POST /api/auth/reset-password — HU-07 phase 2
router.post('/reset-password', validarRestablecerPassword, passwordResetController.restablecerPassword);

module.exports = router;
