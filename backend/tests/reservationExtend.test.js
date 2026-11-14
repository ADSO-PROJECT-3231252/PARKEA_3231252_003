const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Zona, ZoneSchedule, Reserva, Pago, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-28: extending a stay. The zone is open 24 hours here; the closing time
// of a zone is tested in reservationHours.test.js. The times are in Colombia
// (UTC-5), "now" is Monday 2026-11-16 at 8:00 a. m. and the rate is $ 2.000
// per hour.
const colombia = (time, date = '2026-11-16') => new Date(`${date}T${time}:00-05:00`);
const NOW = colombia('08:00');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

let transaction;
let findReservation;
let lockVehicle;
let readZone;
let createPayment;

// A paid stay from 7:00 a. m. to 9:00 a. m. (it is running now), unless the
// test changes it
function stay(values = {}) {
    return {
        id: RESERVATION_ID,
        userId: USER_ID,
        zoneId: ZONE_ID,
        vehicleId: VEHICLE_ID,
        status: 'Active',
        openEnded: false,
        startTime: colombia('07:00'),
        endTime: colombia('09:00'),
        appliedHourlyRate: '2000.00',
        update: jest.fn(),
        ...values,
    };
}

// The first findOne reads the stay; the next one is the overlap check
function arrange(reserva = stay(), overlap = null) {
    findReservation = jest.spyOn(Reserva, 'findOne').mockResolvedValueOnce(reserva).mockResolvedValue(overlap);
    lockVehicle = jest.spyOn(Vehiculo, 'findOne').mockResolvedValue({ id: VEHICLE_ID });
    const zona = Zona.build(
        { id: ZONE_ID, name: 'Centro', hourlyRate: '2000.00', isActive: true, open24h: true, schedules: [] },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
    readZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    createPayment = jest.spyOn(Pago, 'create').mockResolvedValue({});
    return reserva;
}

// The exit time the user saw is 9:00 a. m. unless the test sends another one
const extend = (body) => request(app)
    .patch(`/api/reservations/${RESERVATION_ID}/extend`)
    .set('Authorization', `Bearer ${token}`)
    .send({ fromEndTime: colombia('09:00').toISOString(), ...body });

const payByCard = (newEndTime, cardLastFour = '4242') => extend({ newEndTime: newEndTime.toISOString(), paymentMethod: 'card', cardLastFour });

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session of the user (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

// The stay was not extended and nothing was charged
function expectNothingSaved(reserva) {
    expect(reserva.update).not.toHaveBeenCalled();
    expect(createPayment).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
}

describe('When a stay can be extended (HU-28, AC-01)', () => {
    test('a reservation of another user answers 404 RESERVATION_NOT_FOUND', async () => {
        // Arrange
        arrange(null);

        // Act
        const res = await payByCard(colombia('10:00'));

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
        expect(findReservation).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RESERVATION_ID, userId: USER_ID }, transaction, lock: 'UPDATE' }));
    });

    test.each(['Pending', 'Finished', 'Cancelled', 'Expired'])('a reservation with status %s answers 409 STAY_NOT_ACTIVE', async (status) => {
        // Arrange
        const reserva = arrange(stay({ status }));

        // Act
        const res = await payByCard(colombia('10:00'));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STAY_NOT_ACTIVE');
        expectNothingSaved(reserva);
    });

    test('an open stay answers 409 ALREADY_OPEN_STAY', async () => {
        // Arrange
        const reserva = arrange(stay({ openEnded: true }));

        // Act
        const res = await payByCard(colombia('10:00'));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ALREADY_OPEN_STAY');
        expectNothingSaved(reserva);
    });

    test('a stay whose exit time is now answers 409 EXIT_TIME_PASSED', async () => {
        // Arrange
        const reserva = arrange(stay({ startTime: colombia('06:00'), endTime: NOW }));

        // Act
        const res = await extend({ fromEndTime: NOW.toISOString(), newEndTime: colombia('10:00').toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('EXIT_TIME_PASSED');
        expectNothingSaved(reserva);
    });

    test('if the exit time changed in another tab, it answers 409 RESERVATION_CHANGED with the current one', async () => {
        // Arrange: the screen still shows 8:30 a. m., but the stay ends at 9:00 a. m.
        const reserva = arrange();

        // Act
        const res = await extend({ fromEndTime: colombia('08:30').toISOString(), newEndTime: colombia('10:00').toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('RESERVATION_CHANGED');
        expect(res.body.reservation).toEqual({ endTime: colombia('09:00').toISOString(), openEnded: false });
        expectNothingSaved(reserva);
    });
});

describe('The new exit time (HU-28, AC-02 and AC-03)', () => {
    test.each([
        ['the same as the current one', '09:00'],
        ['before the current one', '08:30'],
    ])('a new exit time %s answers 400 EXTENSION_NOT_LATER', async (name, newEndTime) => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await payByCard(colombia(newEndTime));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('EXTENSION_NOT_LATER');
        expectNothingSaved(reserva);
    });

    test('24 hours after the entry is accepted', async () => {
        // Arrange
        arrange();

        // Act
        const res = await payByCard(colombia('07:00', '2026-11-17'));

        // Assert
        expect(res.status).toBe(200);
    });

    test('more than 24 hours after the entry answers 400 EXTENSION_TOO_LONG', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await payByCard(colombia('07:01', '2026-11-17'));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('EXTENSION_TOO_LONG');
        expectNothingSaved(reserva);
    });

    test.each([
        ['without the exit time the user saw', { fromEndTime: undefined, newEndTime: colombia('10:00').toISOString() }],
        ['without a new exit time', { paymentMethod: 'pse' }],
        ['with a new exit time and an open stay at once', { newEndTime: colombia('10:00').toISOString(), openEnded: true }],
        ['with openEnded false', { openEnded: false, newEndTime: colombia('10:00').toISOString(), paymentMethod: 'pse' }],
    ])('a request %s answers 400 VALIDATION_ERROR', async (name, body) => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await extend(body);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(reserva.update).not.toHaveBeenCalled();
    });
});

describe('Paying an extension (HU-28, AC-04 to AC-06)', () => {
    test('a payment method that does not exist answers 400 INVALID_PAYMENT_METHOD', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await extend({ newEndTime: colombia('10:00').toISOString(), paymentMethod: 'cash' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PAYMENT_METHOD');
        expectNothingSaved(reserva);
    });

    test('a card without its last 4 digits answers 400 CARD_DIGITS_REQUIRED', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await payByCard(colombia('10:00'), '42');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CARD_DIGITS_REQUIRED');
        expectNothingSaved(reserva);
    });

    test('a declined card answers 402 PAYMENT_DECLINED and the exit time does not change', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await payByCard(colombia('10:00'), '0002');

        // Assert
        expect(res.status).toBe(402);
        expect(res.body.code).toBe('PAYMENT_DECLINED');
        expectNothingSaved(reserva);
    });

    test('another reservation of the vehicle in the added time answers 409 VEHICLE_RESERVATION_OVERLAP', async () => {
        // Arrange
        const reserva = arrange(stay(), { id: 'next-reservation' });

        // Act
        const res = await payByCard(colombia('10:00'));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('VEHICLE_RESERVATION_OVERLAP');
        expectNothingSaved(reserva);
    });

    test('the overlap check leaves this stay out and looks only at the added time', async () => {
        // Arrange
        arrange();

        // Act
        await payByCard(colombia('10:00'));

        // Assert
        const { where } = findReservation.mock.calls[1][0];
        expect(where.id[Op.ne]).toBe(RESERVATION_ID);
        expect(where.vehicleId).toBe(VEHICLE_ID);
        expect(where.status).toEqual(['Pending', 'Active']);
        expect(where.startTime[Op.lt]).toEqual(colombia('10:00'));
        expect(where.endTime[Op.gt]).toEqual(colombia('09:00'));
    });

    test('the vehicle is locked before the zone is read and before the overlap check', async () => {
        // Arrange
        arrange();

        // Act
        await payByCard(colombia('10:00'));

        // Assert
        expect(lockVehicle).toHaveBeenCalledWith(expect.objectContaining({ where: { id: VEHICLE_ID }, transaction, lock: 'UPDATE' }));
        const vehicleLocked = lockVehicle.mock.invocationCallOrder[0];
        expect(vehicleLocked).toBeLessThan(readZone.mock.invocationCallOrder[0]);
        expect(vehicleLocked).toBeLessThan(findReservation.mock.invocationCallOrder[1]);
    });

    test('20 minutes more are charged as 1 hour, with the card, and the new exit time is saved', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await payByCard(colombia('09:20'));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.charge).toEqual({ hours: 1, amount: 2000 });
        expect(createPayment).toHaveBeenCalledWith({
            reservationId: RESERVATION_ID,
            amount: 2000,
            paymentStatus: 'Paid',
            paymentMethod: 'card',
            cardLastFour: '4242',
            paidAt: NOW,
            type: 'extension',
        }, { transaction });
        expect(reserva.update).toHaveBeenCalledWith({ endTime: colombia('09:20'), openEnded: false }, { transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('2 hours and 10 minutes more are charged as 3 hours, and PSE keeps no card digits', async () => {
        // Arrange
        arrange();

        // Act
        const res = await extend({ newEndTime: colombia('11:10').toISOString(), paymentMethod: 'pse', cardLastFour: '4242' });

        // Assert
        expect(res.status).toBe(200);
        expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ amount: 6000, paymentMethod: 'pse', cardLastFour: null }), { transaction });
    });
});

describe('Switching to an open stay (HU-28, AC-07)', () => {
    test('nothing is charged now, and the exit time becomes the provisional one (entry + 24 hours)', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await extend({ openEnded: true });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation).toEqual({ id: RESERVATION_ID, endTime: null, openEnded: true });
        expect(res.body.charge).toBeNull();
        expect(createPayment).not.toHaveBeenCalled();
        expect(reserva.update).toHaveBeenCalledWith({ endTime: colombia('07:00', '2026-11-17'), openEnded: true }, { transaction });
    });
});
