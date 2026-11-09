const { validationResult } = require('express-validator');
const { UniqueConstraintError } = require('sequelize');
const { Vehiculo, Reserva, Usuario, sequelize } = require('../models');
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

// Only active vehicles have a unique plate (plate_active index), so a unique
// violation here always means the plate is already registered. It can happen
// even after the existence check below when two requests arrive together.
function plateAlreadyRegistered(res) {
    return res.status(409).json({ code: ErrorCodes.PLATE_ALREADY_REGISTERED, message: 'This plate is already registered' });
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
            return plateAlreadyRegistered(res);
        }

        // Counting and creating happen in one transaction that holds the user's
        // row locked. Without it, two simultaneous requests from the same user
        // both count 0 vehicles and both become the default (HU-10, AC-09).
        // The second request waits at the lock and then counts the first one.
        const vehiculo = await sequelize.transaction(async (t) => {
            const usuario = await Usuario.findByPk(userId, {
                attributes: ['id'],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!usuario) {
                return null;
            }

            // First vehicle for this user is automatically the default (HU-10, AC-09)
            const cantidadExistente = await Vehiculo.count({ where: { userId }, transaction: t });
            const isDefault = cantidadExistente === 0;

            return Vehiculo.create({
                plate: plate.toUpperCase(),
                vehicleType,
                brand,
                model,
                color,
                visualDescription,
                isDefault,
                userId,
            }, { transaction: t });
        });

        if (!vehiculo) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }

        return res.status(201).json({
            message: 'Vehicle registered successfully',
            vehicle: vehiculo,
        });
    } catch (error) {
        if (error instanceof UniqueConstraintError) {
            return plateAlreadyRegistered(res);
        }
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
        if (error instanceof UniqueConstraintError) {
            return plateAlreadyRegistered(res);
        }
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

        // Only one default per user: clear the previous one first (HU-11, AC-06).
        // The two updates happen in one transaction that first locks the user's
        // row, the same lock registrar and eliminar use (#267, #268, #288).
        // Without it, setting a default while the default is deleted can leave
        // two defaults, or none. The transaction returns the vehicle, or null
        // when another request deleted it while this one was waiting.
        const actualizado = await sequelize.transaction(async (t) => {
            const usuario = await Usuario.findByPk(userId, {
                attributes: ['id'],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!usuario) {
                return null;
            }

            // Read the vehicle again now that the lock is held
            const actual = await Vehiculo.findOne({ where: { id, userId }, transaction: t });
            if (!actual) {
                return null;
            }

            await Vehiculo.update(
                { isDefault: false },
                { where: { userId, isDefault: true }, transaction: t }
            );
            await actual.update({ isDefault: true }, { transaction: t });
            return actual;
        });

        if (!actualizado) {
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        return res.status(200).json({ message: 'Default vehicle updated successfully', vehicle: actualizado });
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

        // The deletion and the default reassignment happen in one transaction
        // that holds the user's row locked, the same lock registrar, marcarPredeterminado
        // and crear (reservations) take first (#267, #288).
        // Without it, a deletion running at the same time as a registration or
        // another deletion can leave the user without exactly one default
        // vehicle (HU-13 AC-04, HU-10 AC-09). The transaction returns null when
        // everything went well, or the error code to answer with.
        const fallo = await sequelize.transaction(async (t) => {
            const usuario = await Usuario.findByPk(userId, {
                attributes: ['id'],
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            if (!usuario) {
                return ErrorCodes.USER_NOT_FOUND;
            }

            // Read the vehicle again now that the lock is held: another request
            // may have deleted it, or changed which one is the default, while
            // this one was waiting.
            const actual = await Vehiculo.findOne({ where: { id, userId }, transaction: t });
            if (!actual) {
                return ErrorCodes.VEHICLE_NOT_FOUND;
            }

            // Block deletion if the vehicle has an active or pending reservation
            // (HU-13, AC-02). Checked here, with the lock held: crear takes the
            // same lock first (#288), so a reservation created at the same time
            // is either seen here or waits until the vehicle is gone.
            const reservaActiva = await Reserva.findOne({
                where: { vehicleId: id, status: ['Pending', 'Active'] },
                transaction: t,
            });
            if (reservaActiva) {
                return ErrorCodes.VEHICLE_HAS_ACTIVE_RESERVATION;
            }

            const eraDefault = actual.isDefault;
            await actual.destroy({ transaction: t }); // soft delete (paranoid: true on the model)

            // Reassign the default to the most recently registered remaining vehicle (HU-13, AC-04)
            if (eraDefault) {
                const siguiente = await Vehiculo.findOne({
                    where: { userId },
                    order: [['created_at', 'DESC']],
                    transaction: t,
                });
                if (siguiente) {
                    await siguiente.update({ isDefault: true }, { transaction: t });
                }
            }

            return null;
        });

        if (fallo === ErrorCodes.USER_NOT_FOUND) {
            return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
        }
        if (fallo === ErrorCodes.VEHICLE_NOT_FOUND) {
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }
        if (fallo === ErrorCodes.VEHICLE_HAS_ACTIVE_RESERVATION) {
            return res.status(409).json({
                code: ErrorCodes.VEHICLE_HAS_ACTIVE_RESERVATION,
                message: 'This vehicle has an active reservation. Please cancel the reservation before removing the vehicle.',
            });
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
