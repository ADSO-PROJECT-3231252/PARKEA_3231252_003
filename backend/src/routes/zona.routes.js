const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getSpotsDeZona, getZonaPorId } = require('../controllers/zona.controller');

router.get('/', getZonas);
router.get('/all', verificarToken, verificarRol('admin'), getTodasLasZonas);
router.get('/:id', getZonaPorId);
router.post('/', verificarToken, verificarRol('admin'), createZona);
router.put('/:id', verificarToken, verificarRol('admin'), updateZona);
router.patch('/:id/toggle', verificarToken, verificarRol('admin'), toggleZona);
router.get('/:id/spots', verificarToken, verificarRol('admin'), getSpotsDeZona);

module.exports = router;