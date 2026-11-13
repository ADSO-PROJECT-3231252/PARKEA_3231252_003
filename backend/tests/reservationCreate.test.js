const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Zona, ZoneSchedule, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-14: creating a reservation. The zone is open 24 hours here; the opening
// hours are tested in reservationHours.test.js. The times are in Colombia
// (UTC-5), and "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time, date = '2026-11-16') => new Date(`${date}T${time}:00-05:00`);
const NOW = colombia('08:00');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const SPOT_ID = '55555555-5555-4555-8555-555555555555';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

let transaction;
let lockUser;
let lockVehicle;
let readZone;
let findBalance;
let findOverlap;
let claimSpot;
let createReservation;
let zona;
let spot;

// A zone open 24 hours, read with its (empty) schedule
function openZone(values = {}) {
    const built = Zona.build(
        { id: ZONE_ID, name: 'Centro', address: 'Calle 1', totalSlots: 10, availableSlots: 4, hourlyRate: '2500.00', isActive: true, open24h: true, schedules: [], ...values },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
    jest.spyOn(built, 'decrement').mockResolvedValue(built);
    return built;
}

// Everything goes well unless a test changes one of these answers
function arrange({ vehiculo = { id: VEHICLE_ID }, zone = openZone(), balance = null, overlap = null, freeSpot = true } = {}) {
    zona = zone;
    spot = freeSpot ? { id: SPOT_ID, spotNumber: 7, update: jest.fn() } : null;
    lockVehicle = jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(vehiculo);
    readZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    findBalance = jest.spyOn(Pago, 'findOne').mockResolvedValue(balance);
    findOverlap = jest.spyOn(Reserva, 'findOne').mockResolvedValue(overlap);
    claimSpot = jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue(spot);
    createReservation = jest.spyOn(Reserva, 'create').mockResolvedValue({ id: RESERVATION_ID });
    jest.spyOn(Reserva, 'findByPk').mockResolvedValue({ id: RESERVATION_ID });
}

// A reservation from 10:00 a. m. to 12:00 p. m. unless the test changes it
const book = (body = {}) => request(app)
    .post('/api/reservations')
    .set('Authorization', `Bearer ${token}`)
    .send({ zoneId: ZONE_ID, vehicleId: VEHICLE_ID, startTime: colombia('10:00').toISOString(), endTime: colombia('12:00').toISOString(), ...body });

const at = (date) => date.toISOString();

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session (auth middleware) and the lock of the user
    lockUser = jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
    arrange();
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

// The request was rejected before anything was saved
function expectNothingSaved() {
    expect(createReservation).not.toHaveBeenCalled();
    expect(transaction.rollback).toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
}

describe('The data and the times of a new reservation (HU-14)', () => {
    test.each(['zoneId', 'vehicleId', 'startTime', 'endTime'])('without %s it answers 400 MISSING_REQUIRED_FIELDS', async (field) => {
        // Act
        const res = await book({ [field]: undefined });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MISSING_REQUIRED_FIELDS');
        expect(lockVehicle).not.toHaveBeenCalled();
        expectNothingSaved();
    });

    test('a start time that is not a date answers 400 INVALID_DATE', async () => {
        // Act
        const res = await book({ startTime: 'mañana' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_DATE');
        expectNothingSaved();
    });

    test.each([
        ['one minute ago', -MINUTE],
        ['right now', 0],
    ])('a start time %s answers 400 START_TIME_IN_PAST', async (name, fromNow) => {
        // Act
        const res = await book({ startTime: at(new Date(NOW.getTime() + fromNow)), endTime: at(new Date(NOW.getTime() + 2 * HOUR)) });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('START_TIME_IN_PAST');
        expectNothingSaved();
    });

    test('a start time 48 hours from now is accepted', async () => {
        // Arrange
        const start = new Date(NOW.getTime() + 48 * HOUR);

        // Act
        const res = await book({ startTime: at(start), endTime: at(new Date(start.getTime() + HOUR)) });

        // Assert
        expect(res.status).toBe(201);
    });

    test('a start time 48 hours and 1 minute from now answers 400 RESERVATION_TOO_FAR_AHEAD', async () => {
        // Arrange
        const start = new Date(NOW.getTime() + 48 * HOUR + MINUTE);

        // Act
        const res = await book({ startTime: at(start), endTime: at(new Date(start.getTime() + HOUR)) });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESERVATION_TOO_FAR_AHEAD');
        expectNothingSaved();
    });

    test.each([
        ['before the start', '09:00'],
        ['at the same moment as the start', '10:00'],
    ])('an exit time %s answers 400 END_BEFORE_START', async (name, endTime) => {
        // Act
        const res = await book({ endTime: at(colombia(endTime)) });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('END_BEFORE_START');
        expectNothingSaved();
    });

    test.each([
        ['30 minutes', '10:30', '2026-11-16'],
        ['24 hours', '10:00', '2026-11-17'],
    ])('a stay of %s is accepted', async (name, endTime, endDate) => {
        // Act
        const res = await book({ endTime: at(colombia(endTime, endDate)) });

        // Assert
        expect(res.status).toBe(201);
    });

    test.each([
        ['29 minutes', '10:29', '2026-11-16'],
        ['24 hours and 1 minute', '10:01', '2026-11-17'],
    ])('a stay of %s answers 400 INVALID_DURATION', async (name, endTime, endDate) => {
        // Act
        const res = await book({ endTime: at(colombia(endTime, endDate)) });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_DURATION');
        expectNothingSaved();
    });
});

describe('What a new reservation needs (HU-14)', () => {
    test('a vehicle of another user answers 404 VEHICLE_NOT_FOUND', async () => {
        // Arrange: the vehicle is only searched among the vehicles of this user
        arrange({ vehiculo: null });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('VEHICLE_NOT_FOUND');
        expect(lockVehicle).toHaveBeenCalledWith(expect.objectContaining({ where: { id: VEHICLE_ID, userId: USER_ID } }));
        expectNothingSaved();
    });

    test('a zone that does not exist answers 404 ZONE_NOT_FOUND', async () => {
        // Arrange
        arrange({ zone: null });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ZONE_NOT_FOUND');
        expectNothingSaved();
    });

    test('an inactive zone answers 409 ZONE_INACTIVE', async () => {
        // Arrange
        arrange({ zone: openZone({ isActive: false }) });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ZONE_INACTIVE');
        expectNothingSaved();
    });

    test('a balance still to pay answers 409 PENDING_BALANCE (HU-27, AC-12)', async () => {
        // Arrange
        arrange({ balance: { id: 'balance-1', amount: '2500.00' } });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PENDING_BALANCE');
        // Only the pending balances of this user count
        const { where, include } = findBalance.mock.calls[0][0];
        expect(where).toEqual({ type: 'balance', paymentStatus: 'Pending' });
        expect(include[0].where).toEqual({ userId: USER_ID });
        expectNothingSaved();
    });

    test('another reservation of the same vehicle at that time answers 409 VEHICLE_RESERVATION_OVERLAP', async () => {
        // Arrange
        arrange({ overlap: { id: 'other-reservation' } });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('VEHICLE_RESERVATION_OVERLAP');
        expectNothingSaved();
    });

    test('the overlap check looks at the pending and active reservations of the vehicle in that time range', async () => {
        // Act
        await book();

        // Assert: it starts before this one ends and ends after this one starts
        const { where } = findOverlap.mock.calls[0][0];
        expect(where.vehicleId).toBe(VEHICLE_ID);
        expect(where.status).toEqual(['Pending', 'Active']);
        expect(where.startTime[Op.lt]).toEqual(colombia('12:00'));
        expect(where.endTime[Op.gt]).toEqual(colombia('10:00'));
    });

    test('a full zone answers 409 NO_SPOTS_AVAILABLE', async () => {
        // Arrange
        arrange({ freeSpot: false });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NO_SPOTS_AVAILABLE');
        expectNothingSaved();
    });

    test('the spot is claimed with a lock that skips the spots another request is taking', async () => {
        // Act
        await book();

        // Assert
        expect(claimSpot).toHaveBeenCalledWith(expect.objectContaining({
            where: { zoneId: ZONE_ID, status: 'Available' },
            transaction,
            lock: 'UPDATE',
            skipLocked: true,
        }));
    });
});

describe('Saving a new reservation (HU-14)', () => {
    test('it is created as Pending, with 15 minutes to pay and the rate of the zone at that moment', async () => {
        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(201);
        expect(createReservation).toHaveBeenCalledWith({
            userId: USER_ID,
            zoneId: ZONE_ID,
            vehicleId: VEHICLE_ID,
            parkingSpotId: SPOT_ID,
            spotNumber: 7,
            startTime: colombia('10:00'),
            endTime: colombia('12:00'),
            status: 'Pending',
            holdExpiresAt: new Date(NOW.getTime() + 15 * MINUTE),
            appliedHourlyRate: '2500.00',
            openEnded: false,
        }, { transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('the spot becomes Occupied and the zone has one available slot less, in the same transaction', async () => {
        // Act
        await book();

        // Assert
        expect(spot.update).toHaveBeenCalledWith({ status: 'Occupied' }, { transaction });
        expect(zona.decrement).toHaveBeenCalledWith('availableSlots', { by: 1, transaction });
    });

    test('the user is locked first, then the vehicle, and the zone is read after both locks (#288)', async () => {
        // Act
        await book();

        // Assert: the lock of the user is the call with a transaction (the
        // other one is the session check of the auth middleware)
        const userCall = lockUser.mock.calls.findIndex(([, options]) => options && options.lock === 'UPDATE');
        expect(lockUser.mock.calls[userCall]).toEqual([USER_ID, expect.objectContaining({ transaction, lock: 'UPDATE' })]);
        expect(lockVehicle).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: 'UPDATE' }));
        const userLocked = lockUser.mock.invocationCallOrder[userCall];
        const vehicleLocked = lockVehicle.mock.invocationCallOrder[0];
        expect(userLocked).toBeLessThan(vehicleLocked);
        expect(vehicleLocked).toBeLessThan(readZone.mock.invocationCallOrder[0]);
    });

    test('if the database fails, it answers 500 and nothing is kept', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        createReservation.mockRejectedValue(new Error('Deadlock found when trying to get lock'));

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(500);
        expect(res.body).toEqual({ code: 'INTERNAL_ERROR', message: 'Internal server error' });
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});
