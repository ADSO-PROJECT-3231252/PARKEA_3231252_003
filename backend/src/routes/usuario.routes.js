const router = require('express').Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const { changePasswordLimiter } = require('../middlewares/rateLimit');
const { validarEditarPerfil, validarCambiarPassword } = require('../middlewares/usuario.validator');
const usuarioController = require('../controllers/usuario.controller');

// GET /api/users/me — load my profile
router.get('/me', verificarToken, usuarioController.obtenerPerfil);

router.put('/me', verificarToken, validarEditarPerfil, usuarioController.editarPerfil);
// The limit goes after the session check: it counts by account (#301)
router.put('/me/password', verificarToken, changePasswordLimiter, validarCambiarPassword, usuarioController.cambiarPassword);

module.exports = router;
