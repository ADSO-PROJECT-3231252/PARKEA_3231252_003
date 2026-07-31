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

// GET /api/vehicles — list the authenticated user's vehicles
router.get('/', verificarToken, vehiculoController.misVehiculos);

// PUT /api/vehicles/:id — edit vehicle info (brand, model, color)
router.put('/:id', verificarToken, vehiculoController.editar);

// DELETE /api/vehicles/:id — delete a vehicle
router.delete('/:id', verificarToken, vehiculoController.eliminar);

module.exports = router;