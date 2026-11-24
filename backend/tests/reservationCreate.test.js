const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Zona, ZoneSchedule, ZoneVehicleType, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// The where of a reservation that holds its spot at `now`, the rule of the
// availability service (#373): Active, or Pending with its 15 minutes running
function expectHoldsItsSpot(where, now) {
    expect(where.status).toBeUndefined();
    const [rule] = where[Op.and];
    const [active, pending] = rule[Op.or];
    expect(active).toEqual({ status: 'Active' });
    expect(pending.status).toBe('Pending');
    expect(pending[Op.or][1].holdExpiresAt[Op.gt]).toEqual(now);
}

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
let countPending;
let claimSpot;
let createReservation;
let findTypes;
let zona;
let spot;

// HU-31: the types a zone accepts, as the model gives them
const zoneTypes = (...items) => items.map(([vehicleType, hourlyRate, isAccepting = true]) => ZoneVehicleType.build({ zoneId: ZONE_ID, vehicleType, totalSlots: 10, hourlyRate, isAccepting }));

// A zone open 24 hours, read with its (empty) schedule
function openZone(values = {}) {
    const built = Zona.build(
        { id: ZONE_ID, name: 'Centro', address: 'Calle 1', isActive: true, open24h: true, schedules: [], ...values },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
    // Spied on only to check that the zone does not change (#373)
    jest.spyOn(built, 'decrement');
    return built;
}

// Everything goes well unless a test changes one of these answers. `pending`
// is how many reservations in Pending the user already has. HU-31: the
// vehicle is a car, and the zone accepts cars at $2500 an hour.
function arrange({ vehiculo = { id: VEHICLE_ID, vehicleType: 'car' }, zone = openZone(), types = zoneTypes(['car', '2500.00']), balance = null, overlap = null, freeSpot = true, pending = 0 } = {}) {
    zona = zone;
    spot = freeSpot ? { id: SPOT_ID, spotNumber: 7, vehicleType: vehiculo?.vehicleType, update: jest.fn() } : null;
    findTypes = jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue(types);
    lockVehicle = jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(vehiculo);
    readZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    findBalance = jest.spyOn(Pago, 'findOne').mockResolvedValue(balance);
    findOverlap = jest.spyOn(Reserva, 'findOne').mockResolvedValue(overlap);
    countPending = jest.spyOn(Reserva, 'count').mockResolvedValue(pending);
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
        expect(createReservation).not.toHaveBeenCalled();
        expect(sequelize.transaction).not.toHaveBeenCalled();
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

    test('a user with 2 reservations in Pending answers 409 TOO_MANY_PENDING_RESERVATIONS', async () => {
        // Arrange
        arrange({ pending: 2 });

        // Act
        const res = await book();

        // Assert: only the Pending reservations of this user are counted, and
        // the request stops before looking for a spot
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('TOO_MANY_PENDING_RESERVATIONS');
        expect(countPending).toHaveBeenCalledWith({
            where: {
                userId: USER_ID,
                status: 'Pending',
                [Op.or]: [
                    { holdExpiresAt: null },
                    { holdExpiresAt: { [Op.gt]: expect.any(Date) } },
                ],
            },
            transaction,
        });
        expect(claimSpot).not.toHaveBeenCalled();
        expectNothingSaved();
    });

    test('a user with 1 reservation in Pending can still book', async () => {
        // Arrange
        arrange({ pending: 1 });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(201);
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('the user, vehicle and zone are locked before counting pending reservations, and the count comes before the spot search', async () => {
        await book();

        const userCall = lockUser.mock.calls.findIndex(([, options]) => options?.lock === 'UPDATE');
        const userLocked = lockUser.mock.invocationCallOrder[userCall];
        const vehicleLocked = lockVehicle.mock.invocationCallOrder[0];
        const zoneLocked = readZone.mock.invocationCallOrder[0];
        const counted = countPending.mock.invocationCallOrder[0];
        const spotSearched = claimSpot.mock.invocationCallOrder[0];

        expect(userLocked).toBeLessThan(vehicleLocked);
        expect(vehicleLocked).toBeLessThan(zoneLocked);
        expect(zoneLocked).toBeLessThan(counted);
        expect(counted).toBeLessThan(spotSearched);
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

    test('the overlap check looks at the reservations of the vehicle that hold their spot in that time range', async () => {
        // Act
        await book();

        // Assert: it starts before this one ends and ends after this one starts
        const { where } = findOverlap.mock.calls[0][0];
        expect(where.vehicleId).toBe(VEHICLE_ID);
        expectHoldsItsSpot(where, NOW);
        expect(where.startTime[Op.lt]).toEqual(colombia('12:00'));
        expect(where.endTime[Op.gt]).toEqual(colombia('10:00'));
    });

    test('a Pending reservation of the vehicle whose 15 minutes ended does not count, even before the job runs (#373)', async () => {
        // Act
        await book();

        // Assert: Active, or Pending with its deadline still ahead (or none)
        const { where } = findOverlap.mock.calls[0][0];
        const [, pending] = where[Op.and][0][Op.or];
        expect(pending.status).toBe('Pending');
        expect(pending[Op.or]).toEqual([{ holdExpiresAt: null }, { holdExpiresAt: { [Op.gt]: NOW } }]);
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

    test('the spot is the enabled one with the lowest number free for these hours, read in the transaction (#373)', async () => {
        // Act
        await book();

        // Assert: free from 9:50 a. m. to 12:10 p. m. (15:10 and 17:10 UTC),
        // the hours with 10 minutes before and after
        const options = claimSpot.mock.calls[0][0];
        expect(options).toMatchObject({ order: [['spotNumber', 'ASC']], transaction });
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, vehicleType: 'car', status: { [Op.ne]: 'Disabled' } });
        const sql = options.where[Op.and][0].val;
        expect(sql).toContain("r.start_time < '2026-11-16 17:10:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 14:50:00'");
        expect(sql).toContain("r.hold_expires_at > '2026-11-16 13:00:00'");
    });

    test('an open stay needs a spot free until its provisional exit time, 24 hours after the entry (HU-27, #373)', async () => {
        // Act
        await book({ endTime: undefined, openEnded: true });

        // Assert: from 9:50 a. m. until 10:10 a. m. of the next day
        const sql = claimSpot.mock.calls[0][0].where[Op.and][0].val;
        expect(sql).toContain("r.start_time < '2026-11-17 15:10:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 14:50:00'");
    });
});

describe('The vehicle type of a new reservation (HU-31)', () => {
    test('a vehicle of a type the zone does not accept answers 409 VEHICLE_TYPE_NOT_ACCEPTED with the types it accepts, in order', async () => {
        // Arrange: a motorcycle, in a zone of trucks and cars
        arrange({ vehiculo: { id: VEHICLE_ID, vehicleType: 'motorcycle' }, types: zoneTypes(['truck', '9000.00'], ['car', '2500.00']) });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body).toEqual({
            code: 'VEHICLE_TYPE_NOT_ACCEPTED',
            message: 'This zone does not accept this type of vehicle',
            vehicleType: 'motorcycle',
            acceptedTypes: ['car', 'truck'],
        });
        expect(claimSpot).not.toHaveBeenCalled();
        expectNothingSaved();
    });

    test('a zone with no type that takes reservations answers 409 VEHICLE_TYPE_NOT_ACCEPTED with no types', async () => {
        // Arrange
        arrange({ types: [] });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body).toMatchObject({ code: 'VEHICLE_TYPE_NOT_ACCEPTED', vehicleType: 'car', acceptedTypes: [] });
        expectNothingSaved();
    });

    test('only the types that take reservations count, read in the transaction after the lock of the zone', async () => {
        // Act
        await book();

        // Assert: a type turned off keeps its reservations but takes no new ones
        expect(findTypes).toHaveBeenCalledWith({ where: { zoneId: ZONE_ID, isAccepting: true }, transaction });
        expect(readZone.mock.invocationCallOrder[0]).toBeLessThan(findTypes.mock.invocationCallOrder[0]);
        expect(findTypes.mock.invocationCallOrder[0]).toBeLessThan(countPending.mock.invocationCallOrder[0]);
    });

    test('a motorcycle gets a motorcycle spot and the rate of the motorcycles, not the one of the cars', async () => {
        // Arrange
        arrange({ vehiculo: { id: VEHICLE_ID, vehicleType: 'motorcycle' }, types: zoneTypes(['car', '2500.00'], ['motorcycle', '1200.00']) });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(201);
        expect(claimSpot.mock.calls[0][0].where).toMatchObject({ zoneId: ZONE_ID, vehicleType: 'motorcycle' });
        expect(createReservation.mock.calls[0][0]).toMatchObject({ parkingSpotId: SPOT_ID, appliedHourlyRate: '1200.00' });
        expect(res.body.reservation.spotVehicleType).toBe('motorcycle');
    });

    test('with no free spot of its type, it answers 409 NO_SPOTS_AVAILABLE even if other types have free spots', async () => {
        // Arrange: the search only looks at the spots of the type
        arrange({ vehiculo: { id: VEHICLE_ID, vehicleType: 'truck' }, types: zoneTypes(['car', '2500.00'], ['truck', '9000.00']), freeSpot: false });

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('NO_SPOTS_AVAILABLE');
        expect(claimSpot.mock.calls[0][0].where.vehicleType).toBe('truck');
        expectNothingSaved();
    });
});

describe('Saving a new reservation (HU-14)', () => {
    test('it is created as Pending, with 15 minutes to pay and the rate of its vehicle type at that moment', async () => {
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

    test('the answer brings the saved reservation, read again with its zone and its vehicle', async () => {
        // Arrange
        const withDetails = { id: RESERVATION_ID, zone: { id: ZONE_ID }, vehicle: { id: VEHICLE_ID } };
        const readAgain = jest.spyOn(Reserva, 'findByPk').mockResolvedValue(withDetails);

        // Act
        const res = await book();

        // Assert: with the type of its spot (HU-31)
        expect(res.status).toBe(201);
        expect(readAgain).toHaveBeenCalledWith(RESERVATION_ID, { include: [{ model: Zona, as: 'zone' }, { model: Vehiculo, as: 'vehicle' }] });
        expect(res.body.reservation).toEqual({ ...withDetails, spotVehicleType: 'car' });
    });

    test('the reservation keeps its spot, and neither the spot nor the zone change (#373)', async () => {
        // Act
        await book();

        // Assert: the spot is taken only for the hours of the reservation
        expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({ parkingSpotId: SPOT_ID, spotNumber: 7 }), { transaction });
        expect(spot.update).not.toHaveBeenCalled();
        expect(zona.decrement).not.toHaveBeenCalled();
    });

    test('the user is locked first, then the vehicle, then the zone, and the spot last (#288, #371)', async () => {
        // Act
        await book();

        // Assert: the lock of the user is the call with a transaction (the
        // other one is the session check of the auth middleware)
        const userCall = lockUser.mock.calls.findIndex(([, options]) => options && options.lock === 'UPDATE');
        expect(lockUser.mock.calls[userCall]).toEqual([USER_ID, expect.objectContaining({ transaction, lock: 'UPDATE' })]);
        expect(lockVehicle).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: 'UPDATE' }));
        expect(readZone).toHaveBeenCalledWith(ZONE_ID, expect.objectContaining({ transaction, lock: 'UPDATE' }));
        const userLocked = lockUser.mock.invocationCallOrder[userCall];
        const vehicleLocked = lockVehicle.mock.invocationCallOrder[0];
        const zoneLocked = readZone.mock.invocationCallOrder[0];
        expect(userLocked).toBeLessThan(vehicleLocked);
        expect(vehicleLocked).toBeLessThan(zoneLocked);
        // The same order as a capacity edit (zone, then its spots), so both
        // at the same time wait instead of a deadlock
        expect(zoneLocked).toBeLessThan(claimSpot.mock.invocationCallOrder[0]);
    });

    test('if the database fails, it answers 500 and nothing is kept', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => { });
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

describe('An account that an admin changed while the request waited (#348)', () => {
    // The session saw an active user; the locked read is the account as it is now
    const session = { id: USER_ID, isActive: true, passwordVersion: 0, roleId: 'role-user', role: { name: 'user' } };

    test.each([
        ['was deactivated', { isActive: false }, 'ACCOUNT_DEACTIVATED'],
        ['was made administrator', { roleId: 'role-admin' }, 'FORBIDDEN_ROLE'],
    ])('an account that %s answers 403 %s and nothing is saved', async (_case, now, code) => {
        // Arrange
        lockUser.mockImplementation(async (id, options = {}) => (options.lock ? { ...session, ...now } : session));

        // Act
        const res = await book();

        // Assert: it stops right after the lock of the user
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(code);
        expectNothingSaved();
        expect(lockVehicle).not.toHaveBeenCalled();
    });

    test('the account is read with the lock, with its status and its role', async () => {
        // Arrange
        lockUser.mockResolvedValue(session);

        // Act
        const res = await book();

        // Assert
        expect(res.status).toBe(201);
        expect(lockUser).toHaveBeenCalledWith(USER_ID, {
            attributes: ['id', 'isActive', 'roleId'],
            transaction,
            lock: transaction.LOCK.UPDATE,
        });
    });
});
