const { Reserva, Zona, Vehiculo, Pago } = require('../models');
const { sequelize } = require('../models');

// HU-14: Reserve a Spot
async function crear(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const userId = req.usuario.id;
        const { zoneId, vehicleId, startTime, endTime } = req.body;

        if (!zoneId || !vehicleId || !startTime || !endTime) {
            await t.rollback();
            return res.status(400).json({ message: 'zoneId, vehicleId, startTime, and endTime are required' });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);
        const now = new Date();

        if (start <= now) {
            await t.rollback();
            return res.status(400).json({ message: 'The start time must be in the future' });
        }
        if (end <= start) {
            await t.rollback();
            return res.status(400).json({ message: 'The end time must be after the start time' });
        }

        // Confirm the vehicle belongs to this user
        const vehiculo = await Vehiculo.findOne({ where: { id: vehicleId, userId }, transaction: t });
        if (!vehiculo) {
            await t.rollback();
            return res.status(404).json({ message: 'Vehicle not found' });
        }

        // Lock the zone row to prevent a race condition on availableSlots
        const zona = await Zona.findByPk(zoneId, { transaction: t, lock: t.LOCK.UPDATE });
        if (!zona) {
            await t.rollback();
            return res.status(404).json({ message: 'Zone not found' });
        }
        if (zona.availableSlots <= 0) {
            await t.rollback();
            return res.status(409).json({ message: 'This spot is no longer available. Please select another zone or time.' });
        }

        const spotNumber = zona.totalSlots - zona.availableSlots + 1;

        const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutos desde ahora

        const reserva = await Reserva.create({
            userId,
            zoneId,
            vehicleId,
            spotNumber,
            startTime: start,
            endTime: end,
            status: 'Pending',
            holdExpiresAt,
            appliedHourlyRate: zona.hourlyRate,
        }, { transaction: t });

        await zona.decrement('availableSlots', { by: 1, transaction: t });

        await t.commit();

        const reservaCompleta = await Reserva.findByPk(reserva.id, {
            include: [
                { model: Zona, as: 'zone' },
                { model: Vehiculo, as: 'vehicle' },
            ],
        });

        return res.status(201).json({ message: 'Reservation created successfully', reservation: reservaCompleta });
    } catch (error) {
        await t.rollback();
        next(error);
    }
}

// HU-15: View Reservation Confirmation
async function obtenerConfirmacion(req, res, next) {
    try {
        const { id } = req.params;
        const userId = req.usuario.id;

        const reserva = await Reserva.findOne({
            where: { id, userId },
            include: [
                { model: Zona, as: 'zone' },
                { model: Vehiculo, as: 'vehicle' },
            ],
        });

        if (!reserva) {
            return res.status(404).json({ message: 'Reservation not found' });
        }

        const durationMs = new Date(reserva.endTime) - new Date(reserva.startTime);
        const durationHours = durationMs / (1000 * 60 * 60);
        const estimatedTotal = Number((durationHours * reserva.zone.hourlyRate).toFixed(2));

        return res.status(200).json({
            reservation: {
                id: reserva.id,
                status: reserva.status,
                spotNumber: reserva.spotNumber,
                startTime: reserva.startTime,
                endTime: reserva.endTime,
                durationHours: Number(durationHours.toFixed(2)),
                zone: {
                    id: reserva.zone.id,
                    name: reserva.zone.name,
                    address: reserva.zone.address,
                    hourlyRate: reserva.zone.hourlyRate,
                },
                vehicle: {
                    id: reserva.vehicle.id,
                    plate: reserva.vehicle.plate,
                    brand: reserva.vehicle.brand,
                    model: reserva.vehicle.model,
                    color: reserva.vehicle.color,
                },
                paymentSummary: {
                    zoneName: reserva.zone.name,
                    spotNumber: reserva.spotNumber,
                    hourlyRate: reserva.zone.hourlyRate,
                    durationHours: Number(durationHours.toFixed(2)),
                    estimatedTotal,
                },
            },
        });
    } catch (error) {
        next(error);
    }
}

// HU-16: Cancel a Reservation
async function cancelar(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const userId = req.usuario.id;
        const reserva = await Reserva.findOne({
            where: { id, userId },
            include: [{ model: Pago, as: 'payment' }],
            transaction: t,
        });
        if (!reserva) {
            await t.rollback();
            return res.status(404).json({ message: 'Reservation not found' });
        }
        const now = new Date();
        const yaEmpezo = new Date(reserva.startTime) <= now;
        if (yaEmpezo) {
            await t.rollback();
            return res.status(409).json({ message: 'This reservation has already started and cannot be cancelled' });
        }
        if (reserva.status !== 'Pending' && reserva.status !== 'Active') {
            await t.rollback();
            return res.status(409).json({ message: `A reservation with status "${reserva.status}" cannot be cancelled` });
        }
        // Lock the zone row before releasing the slot
        const zona = await Zona.findByPk(reserva.zoneId, { transaction: t, lock: t.LOCK.UPDATE });
        await zona.increment('availableSlots', { by: 1, transaction: t });
        await reserva.update({ status: 'Cancelled' }, { transaction: t });
        if (reserva.payment && reserva.payment.paymentStatus === 'Paid') {
            await reserva.payment.update({ paymentStatus: 'Refunded' }, { transaction: t });
        }
        await t.commit();
        return res.status(200).json({ message: 'Reservation cancelled successfully' });
    } catch (error) {
        await t.rollback();
        next(error);
    }
}

module.exports = { crear, obtenerConfirmacion, cancelar };