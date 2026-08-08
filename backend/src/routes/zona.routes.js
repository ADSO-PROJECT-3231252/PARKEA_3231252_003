const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { getZonas, createZona, updateZona, toggleZona } = require('../controllers/zona.controller');

router.get('/', getZonas);
router.post('/', verificarToken, verificarRol('admin'), createZona);
router.put('/:id', verificarToken, verificarRol('admin'), updateZona);
router.patch('/:id/toggle', verificarToken, verificarRol('admin'), toggleZona);

module.exports = router;