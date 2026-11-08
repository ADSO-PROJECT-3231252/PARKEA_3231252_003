const { Op } = require('sequelize');
const { Reserva, Zona, Vehiculo, Pago, ParkingSpot } = require('../models');
const { sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');
const { provisionalEndTime, openStayCharge, paidBeforeBalance, extensionCharge } = require('../utils/stayPricing');
const { validarMetodoPago, esRechazado, RECHAZADO } = require('../utils/simulatedPayment');

const DURACION_MIN_MS = 30 * 60 * 1000;
const DURACION_MAX_MS = 24 * 60 * 60 * 1000;
const ANTICIPACION_MAX_MS = 48 * 60 * 60 * 1000;

// HU-14: Reserve a Spot
async function crear(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const userId = req.usuario.id;
        const { zoneId, vehicleId, startTime, endTime, openEnded } = req.body;
        // HU-27: an open stay has no exit time; the route only lets a boolean through
        const isOpenStay = openEnded === true;

        if (!zoneId || !vehicleId || !startTime || (!isOpenStay && !endTime)) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'zoneId, vehicleId, startTime, and endTime are required' });
        }

        const start = new Date(startTime);
        // An open stay keeps entry + 24 h as a provisional exit time, so the
        // overlap check and the jobs work as with any other reservation
        const end = isOpenStay ? provisionalEndTime(start) : new Date(endTime);
        const now = new Date();
        // A value that is not a date ("abc") gives an invalid Date, and every
        // comparison below would let it through until the database rejects it
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.INVALID_DATE, message: 'startTime and endTime must be valid dates' });
        }

        if (start <= now) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.START_TIME_IN_PAST, message: 'The start time must be in the future' });
        }
        if (start - now > ANTICIPACION_MAX_MS) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.RESERVATION_TOO_FAR_AHEAD, message: 'Reservations can only be made up to 48 hours in advance' });
        }
        if (!isOpenStay && end <= start) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.END_BEFORE_START, message: 'The end time must be after the start time' });
        }

        const duracionMs = end - start;
        if (!isOpenStay && (duracionMs < DURACION_MIN_MS || duracionMs > DURACION_MAX_MS)) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.INVALID_DURATION, message: 'The reservation must last between 30 minutes and 24 hours' });
        }

        // HU-27 AC-12: an unpaid balance from an open stay blocks new reservations
        const saldoPendiente = await Pago.findOne({
            where: { type: 'balance', paymentStatus: 'Pending' },
            include: [{ model: Reserva, as: 'reservation', where: { userId }, attributes: [] }],
            transaction: t,
        });
        if (saldoPendiente) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.PENDING_BALANCE, message: 'You have a pending balance. Please pay it before making a new reservation' });
        }

        // Locked until the transaction ends: if the same vehicle is booked twice
        // at the same moment (double click, two tabs), the second request waits
        // here and the overlap check below then sees the first reservation
        const vehiculo = await Vehiculo.findOne({
            where: { id: vehicleId, userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!vehiculo) {
            await t.rollback();
            return res.status(404).json({ code: ErrorCodes.VEHICLE_NOT_FOUND, message: 'Vehicle not found' });
        }

        // Reject if this vehicle already has a Pending/Active reservation
        // that overlaps the requested time range
        const solapada = await Reserva.findOne({
            where: {
                vehicleId,
                status: ['Pending', 'Active'],
                startTime: { [Op.lt]: end },
                endTime: { [Op.gt]: start },
            },
            transaction: t,
        });
        if (solapada) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.VEHICLE_RESERVATION_OVERLAP, message: 'This vehicle already has a reservation for that time range' });
        }

        const zona = await Zona.findByPk(zoneId, { transaction: t });
        if (!zona) {
            await t.rollback();
            return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
        }
        if (!zona.isActive) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.ZONE_INACTIVE, message: 'This zone is no longer accepting reservations' });
        }

        // Lock and claim one available physical spot, skipping locked rows so two
        // concurrent requests never grab the same spot
        const cupo = await ParkingSpot.findOne({
            where: { zoneId, status: 'Available' },
            order: [['spotNumber', 'ASC']],
            transaction: t,
            lock: t.LOCK.UPDATE,
            skipLocked: true,
        });

        if (!cupo) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.NO_SPOTS_AVAILABLE, message: 'This spot is no longer available. Please select another zone or time.' });
        }

        const holdExpiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes from now

        const reserva = await Reserva.create({
            userId,
            zoneId,
            vehicleId,
            parkingSpotId: cupo.id,
            spotNumber: cupo.spotNumber,
            startTime: start,
            endTime: end,
            status: 'Pending',
            holdExpiresAt,
            appliedHourlyRate: zona.hourlyRate,
            openEnded: isOpenStay,
        }, { transaction: t });

        await cupo.update({ status: 'Occupied' }, { transaction: t });
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

// HU-27: the amounts of an open stay, as the screens show them. Before the
// entry it costs the first hour; while it runs, the started hours so far
// (AC-13, never the price of 24 hours); once finished, the final charge.
// `paid` adds the approved payments and `pendingBalance` is what is still owed.
// HU-28: a reservation switched to an open stay may have paid more than the
// first hour, so the charge counts what it really paid before the balance.
function resumenEstadiaAbierta(reserva, pagos, ahora = new Date()) {
    const lista = pagos || [];
    const pagado = lista
        .filter((p) => p.paymentStatus === 'Paid')
        .reduce((suma, p) => suma + Number(p.amount), 0);
    const saldo = lista.find((p) => p.type === 'balance' && p.paymentStatus === 'Pending');
    const empezo = new Date(reserva.startTime) <= ahora;
    const pagadoAntes = paidBeforeBalance(reserva, lista);

    let cobro;
    if (reserva.status === 'Finished') {
        cobro = openStayCharge(reserva, reserva.endTime, pagadoAntes);
    } else if (reserva.status === 'Active' && empezo) {
        cobro = openStayCharge(reserva, ahora, pagadoAntes);
    } else {
        cobro = openStayCharge(reserva, reserva.startTime, pagadoAntes);
    }

    return {
        started: empezo,
        usedMinutes: reserva.status === 'Active' || reserva.status === 'Finished' ? cobro.usedMinutes : 0,
        chargedHours: cobro.chargedHours,
        total: cobro.total,
        paid: Number(pagado.toFixed(2)),
        pendingBalance: saldo ? Number(saldo.amount) : 0,
    };
}

// HU-28 AC-09: what a reservation was charged before its balance: the initial
// payment and its extensions, also when they were refunded by a cancellation
// (the history keeps showing what was paid). `extensions` counts the approved
// extensions.
function resumenPagos(pagos = []) {
    const cobrados = pagos.filter((p) => p.type !== 'balance' && ['Paid', 'Refunded'].includes(p.paymentStatus));
    const total = cobrados.reduce((suma, p) => suma + Number(p.amount), 0);
    return {
        paidTotal: Number(total.toFixed(2)),
        extensions: cobrados.filter((p) => p.type === 'extension').length,
    };
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
                { model: Vehiculo, as: 'vehicle', paranoid: false },
                { model: Pago, as: 'payments', attributes: ['amount', 'paymentStatus', 'type'] },
            ],
        });

        if (!reserva) {
            return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
        }

        // HU-27: an open stay has no duration until it ends, and confirming it
        // costs only the first hour (AC-03)
        const estadiaAbierta = reserva.openEnded ? resumenEstadiaAbierta(reserva, reserva.payments) : null;
        const sinSalidaAun = reserva.openEnded && reserva.status !== 'Finished';

        const durationMs = new Date(reserva.endTime) - new Date(reserva.startTime);
        const durationHours = durationMs / (1000 * 60 * 60);
        const estimatedTotal = reserva.openEnded
            ? Number(Number(reserva.appliedHourlyRate).toFixed(2))
            : Number((durationHours * Number(reserva.appliedHourlyRate)).toFixed(2));
        const duracionMostrada = sinSalidaAun ? null : Number(durationHours.toFixed(2));
        const pagos = resumenPagos(reserva.payments);

        return res.status(200).json({
            reservation: {
                id: reserva.id,
                status: reserva.status,
                spotNumber: reserva.spotNumber,
                startTime: reserva.startTime,
                endTime: sinSalidaAun ? null : reserva.endTime,
                durationHours: duracionMostrada,
                holdExpiresAt: reserva.holdExpiresAt,
                openEnded: reserva.openEnded,
                openStay: estadiaAbierta,
                zone: {
                    id: reserva.zone.id,
                    name: reserva.zone.name,
                    address: reserva.zone.address,
                    hourlyRate: reserva.zone.hourlyRate,
                    latitude: reserva.zone.latitude,
                    longitude: reserva.zone.longitude,
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
                    hourlyRate: Number(reserva.appliedHourlyRate),
                    durationHours: reserva.openEnded ? 1 : duracionMostrada,
                    estimatedTotal,
                    // HU-28 AC-09: what was paid, extensions included
                    paidTotal: pagos.paidTotal,
                    extensions: pagos.extensions,
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
        // Lock the row: two cancel requests at the same time would otherwise
        // both see it as Pending/Active and add the spot back to the zone twice.
        // The second one waits here and then finds it already Cancelled.
        const reserva = await Reserva.findOne({
            where: { id, userId },
            include: [{ model: Pago, as: 'payments' }],
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!reserva) {
            await t.rollback();
            return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
        }
        const now = new Date();
        const yaEmpezo = new Date(reserva.startTime) <= now;
        if (yaEmpezo) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.RESERVATION_ALREADY_STARTED, message: 'This reservation has already started and cannot be cancelled' });
        }
        if (reserva.status !== 'Pending' && reserva.status !== 'Active') {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.RESERVATION_NOT_CANCELLABLE, message: `A reservation with status "${reserva.status}" cannot be cancelled` });
        }

        // Release the physical spot, not just the zone counter
        if (reserva.parkingSpotId) {
            const cupo = await ParkingSpot.findByPk(reserva.parkingSpotId, { transaction: t, lock: t.LOCK.UPDATE });
            if (cupo && cupo.status === 'Occupied') {
                await cupo.update({ status: 'Available' }, { transaction: t });
            }
        }

        const zona = await Zona.findByPk(reserva.zoneId, { transaction: t, lock: t.LOCK.UPDATE });
        await zona.increment('availableSlots', { by: 1, transaction: t });
        await reserva.update({ status: 'Cancelled' }, { transaction: t });
        // Before the entry, what was paid is refunded: the initial payment and
        // any extension paid in advance (HU-27 AC-14, HU-28). A balance only
        // exists after the stay ends, so there is none here.
        const reembolsables = reserva.payments.filter((p) => ['initial', 'extension'].includes(p.type) && p.paymentStatus === 'Paid');
        for (const pago of reembolsables) {
            await pago.update({ paymentStatus: 'Refunded' }, { transaction: t });
        }
        await t.commit();
        return res.status(200).json({ message: 'Reservation cancelled successfully' });
    } catch (error) {
        await t.rollback();
        next(error);
    }
}

// HU-27: Finish an open stay (AC-05 to AC-09)
async function terminar(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const userId = req.usuario.id;
        const expectedHours = req.body?.expectedHours;

        // Locked like in cancelar: two finish requests at the same time would
        // otherwise both release the spot and both create a balance
        const reserva = await Reserva.findOne({
            where: { id, userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!reserva) {
            await t.rollback();
            return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
        }
        if (!reserva.openEnded) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.NOT_AN_OPEN_STAY, message: 'Only a reservation without an exit time can be finished' });
        }
        if (reserva.status !== 'Active') {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.STAY_NOT_ACTIVE, message: `A stay with status "${reserva.status}" cannot be finished` });
        }
        const ahora = new Date();
        if (new Date(reserva.startTime) > ahora) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.STAY_NOT_STARTED, message: 'This stay has not started yet' });
        }

        // HU-28: what was paid before (the first hour, or more for a
        // reservation switched to an open stay) is subtracted from the charge
        const pagos = await Pago.findAll({ where: { reservationId: reserva.id }, transaction: t });
        const cobro = openStayCharge(reserva, ahora, paidBeforeBalance(reserva, pagos));
        // AC-06: the user confirmed the amount shown in the dialog. If another
        // hour started in the meantime, nothing is charged and the new amount
        // is sent back so it can be confirmed again.
        if (expectedHours !== undefined && expectedHours !== cobro.chargedHours) {
            await t.rollback();
            return res.status(409).json({
                code: ErrorCodes.STAY_AMOUNT_CHANGED,
                message: 'Another hour started while confirming. Please check the new amount',
                charge: { usedMinutes: cobro.usedMinutes, chargedHours: cobro.chargedHours, total: cobro.total, paid: cobro.paid, balance: cobro.balance },
            });
        }

        // AC-09: real exit time, Finished and the spot released, in one transaction
        if (reserva.parkingSpotId) {
            const cupo = await ParkingSpot.findByPk(reserva.parkingSpotId, { transaction: t, lock: t.LOCK.UPDATE });
            if (cupo && cupo.status === 'Occupied') {
                await cupo.update({ status: 'Available' }, { transaction: t });
            }
        }
        const zona = await Zona.findByPk(reserva.zoneId, { transaction: t, lock: t.LOCK.UPDATE });
        await zona.increment('availableSlots', { by: 1, transaction: t });
        await reserva.update({ endTime: cobro.endTime, status: 'Finished' }, { transaction: t });

        // AC-07/AC-08: what was paid is subtracted; under one hour nothing is owed
        if (cobro.balance > 0) {
            await Pago.create({
                reservationId: reserva.id,
                amount: cobro.balance,
                paymentStatus: 'Pending',
                type: 'balance',
            }, { transaction: t });
        }

        await t.commit();
        return res.status(200).json({
            message: 'Stay finished successfully',
            charge: {
                endTime: cobro.endTime,
                usedMinutes: cobro.usedMinutes,
                chargedHours: cobro.chargedHours,
                total: cobro.total,
                paid: cobro.paid,
                balance: cobro.balance,
            },
        });
    } catch (error) {
        await t.rollback();
        next(error);
    }
}

// HU-28: Extend a stay. Either a later exit time, paid at that moment
// (AC-06), or a switch to an open stay, paid when it ends (AC-07).
// PATCH /api/reservations/:id/extend
// { fromEndTime, newEndTime, paymentMethod, cardLastFour } or { fromEndTime, openEnded: true }
async function ampliar(req, res, next) {
    const t = await sequelize.transaction();
    try {
        const { id } = req.params;
        const userId = req.usuario.id;
        const { fromEndTime, newEndTime, openEnded } = req.body;
        const aTiempoIndefinido = openEnded === true;

        // Locked: two extensions at the same time (double click, two tabs)
        // would otherwise both start from the same exit time and both be paid
        const reserva = await Reserva.findOne({
            where: { id, userId },
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        if (!reserva) {
            await t.rollback();
            return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
        }
        // AC-01: only a paid reservation that has not ended
        if (reserva.status !== 'Active') {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.STAY_NOT_ACTIVE, message: `A reservation with status "${reserva.status}" cannot be extended` });
        }
        if (reserva.openEnded) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.ALREADY_OPEN_STAY, message: 'This reservation has no exit time; finish it when you leave' });
        }
        const ahora = new Date();
        const salidaActual = new Date(reserva.endTime);
        if (salidaActual <= ahora) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.EXIT_TIME_PASSED, message: 'The exit time of this reservation has already passed' });
        }
        // The exit time the user saw. If it changed in the meantime (another
        // tab extended it), nothing is charged and the current one is sent back.
        if (new Date(fromEndTime).getTime() !== salidaActual.getTime()) {
            await t.rollback();
            return res.status(409).json({
                code: ErrorCodes.RESERVATION_CHANGED,
                message: 'This reservation changed while you were extending it. Please check it again',
                reservation: { endTime: reserva.endTime, openEnded: reserva.openEnded },
            });
        }

        const inicio = new Date(reserva.startTime);
        // AC-07: an open stay keeps entry + 24 h as its provisional exit time
        const salidaNueva = aTiempoIndefinido ? provisionalEndTime(inicio) : new Date(newEndTime);
        if (!aTiempoIndefinido && salidaNueva <= salidaActual) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.EXTENSION_NOT_LATER, message: 'The new exit time must be later than the current one' });
        }
        // AC-03: never more than 24 hours from the entry
        if (salidaNueva - inicio > DURACION_MAX_MS) {
            await t.rollback();
            return res.status(400).json({ code: ErrorCodes.EXTENSION_TOO_LONG, message: 'The stay cannot last more than 24 hours from the entry' });
        }

        let cobro = null;
        if (!aTiempoIndefinido) {
            const errorMetodo = validarMetodoPago(req.body);
            if (errorMetodo) {
                await t.rollback();
                return res.status(errorMetodo.status).json(errorMetodo.body);
            }
        }

        // AC-04: the same vehicle cannot have another reservation in the
        // added time. The vehicle row is locked like when a reservation is
        // created, so a new reservation for it waits until this one ends.
        await Vehiculo.findOne({
            where: { id: reserva.vehicleId },
            paranoid: false,
            transaction: t,
            lock: t.LOCK.UPDATE,
        });
        const solapada = await Reserva.findOne({
            where: {
                id: { [Op.ne]: reserva.id },
                vehicleId: reserva.vehicleId,
                status: ['Pending', 'Active'],
                startTime: { [Op.lt]: salidaNueva },
                endTime: { [Op.gt]: salidaActual },
            },
            transaction: t,
        });
        if (solapada) {
            await t.rollback();
            return res.status(409).json({ code: ErrorCodes.VEHICLE_RESERVATION_OVERLAP, message: 'This vehicle already has a reservation for that time range' });
        }

        if (!aTiempoIndefinido) {
            // AC-06: the new exit time is saved only if the payment is approved
            if (esRechazado(req.body)) {
                await t.rollback();
                return res.status(402).json(RECHAZADO);
            }
            cobro = extensionCharge(reserva, salidaActual, salidaNueva);
            await Pago.create({
                reservationId: reserva.id,
                amount: cobro.amount,
                paymentStatus: 'Paid',
                paymentMethod: req.body.paymentMethod,
                cardLastFour: req.body.paymentMethod === 'card' ? req.body.cardLastFour : null,
                paidAt: new Date(),
                type: 'extension',
            }, { transaction: t });
        }

        // AC-05: the same spot; it stays Occupied until the stay ends
        await reserva.update({ endTime: salidaNueva, openEnded: aTiempoIndefinido }, { transaction: t });
        await t.commit();

        return res.status(200).json({
            message: aTiempoIndefinido ? 'The reservation is now an open stay' : 'Stay extended successfully',
            reservation: { id: reserva.id, endTime: aTiempoIndefinido ? null : salidaNueva, openEnded: aTiempoIndefinido },
            charge: cobro,
        });
    } catch (error) {
        await t.rollback();
        next(error);
    }
}

// HU-18: View Booking History
async function misReservas(req, res, next) {
    try {
        const userId = req.usuario.id;
        const { status } = req.query;

        const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
        const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 10, 1), 100);
        const offset = (page - 1) * limit;

        const where = { userId };
        if (status && status !== 'All') {
            where.status = status;
        }

        const { count, rows } = await Reserva.findAndCountAll({
            where,
            order: [['startTime', 'DESC']],
            limit,
            offset,
            // With several payments per reservation the count must not
            // multiply the rows (one per payment)
            distinct: true,
            include: [
                { model: Zona, as: 'zone', attributes: ['id', 'name', 'address'] },
                { model: Vehiculo, as: 'vehicle', paranoid: false, attributes: ['id', 'plate', 'brand', 'model', 'color'] },
                { model: Pago, as: 'payments', attributes: ['amount', 'paymentStatus', 'type'] },
            ],
        });

        const ahora = new Date();
        const reservations = rows.map((r) => {
            const pagoInicial = r.payments.find((p) => p.type === 'initial');
            const yaTienePago = pagoInicial && ['Paid', 'Refunded'].includes(pagoInicial.paymentStatus);
            // HU-28 AC-09: the initial payment plus its extensions
            const pagos = resumenPagos(r.payments);

            let amount;
            let amountType;
            let openStay = null;
            if (r.openEnded) {
                // HU-27 AC-13: the amount so far while it runs, never 24 hours
                openStay = resumenEstadiaAbierta(r, r.payments, ahora);
                amount = openStay.total;
                if (r.status === 'Active' && openStay.started) {
                    amountType = 'so_far';
                } else if (yaTienePago) {
                    amountType = 'paid';
                    // Before the entry (or cancelled), what it paid: the first
                    // hour, or more if it was switched to an open stay (HU-28)
                    if (r.status !== 'Finished') amount = Math.max(pagos.paidTotal, openStay.total);
                } else {
                    amountType = 'estimated';
                }
            } else if (yaTienePago) {
                amount = pagos.paidTotal;
                amountType = 'paid';
            } else {
                const horas = (new Date(r.endTime) - new Date(r.startTime)) / (1000 * 60 * 60);
                amount = Number((horas * Number(r.appliedHourlyRate)).toFixed(2));
                amountType = 'estimated';
            }

            const sinSalidaAun = r.openEnded && r.status !== 'Finished';
            return {
                id: r.id,
                status: r.status,
                spotNumber: r.spotNumber,
                startTime: r.startTime,
                endTime: sinSalidaAun ? null : r.endTime,
                openEnded: r.openEnded,
                openStay,
                zone: r.zone,
                vehicle: r.vehicle,
                amount,
                amountType,
                extensions: pagos.extensions,
                appliedHourlyRate: Number(r.appliedHourlyRate),
                paymentStatus: pagoInicial ? pagoInicial.paymentStatus : 'Pending',
            };
        });

        return res.status(200).json({
            reservations,
            pagination: {
                page,
                limit,
                total: count,
                totalPages: Math.ceil(count / limit),
            },
        });
    } catch (error) {
        next(error);
    }
}

module.exports = { crear, obtenerConfirmacion, cancelar, terminar, ampliar, misReservas };
