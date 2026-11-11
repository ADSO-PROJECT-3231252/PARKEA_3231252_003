const router = require('express').Router();
const { validarVerificarCorreo, validarReenviarVerificacion } = require('../middlewares/emailVerification.validator');
const { verificarCorreo, reenviarVerificacion } = require('../controllers/emailVerification.controller');
const { resendVerificationLimiter } = require('../middlewares/rateLimit');

// POST /api/auth/verify-email — HU-30, AC-02 and AC-03
router.post('/verify-email', validarVerificarCorreo, verificarCorreo);

// POST /api/auth/resend-verification — HU-30, AC-05
router.post('/resend-verification', resendVerificationLimiter, validarReenviarVerificacion, reenviarVerificacion);

module.exports = router;
