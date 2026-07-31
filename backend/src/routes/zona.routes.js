const express = require('express');
const router = express.Router();
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const { getZonas, createZona, updateZona, deleteZona } = require('../controllers/zona.controller');

router.get('/', getZonas);
router.post('/', verificarToken, verificarRol('admin'), createZona);
router.put('/:id', verificarToken, verificarRol('admin'), updateZona);
router.delete('/:id', verificarToken, verificarRol('admin'), deleteZona);

module.exports = router;