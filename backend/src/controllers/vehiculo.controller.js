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

// HU-11: View My Registered Vehicles
async function misVehiculos(req, res, next) {
    try {
        const userId = req.usuario.id;

        const vehiculos = await Vehiculo.findAll({ where: { userId } });

        return res.status(200).json({ vehicles: vehiculos });
    } catch (error) {
        next(error);
    }
}

// HU-12: Edit Vehicle Information
async function editar(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;

        const vehiculo = await Vehiculo.findOne({ where: { id, userId } });
        if (!vehiculo) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        const { brand, model, color } = req.body;
        await vehiculo.update({ brand, model, color });

        return res.status(200).json({
            message: 'Vehicle updated successfully',
            vehicle: vehiculo,
        });
    } catch (error) {
        next(error);
    }
}

// HU-13: Delete a Vehicle
async function eliminar(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;

        const vehiculo = await Vehiculo.findOne({ where: { id, userId } });
        if (!vehiculo) {
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        await vehiculo.destroy();

        return res.status(200).json({ message: 'Vehicle deleted successfully' });
    } catch (error) {
        next(error);
    }
}

module.exports = { registrar, misVehiculos, editar, eliminar };