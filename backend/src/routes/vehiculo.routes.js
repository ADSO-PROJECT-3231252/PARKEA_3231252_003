const router = require('express').Router();
const { body } = require('express-validator');
const { verificarToken } = require('../middlewares/auth.middleware');
const vehiculoController = require('../controllers/vehiculo.controller');

// POST /api/vehicles — requires authentication 
router.post(
    '/',
    verificarToken,
    [
        body('plate').notEmpty().withMessage('Plate is required'),
    ],
    vehiculoController.registrar
);

module.exports = router;