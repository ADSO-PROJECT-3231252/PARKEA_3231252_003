const router = require('express').Router();
const { body } = require('express-validator');
const { verificarToken, verificarRol } = require('../middlewares/auth.middleware');
const vehiculoController = require('../controllers/vehiculo.controller');
const { isTextOrMissing } = require('../utils/validation');
const { normalizeVehicleText, isValidVehicleText } = require('../utils/vehicleRules');

// #316: vehicles belong to user accounts; an administrator gets 403 FORBIDDEN_ROLE
const soloUsuarios = [verificarToken, verificarRol('user')];

const validarCamposVehiculo = [
    body('vehicleType')
        .custom(isTextOrMissing).withMessage('Vehicle type must be text').bail()
        .notEmpty().withMessage('Vehicle type is required')
        .isIn(['car', 'motorcycle', 'truck']).withMessage('Invalid vehicle type'),
    body('brand')
        .custom(isTextOrMissing).withMessage('Brand must be text').bail()
        .trim()
        .notEmpty().withMessage('Brand is required').bail()
        .custom(isValidVehicleText).withMessage('Brand can only have letters, numbers, spaces, hyphens and periods').bail()
        .customSanitizer(normalizeVehicleText)
        .isLength({ max: 50 }).withMessage('Brand must be at most 50 characters'),
    body('model')
        .custom(isTextOrMissing).withMessage('Model must be text').bail()
        .trim()
        .notEmpty().withMessage('Model is required').bail()
        .custom(isValidVehicleText).withMessage('Model can only have letters, numbers, spaces, hyphens and periods').bail()
        .customSanitizer(normalizeVehicleText)
        .isLength({ max: 50 }).withMessage('Model must be at most 50 characters'),
    body('color')
        .custom(isTextOrMissing).withMessage('Color must be text').bail()
        .trim()
        .notEmpty().withMessage('Color is required').bail()
        .custom(isValidVehicleText).withMessage('Color can only have letters, numbers, spaces, hyphens and periods').bail()
        .customSanitizer(normalizeVehicleText)
        .isLength({ max: 30 }).withMessage('Color must be at most 30 characters'),
    body('visualDescription')
        .optional({ checkFalsy: true })
        .custom(isTextOrMissing).withMessage('Visual description must be text').bail()
        .trim()
        .isLength({ max: 255 }).withMessage('Visual description must be at most 255 characters'),
];

// POST /api/vehicles — register a vehicle (HU-10)
router.post(
    '/',
    soloUsuarios,
    [
        body('plate')
            .custom(isTextOrMissing).withMessage('Plate must be text').bail()
            .notEmpty().withMessage('Plate is required'),
        ...validarCamposVehiculo,
    ],
    vehiculoController.registrar
);

// GET /api/vehicles — list the authenticated user's vehicles
router.get('/', soloUsuarios, vehiculoController.misVehiculos);

// GET /api/vehicles/:id — single vehicle detail (prefills the edit form)
router.get('/:id', soloUsuarios, vehiculoController.obtenerVehiculo);

// PUT /api/vehicles/:id — edit vehicle info (type, brand, model, color, visual description)
router.put('/:id', soloUsuarios, validarCamposVehiculo, vehiculoController.editar);

// PATCH /api/vehicles/:id/default — set this vehicle as the default one
router.patch('/:id/default', soloUsuarios, vehiculoController.marcarPredeterminado);

// DELETE /api/vehicles/:id — delete a vehicle (blocked if it has an active reservation)
router.delete('/:id', soloUsuarios, vehiculoController.eliminar);

module.exports = router;
