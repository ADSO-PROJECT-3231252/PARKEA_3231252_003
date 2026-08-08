const router = require('express').Router();
const { verificarToken } = require('../middlewares/auth.middleware');
const { validarEditarPerfil, validarCambiarPassword } = require('../middlewares/usuario.validator');
const usuarioController = require('../controllers/usuario.controller');

router.put('/me', verificarToken, validarEditarPerfil, usuarioController.editarPerfil);
router.put('/me/password', verificarToken, validarCambiarPassword, usuarioController.cambiarPassword);

module.exports = router;