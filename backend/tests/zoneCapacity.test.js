const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ZoneVehicleType, ParkingSpot, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-20, HU-21 and #373: the capacity of a zone and its free spots when it is
// saved. HU-31: the capacity is the one of each vehicle type, here the car
// type. "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, open24h: true };
const cars = (totalSlots) => [{ vehicleType: 'car', totalSlots, hourlyRate: 2000 }];

let transaction;
let zona;
let spotsInUse;
let freeSpots;
let disableSpots;

// A zone with 10 car spots, read with a lock; `inUse` spots hold a
// reservation from now on, `free` spots can be disabled, and 6 spots are
// free now
function arrange({ inUse = 0, free = [] } = {}) {
    zona = Zona.build({ id: ZONE_ID, ...ZONE, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
    jest.spyOn(zona, 'update').mockResolvedValue(zona);
    jest.spyOn(zona, 'reload').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    const carType = ZoneVehicleType.build({ zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 10, hourlyRate: '2000.00', isAccepting: true });
    jest.spyOn(carType, 'update').mockImplementation(async (values) => carType.set(values));
    jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([carType]);
    spotsInUse = jest.spyOn(Reserva, 'count').mockResolvedValue(inUse);
    // The spots that can be disabled, or the free spots of each type (grouped)
    freeSpots = jest.spyOn(ParkingSpot, 'findAll').mockImplementation(async (options) => (options.group
        ? [{ zoneId: ZONE_ID, vehicleType: 'car', free: 6 }]
        : free.map((n) => ({ id: `spot-${n}`, spotNumber: n }))));
    disableSpots = jest.spyOn(ParkingSpot, 'update').mockResolvedValue([free.length]);
    jest.spyOn(Reserva, 'findAll').mockResolvedValue([]);
    jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
    jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
    return carType;
}

const edit = (totalSlots) => request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, vehicleTypes: cars(totalSlots) });
// The queries of the spots that can be disabled (not the counts of free spots)
const candidateQueries = () => freeSpots.mock.calls.map(([options]) => options).filter((options) => !options.group);

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session of the administrator (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Lowering the capacity of a zone (HU-21 AC-03, #373, HU-31)', () => {
    test('below the spots of the type in use answers 400 CAPACITY_BELOW_IN_USE with the type and their number, and nothing changes', async () => {
        // Arrange: 4 car spots hold a reservation from now on
        const carType = arrange({ inUse: 4 });

        // Act
        const res = await edit(3);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            code: 'CAPACITY_BELOW_IN_USE',
            message: 'Cannot reduce the car spots below 4 spots currently in use',
            vehicleType: 'car',
            spotsInUse: 4,
        });
        expect(disableSpots).not.toHaveBeenCalled();
        expect(carType.update).not.toHaveBeenCalled();
        expect(zona.update).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });

    test('a spot of the type is in use while a Pending or Active reservation holds it from now on, and several reservations of one spot count once', async () => {
        // Arrange
        arrange({ inUse: 2, free: [10, 9] });

        // Act
        await edit(8);

        // Assert
        const options = spotsInUse.mock.calls[0][0];
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: NOW } });
        expect(options).toMatchObject({ distinct: true, col: 'parking_spot_id', transaction });
        expect(options.include).toEqual([expect.objectContaining({ as: 'parkingSpot', where: { vehicleType: 'car' } })]);
    });

    test('disables the enabled spots of the type with no reservation from now on, the highest numbers first', async () => {
        // Arrange: 2 of the 10 spots are in use
        arrange({ inUse: 2, free: [10, 8] });

        // Act
        const res = await edit(8);

        // Assert
        expect(res.status).toBe(200);
        const [options] = candidateQueries();
        expect(options).toMatchObject({ order: [['spotNumber', 'DESC']], limit: 2, transaction });
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, vehicleType: 'car', status: { [Op.ne]: 'Disabled' } });
        expect(options.where[Op.and][0].val).toContain("r.end_time > '2026-11-16 13:00:00'");
        expect(disableSpots).toHaveBeenCalledWith({ status: 'Disabled' }, { where: { id: ['spot-10', 'spot-8'] }, transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('when fewer spots can be disabled than asked, it answers 400 INSUFFICIENT_AVAILABLE_SPOTS with the type, and nothing changes', async () => {
        // Arrange: only one of the two spots to disable is free
        arrange({ inUse: 0, free: [10] });

        // Act
        const res = await edit(8);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'INSUFFICIENT_AVAILABLE_SPOTS', vehicleType: 'car' });
        expect(disableSpots).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('down to exactly the spots in use is allowed', async () => {
        // Arrange
        arrange({ inUse: 3, free: [10, 9, 8, 7, 6, 5, 4] });

        // Act
        const res = await edit(3);

        // Assert
        expect(res.status).toBe(200);
        expect(disableSpots).toHaveBeenCalled();
    });

    test('the same capacity does not look at the spots in use', async () => {
        // Arrange
        arrange();

        // Act
        const res = await edit(10);

        // Assert
        expect(res.status).toBe(200);
        expect(spotsInUse).not.toHaveBeenCalled();
        expect(disableSpots).not.toHaveBeenCalled();
    });
});

describe('The free spots of a saved zone (#373, HU-31)', () => {
    test('editing it answers with the spots free now, counted in the transaction with the new capacity', async () => {
        // Arrange
        arrange({ inUse: 1, free: [10, 9] });

        // Act
        const res = await edit(8);

        // Assert: they are not stored
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ totalSlots: 8, availableSlots: 6 });
        expect(res.body.zone.vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 8, availableSlots: 6, hourlyRate: 2000, isAccepting: true, spotsInUse: 0, openReservations: 0 },
        ]);
        expect(zona.update.mock.calls[0][0]).not.toHaveProperty('availableSlots');
        const [counted] = freeSpots.mock.calls.find(([options]) => options.group);
        expect(counted.transaction).toBe(transaction);
        expect(counted.where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
        expect(freeSpots.mock.invocationCallOrder.at(-1)).toBeGreaterThan(disableSpots.mock.invocationCallOrder[0]);
    });

    test('a new zone has all its spots free', async () => {
        // Arrange
        jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
        jest.spyOn(Zona, 'create').mockImplementation(async (values) => {
            const created = Zona.build({ id: ZONE_ID, ...values, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
            jest.spyOn(created, 'reload').mockResolvedValue(created);
            return created;
        });
        jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
        jest.spyOn(ZoneVehicleType, 'bulkCreate').mockResolvedValue([]);
        jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([ZoneVehicleType.build({ zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 12, hourlyRate: '2000.00' })]);
        jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: ZONE_ID, vehicleType: 'car', free: 12 }]);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([]);

        // Act
        const res = await request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, vehicleTypes: cars(12) });

        // Assert: they are not stored
        expect(res.status).toBe(201);
        expect(res.body.zone).toMatchObject({ totalSlots: 12, availableSlots: 12 });
        expect(Zona.create.mock.calls[0][0]).not.toHaveProperty('availableSlots');
    });
});
