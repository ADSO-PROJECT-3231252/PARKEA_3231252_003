const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ParkingSpot, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-20, HU-21 and #373: the capacity of a zone and its free spots when it is
// saved. "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, totalSlots: 10, hourlyRate: 2000, open24h: true };

let transaction;
let zona;
let spotsInUse;
let freeSpots;
let disableSpots;

// A zone of 10 spots, read with a lock; `inUse` spots hold a reservation from
// now on and `free` spots can be disabled
function arrange({ inUse = 0, free = [] } = {}) {
    zona = Zona.build({ id: ZONE_ID, ...ZONE, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
    jest.spyOn(zona, 'update').mockResolvedValue(zona);
    jest.spyOn(zona, 'reload').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    spotsInUse = jest.spyOn(Reserva, 'count').mockResolvedValue(inUse);
    freeSpots = jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue(free.map((n) => ({ id: `spot-${n}`, spotNumber: n })));
    disableSpots = jest.spyOn(ParkingSpot, 'update').mockResolvedValue([free.length]);
    jest.spyOn(ParkingSpot, 'count').mockResolvedValue(6);
    jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
    jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
}

const edit = (values) => request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, ...values });

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

describe('Lowering the capacity of a zone (HU-21 AC-03, #373)', () => {
    test('below the spots in use answers 400 CAPACITY_BELOW_IN_USE with their number, and nothing changes', async () => {
        // Arrange: 4 spots hold a reservation from now on
        arrange({ inUse: 4 });

        // Act
        const res = await edit({ totalSlots: 3 });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'CAPACITY_BELOW_IN_USE', spotsInUse: 4 });
        expect(disableSpots).not.toHaveBeenCalled();
        expect(zona.update).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('a spot is in use while a Pending or Active reservation holds it from now on, and several reservations of one spot count once', async () => {
        // Arrange
        arrange({ inUse: 2, free: [10, 9] });

        // Act
        await edit({ totalSlots: 8 });

        // Assert
        const options = spotsInUse.mock.calls[0][0];
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: NOW } });
        expect(options).toMatchObject({ distinct: true, col: 'parkingSpotId', transaction });
    });

    test('disables the enabled spots with no reservation from now on, the highest numbers first', async () => {
        // Arrange: 2 of the 10 spots are in use
        arrange({ inUse: 2, free: [10, 8] });

        // Act
        const res = await edit({ totalSlots: 8 });

        // Assert
        expect(res.status).toBe(200);
        const options = freeSpots.mock.calls[0][0];
        expect(options).toMatchObject({ order: [['spotNumber', 'DESC']], limit: 2, transaction });
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, status: { [Op.ne]: 'Disabled' } });
        expect(options.where[Op.and][0].val).toContain("r.end_time > '2026-11-16 13:00:00'");
        expect(disableSpots).toHaveBeenCalledWith({ status: 'Disabled' }, { where: { id: ['spot-10', 'spot-8'] }, transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('down to exactly the spots in use is allowed', async () => {
        // Arrange
        arrange({ inUse: 3, free: [10, 9, 8, 7, 6, 5, 4] });

        // Act
        const res = await edit({ totalSlots: 3 });

        // Assert
        expect(res.status).toBe(200);
        expect(disableSpots).toHaveBeenCalled();
    });

    test('the same capacity does not look at the spots in use', async () => {
        // Arrange
        arrange();

        // Act
        const res = await edit({ totalSlots: 10 });

        // Assert
        expect(res.status).toBe(200);
        expect(spotsInUse).not.toHaveBeenCalled();
        expect(disableSpots).not.toHaveBeenCalled();
    });
});

describe('The free spots of a saved zone (#373)', () => {
    test('editing it answers with the spots free now, counted in the transaction with the new capacity', async () => {
        // Arrange
        arrange({ inUse: 1, free: [10, 9] });

        // Act
        const res = await edit({ totalSlots: 8 });

        // Assert: it is not stored
        expect(res.status).toBe(200);
        expect(res.body.zone.availableSlots).toBe(6);
        expect(zona.update.mock.calls[0][0]).not.toHaveProperty('availableSlots');
        const options = ParkingSpot.count.mock.calls[0][0];
        expect(options.transaction).toBe(transaction);
        expect(options.where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
        expect(ParkingSpot.count.mock.invocationCallOrder[0]).toBeGreaterThan(disableSpots.mock.invocationCallOrder[0]);
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
        jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);

        // Act
        const res = await request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, totalSlots: 12 });

        // Assert: they are not stored
        expect(res.status).toBe(201);
        expect(res.body.zone).toMatchObject({ totalSlots: 12, availableSlots: 12 });
        expect(Zona.create.mock.calls[0][0]).not.toHaveProperty('availableSlots');
    });
});
