const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getZonaPorId, getDisponibilidadPorHoras } = require('../controllers/zona.controller');

router.get('/', getZonas);
router.get('/all', verificarToken, verificarRol('admin'), getTodasLasZonas);
router.get('/:id', getZonaPorId);
// #375: public, the free spots of a zone for some hours
router.get('/:id/availability', getDisponibilidadPorHoras);
router.post('/', verificarToken, verificarRol('admin'), createZona);
router.put('/:id', verificarToken, verificarRol('admin'), updateZona);
router.patch('/:id/toggle', verificarToken, verificarRol('admin'), toggleZona);

module.exports = router;
