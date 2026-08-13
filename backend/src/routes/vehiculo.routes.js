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
        body('vehicleType')
            .notEmpty().withMessage('Vehicle type is required')
            .isIn(['car', 'motorcycle', 'truck']).withMessage('Invalid vehicle type'),
    ],
    vehiculoController.registrar
);

// GET /api/vehicles — list the authenticated user's vehicles
router.get('/', verificarToken, vehiculoController.misVehiculos);

// PUT /api/vehicles/:id — edit vehicle info (type, brand, model, color, visual description)
router.put('/:id', verificarToken, vehiculoController.editar);

// PATCH /api/vehicles/:id/default — set this vehicle as the default one
router.patch('/:id/default', verificarToken, vehiculoController.marcarPredeterminado);

// DELETE /api/vehicles/:id — delete a vehicle (blocked if it has an active reservation)
router.delete('/:id', verificarToken, vehiculoController.eliminar);

module.exports = router;