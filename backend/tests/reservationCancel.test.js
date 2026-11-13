const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, Reserva, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-16: cancelling a reservation before its entry time. The times are in
// Colombia (UTC-5), and "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const NOW = colombia('08:00');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const SPOT_ID = '55555555-5555-4555-8555-555555555555';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

let transaction;
let findReservation;
let spot;
let zona;

// A payment of the reservation, with its own update spy
const payment = (type, paymentStatus) => ({ type, paymentStatus, update: jest.fn() });

// A paid reservation from 10:00 a. m. to 12:00 p. m., unless the test changes it
function reservation(values = {}) {
    return {
        id: RESERVATION_ID,
        userId: USER_ID,
        zoneId: ZONE_ID,
        parkingSpotId: SPOT_ID,
        status: 'Active',
        startTime: colombia('10:00'),
        endTime: colombia('12:00'),
        payments: [payment('initial', 'Paid')],
        update: jest.fn(),
        ...values,
    };
}

function arrange(reserva = reservation()) {
    findReservation = jest.spyOn(Reserva, 'findOne').mockResolvedValue(reserva);
    spot = { id: SPOT_ID, status: 'Occupied', update: jest.fn() };
    jest.spyOn(ParkingSpot, 'findByPk').mockResolvedValue(spot);
    zona = { id: ZONE_ID, increment: jest.fn() };
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    return reserva;
}

const cancel = () => request(app).patch(`/api/reservations/${RESERVATION_ID}/cancel`).set('Authorization', `Bearer ${token}`);

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

describe('When a reservation can be cancelled (HU-16)', () => {
    test('a reservation of another user answers 404 RESERVATION_NOT_FOUND', async () => {
        // Arrange: the reservation is only searched among the ones of this user
        arrange(null);

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('RESERVATION_NOT_FOUND');
        expect(findReservation).toHaveBeenCalledWith(expect.objectContaining({ where: { id: RESERVATION_ID, userId: USER_ID } }));
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('the reservation is read with a lock, so two cancellations at once cannot both give the spot back', async () => {
        // Arrange
        arrange();

        // Act
        await cancel();

        // Assert
        expect(findReservation).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: 'UPDATE' }));
    });

    test.each([
        ['at its entry time', '08:00'],
        ['after its entry time', '07:00'],
    ])('a reservation %s answers 409 RESERVATION_ALREADY_STARTED', async (name, startTime) => {
        // Arrange
        const reserva = arrange(reservation({ startTime: colombia(startTime) }));

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('RESERVATION_ALREADY_STARTED');
        expect(reserva.update).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test.each(['Cancelled', 'Expired', 'Finished'])('a reservation with status %s answers 409 RESERVATION_NOT_CANCELLABLE', async (status) => {
        // Arrange
        const reserva = arrange(reservation({ status }));

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('RESERVATION_NOT_CANCELLABLE');
        expect(reserva.update).not.toHaveBeenCalled();
        expect(zona.increment).not.toHaveBeenCalled();
    });

    test('a reservation that is not paid yet (Pending) can be cancelled', async () => {
        // Arrange
        const reserva = arrange(reservation({ status: 'Pending', payments: [] }));

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(200);
        expect(reserva.update).toHaveBeenCalledWith({ status: 'Cancelled' }, { transaction });
    });
});

describe('Cancelling a reservation (HU-16)', () => {
    test('it is Cancelled, its spot is Available again and the zone gets the slot back, in one transaction', async () => {
        // Arrange
        const reserva = arrange();

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(200);
        expect(reserva.update).toHaveBeenCalledWith({ status: 'Cancelled' }, { transaction });
        expect(spot.update).toHaveBeenCalledWith({ status: 'Available' }, { transaction });
        expect(zona.increment).toHaveBeenCalledWith('availableSlots', { by: 1, transaction });
        expect(transaction.commit).toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
    });

    test('a spot that is no longer Occupied is left as it is', async () => {
        // Arrange
        arrange();
        spot.status = 'Available';

        // Act
        const res = await cancel();

        // Assert
        expect(res.status).toBe(200);
        expect(spot.update).not.toHaveBeenCalled();
    });

    test('the initial payment and the paid extensions are refunded (HU-27 AC-14, HU-28)', async () => {
        // Arrange
        const initial = payment('initial', 'Paid');
        const extension = payment('extension', 'Paid');
        arrange(reservation({ payments: [initial, extension] }));

        // Act
        await cancel();

        // Assert
        expect(initial.update).toHaveBeenCalledWith({ paymentStatus: 'Refunded' }, { transaction });
        expect(extension.update).toHaveBeenCalledWith({ paymentStatus: 'Refunded' }, { transaction });
    });

    test('a payment that was not approved is not refunded', async () => {
        // Arrange
        const notApproved = payment('initial', 'Pending');
        arrange(reservation({ payments: [notApproved] }));

        // Act
        await cancel();

        // Assert
        expect(notApproved.update).not.toHaveBeenCalled();
    });
});
