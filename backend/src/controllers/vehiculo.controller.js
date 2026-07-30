const { validationResult } = require('express-validator');
const { Vehiculo } = require('../models');

// HU-10: Register Vehicle
async function registrar(req, res, next) {
    try {
        const errores = validationResult(req);
        if (!errores.isEmpty()) {
            return res.status(400).json({ errors: errores.array() });
        }

        const { plate, brand, model, color } = req.body;
        const userId = req.usuario.id; 

        const existente = await Vehiculo.findOne({ where: { plate } });
        if (existente) {
            return res.status(409).json({ message: 'This plate is already registered' });
        }

        const vehiculo = await Vehiculo.create({ plate, brand, model, color, userId });

        return res.status(201).json({
            message: 'Vehicle registered successfully',
            vehicle: vehiculo,
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { registrar };