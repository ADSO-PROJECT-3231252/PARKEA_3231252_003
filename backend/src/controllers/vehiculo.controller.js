const { validationResult } = require('express-validator');
const { Vehiculo, Reserva } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

const PLATE_FORMATS = {
    car: /^[A-Z]{3}[0-9]{3}$/,
    truck: /^[A-Z]{3}[0-9]{3}$/,
    motorcycle: /^[A-Z]{3}[0-9]{2}[A-Z]$/,
};

function plateMatchesType(plate, vehicleType) {
    const regex = PLATE_FORMATS[vehicleType];
    return regex ? regex.test(plate.toUpperCase()) : false;
}

// HU-10: Register Vehicle
async function registrar(req, res, next) {
    try {
        const errores = validationResult(req);
        if (!errores.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errores.array() });
        }

        const { plate, vehicleType, brand, model, color, visualDescription } = req.body;
        const userId = req.usuario.id;

        if (!plateMatchesType(plate, vehicleType)) {
            return res.status(400).json({
                code: ErrorCodes.INVALID_PLATE_FORMAT,
                message: 'The plate format does not match the selected vehicle type',
            });
        }

        const existente = await Vehiculo.findOne({ where: { plate } });
        if (existente) {
            return res.status(409).json({ code: ErrorCodes.PLATE_ALREADY_REGISTERED, message: 'This plate is already registered' });
        }

        // First vehicle for this user is automatically the default (HU-10, AC-09)
        const cantidadExistente = await Vehiculo.count({ where: { userId } });
        const isDefault = cantidadExistente === 0;

        const vehiculo = await Vehiculo.create({
            plate: plate.toUpperCase(),
            vehicleType,
            brand,
            model,
            color,
            visualDescription,
            isDefault,
            userId,
        });

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

        const vehiculos = await Vehiculo.findAll({
            where: { userId },
            order: [
                ['isDefault', 'DESC'],
                ['created_at', 'DESC'],
            ],
        });

        return res.status(200).json({ vehicles: vehiculos });
    } catch (error) {
        next(error);
    }
}

// HU-12: Edit Vehicle Information
async function editar(req, res, next) {
    try {
        const errores = validationResult(req);
        if (!errores.isEmpty()) {
            return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: errores.array() });
        }

        const { id } = req.params;
        const userId = req.usuario.id;

        const vehiculo = await Vehiculo.findOne({ where: { id, userId } });
        if (!vehiculo) {
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        const { vehicleType, brand, model, color, visualDescription } = req.body;

        // If the vehicle type changes, the existing plate must still be valid
        // for the new type (HU-12, AC-05)
        if (!plateMatchesType(vehiculo.plate, vehicleType)) {
            return res.status(400).json({
                code: ErrorCodes.INVALID_PLATE_FORMAT,
                message: "The current plate does not match the new vehicle type's format",
            });
        }

        await vehiculo.update({ vehicleType, brand, model, color, visualDescription });

        return res.status(200).json({
            message: 'Vehicle updated successfully',
            vehicle: vehiculo,
        });
    } catch (error) {
        next(error);
    }
}

// PATCH /api/vehicles/:id/default — set this vehicle as the default one
async function marcarPredeterminado(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;

        const vehiculo = await Vehiculo.findOne({ where: { id, userId } });
        if (!vehiculo) {
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        // Only one default per user: clear the previous one first (HU-11, AC-06)
        await Vehiculo.update({ isDefault: false }, { where: { userId, isDefault: true } });
        await vehiculo.update({ isDefault: true });

        return res.status(200).json({ message: 'Default vehicle updated successfully', vehicle: vehiculo });
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
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        // Block deletion if the vehicle has an active or pending reservation (HU-13, AC-02)
        const reservaActiva = await Reserva.findOne({
            where: { vehicleId: id, status: ['Pending', 'Active'] },
        });
        if (reservaActiva) {
            return res.status(409).json({
                code: ErrorCodes.VEHICLE_HAS_ACTIVE_RESERVATION,
                message: 'This vehicle has an active reservation. Please cancel the reservation before removing the vehicle.',
            });
        }

        const eraDefault = vehiculo.isDefault;
        await vehiculo.destroy(); // soft delete (paranoid: true on the model)

        // Reassign the default to the most recently registered remaining vehicle (HU-13, AC-04)
        if (eraDefault) {
            const siguiente = await Vehiculo.findOne({
                where: { userId },
                order: [['created_at', 'DESC']],
            });
            if (siguiente) {
                await siguiente.update({ isDefault: true });
            }
        }

        return res.status(200).json({ message: 'Vehicle deleted successfully' });
    } catch (error) {
        next(error);
    }
}

// GET /api/vehicles/:id — single vehicle detail (needed to prefill the edit form)
async function obtenerVehiculo(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;

        const vehiculo = await Vehiculo.findOne({ where: { id, userId } });
        if (!vehiculo) {
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        return res.status(200).json({ vehicle: vehiculo });
    } catch (error) {
        next(error);
    }
}

module.exports = { registrar, misVehiculos, obtenerVehiculo, editar, marcarPredeterminado, eliminar };