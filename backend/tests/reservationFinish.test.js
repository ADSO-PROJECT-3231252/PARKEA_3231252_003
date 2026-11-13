const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-27: finishing an open stay. The times are in Colombia (UTC-5), and "now"
// is Monday 2026-11-16 at 8:00 a. m. The rate is $ 2.000 per hour and the
// first hour was paid when the stay was confirmed (AC-03).
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const NOW = colombia('08:00');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const SPOT_ID = '55555555-5555-4555-8555-555555555555';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

let transaction;
let findReservation;
let createPayment;
let spot;
let zona;

const paid = (type, amount) => ({ type, amount, paymentStatus: 'Paid' });

// An open stay that started at 6:00 a. m. (two hours ago), unless the test
// changes it. Its saved exit time is the provisional one (entry + 24 h).
function stay(values = {}) {
    return {
        id: RESERVATION_ID,
        userId: USER_ID,
        zoneId: ZONE_ID,
        parkingSpotId: SPOT_ID,
        status: 'Active',
        openEnded: true,
        startTime: colombia('06:00'),
        endTime: new Date('2026-11-17T06:00:00-05:00'),
        appliedHourlyRate: '2000.00',
        update: jest.fn(),
        ...values,
    };
}

function arrange(reserva = stay(), payments = [paid('initial', '2000.00')]) {
    findReservation = jest.spyOn(Reserva, 'findOne').mockResolvedValue(reserva);
    jest.spyOn(Pago, 'findAll').mockResolvedValue(payments);
    createPayment = jest.spyOn(Pago, 'create').mockResolvedValue({});
    spot = { id: SPOT_ID, status: 'Occupied', update: jest.fn() };
    jest.spyOn(ParkingSpot, 'findByPk').mockResolvedValue(spot);
    zona = { id: ZONE_ID, increment: jest.fn() };
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    return reserva;
}

const finish = (body = {}) => request(app)
    .patch(`/api/reservations/${RESERVATION_ID}/finish`)
    .set('Authorization', `Bearer ${token}`)
    .send(body);

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

// The stay was not finished: nothing changed and nothing was charged
function expectNothingSaved(reserva) {
    expect(reserva.update).not.toHaveBeenCalled();
    expect(createPayment).not.toHaveBeenCalled();
    expect(zona.increment).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
}

describe('When an open stay can be finished (HU-27, AC-05)', () => {
    test('a reservation of another user answers 404 RESERVATION_NOT_FOUND', async () => {
        // Arrange
        arrange(null);

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
        expect(findReservation).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RESERVATION_ID, userId: USER_ID }, transaction, lock: 'UPDATE' }));
    });

    test('a reservation with an exit time answers 409 NOT_AN_OPEN_STAY', async () => {
        // Arrange
        const reserva = arrange(stay({ openEnded: false }));

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NOT_AN_OPEN_STAY');
        expectNothingSaved(reserva);
    });

    test.each(['Pending', 'Finished', 'Cancelled'])('a stay with status %s answers 409 STAY_NOT_ACTIVE', async (status) => {
        // Arrange
        const reserva = arrange(stay({ status }));

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STAY_NOT_ACTIVE');
        expectNothingSaved(reserva);
    });

    test('a paid stay whose entry time has not come answers 409 STAY_NOT_STARTED', async () => {
        // Arrange
        const reserva = arrange(stay({ startTime: colombia('09:00') }));

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STAY_NOT_STARTED');
        expectNothingSaved(reserva);
    });

    test.each([0, 25, 'two'])('expectedHours %p answers 400 VALIDATION_ERROR', async (expectedHours) => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await finish({ expectedHours });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(reserva.update).not.toHaveBeenCalled();
    });
});

describe('The amount the user confirmed (HU-27, AC-06)', () => {
    test('if another hour started while confirming, it answers 409 STAY_AMOUNT_CHANGED with the new amount and charges nothing', async () => {
        // Arrange: the dialog showed 1 hour, but 2 hours have started
        const reserva = arrange();

        // Act
        const res = await finish({ expectedHours: 1 });

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('STAY_AMOUNT_CHANGED');
        expect(res.body.charge).toEqual({ usedMinutes: 120, chargedHours: 2, total: 4000, paid: 2000, balance: 2000 });
        expectNothingSaved(reserva);
    });

    test('the same hours the dialog showed finish the stay', async () => {
        // Arrange
        arrange();

        // Act
        const res = await finish({ expectedHours: 2 });

        // Assert
        expect(res.status).toBe(200);
    });
});

describe('Finishing an open stay (HU-27, AC-07 to AC-09)', () => {
    test('it is Finished at this moment, the spot is Available and the zone gets the slot back', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(200);
        expect(reserva.update).toHaveBeenCalledWith({ endTime: NOW, status: 'Finished' }, { transaction });
        expect(spot.update).toHaveBeenCalledWith({ status: 'Available' }, { transaction });
        expect(zona.increment).toHaveBeenCalledWith('availableSlots', { by: 1, transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('every started hour is charged and what was already paid becomes a pending balance for the rest', async () => {
        // Arrange: 2 hours and 1 minute are 3 hours; the first one was paid
        jest.setSystemTime(colombia('08:01'));
        arrange();

        // Act
        const res = await finish();

        // Assert
        expect(res.body.charge).toMatchObject({ usedMinutes: 121, chargedHours: 3, total: 6000, paid: 2000, balance: 4000 });
        expect(createPayment).toHaveBeenCalledWith({
            reservationId: RESERVATION_ID,
            amount: 4000,
            paymentStatus: 'Pending',
            type: 'balance',
        }, { transaction });
    });

    test('a stay shorter than one hour owes nothing more (AC-08)', async () => {
        // Arrange
        arrange(stay({ startTime: colombia('07:20') }));

        // Act
        const res = await finish();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.charge).toMatchObject({ chargedHours: 1, total: 2000, balance: 0 });
        expect(createPayment).not.toHaveBeenCalled();
    });

    test('a reservation switched to an open stay subtracts everything it paid and never refunds the rest (HU-28, AC-07)', async () => {
        // Arrange: it paid 3 hours (initial + extension) and used 2
        arrange(stay(), [paid('initial', '2000.00'), paid('extension', '4000.00')]);

        // Act
        const res = await finish();

        // Assert
        expect(res.body.charge).toMatchObject({ chargedHours: 2, total: 6000, paid: 6000, balance: 0 });
        expect(createPayment).not.toHaveBeenCalled();
    });

    test('the payments are read inside the transaction of the locked stay', async () => {
        // Arrange
        arrange();

        // Act
        await finish();

        // Assert
        expect(Pago.findAll).toHaveBeenCalledWith({ where: { reservationId: RESERVATION_ID }, transaction });
    });
});
