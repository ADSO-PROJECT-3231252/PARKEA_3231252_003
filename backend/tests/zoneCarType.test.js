const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ZoneVehicleType, ParkingSpot, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-31: until the API takes the vehicle types, every zone has the car type,
// with the spots and the rate of the zone.
// "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, totalSlots: 10, hourlyRate: 2000, open24h: true };

let transaction;
let createType;
let createSpots;

// A zone that the API creates, with the values of the request
function arrangeCreation() {
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    jest.spyOn(Zona, 'create').mockImplementation(async (values) => {
        const created = Zona.build({ id: ZONE_ID, ...values, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
        jest.spyOn(created, 'reload').mockResolvedValue(created);
        return created;
    });
    jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
}

// A zone of 10 spots, read with a lock. `carType` is its car type (null
// when the zone does not have it), and `inUse` spots hold a reservation
// from now on.
function arrangeEdition({ carType = { update: jest.fn().mockResolvedValue({}) }, inUse = 0 } = {}) {
    const zona = Zona.build({ id: ZONE_ID, ...ZONE, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
    jest.spyOn(zona, 'update').mockResolvedValue(zona);
    jest.spyOn(zona, 'reload').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    jest.spyOn(ZoneVehicleType, 'findOne').mockResolvedValue(carType);
    jest.spyOn(Reserva, 'count').mockResolvedValue(inUse);
    // No spot was disabled before, so a bigger zone gets new spots
    jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([]);
    jest.spyOn(ParkingSpot, 'max').mockResolvedValue(10);
    jest.spyOn(ParkingSpot, 'count').mockResolvedValue(10);
    jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
    jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
    return carType;
}

const create = (values) => request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, ...values });
const edit = (values) => request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, ...values });

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session of the administrator (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    createType = jest.spyOn(ZoneVehicleType, 'create').mockResolvedValue({});
    createSpots = jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Creating a zone gives it the car type (HU-31)', () => {
    test('with the spots and the rate of the zone, in its transaction, before its spots', async () => {
        // Arrange
        arrangeCreation();

        // Act
        const res = await create({ totalSlots: 12, hourlyRate: 2500 });

        // Assert
        expect(res.status).toBe(201);
        expect(createType).toHaveBeenCalledTimes(1);
        expect(createType).toHaveBeenCalledWith(
            { zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 12, hourlyRate: 2500, isAccepting: true },
            { transaction },
        );
        expect(createType.mock.invocationCallOrder[0]).toBeLessThan(createSpots.mock.invocationCallOrder[0]);
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('when its spots fail, nothing is saved: neither the zone nor its car type', async () => {
        // Arrange
        arrangeCreation();
        createSpots.mockRejectedValue(new Error('the spots could not be saved'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const res = await create();

        // Assert
        expect(res.status).toBe(500);
        expect(createType).toHaveBeenCalledWith(expect.anything(), { transaction });
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe('Editing a zone keeps its car type (HU-31)', () => {
    test('with the new spots and rate, in its transaction, before any spot changes', async () => {
        // Arrange
        const carType = arrangeEdition();

        // Act
        const res = await edit({ totalSlots: 12, hourlyRate: 2500 });

        // Assert
        expect(res.status).toBe(200);
        expect(ZoneVehicleType.findOne).toHaveBeenCalledWith({ where: { zoneId: ZONE_ID, vehicleType: 'car' }, transaction });
        expect(carType.update).toHaveBeenCalledWith({ totalSlots: 12, hourlyRate: 2500 }, { transaction });
        expect(carType.update.mock.invocationCallOrder[0]).toBeLessThan(ParkingSpot.findAll.mock.invocationCallOrder[0]);
        expect(createType).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('a change of the rate alone changes the rate of the car type', async () => {
        // Arrange
        const carType = arrangeEdition();

        // Act
        const res = await edit({ hourlyRate: 3000 });

        // Assert
        expect(res.status).toBe(200);
        expect(carType.update).toHaveBeenCalledWith({ totalSlots: 10, hourlyRate: 3000 }, { transaction });
        expect(createSpots).not.toHaveBeenCalled();
    });

    test('a zone that lost its car type (written by hand) gets it again', async () => {
        // Arrange
        arrangeEdition({ carType: null });

        // Act
        const res = await edit({ totalSlots: 10, hourlyRate: 2500 });

        // Assert
        expect(res.status).toBe(200);
        expect(createType).toHaveBeenCalledWith(
            { zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 10, hourlyRate: 2500, isAccepting: true },
            { transaction },
        );
    });

    test('a reduction that is refused saves nothing, the car type included', async () => {
        // Arrange: 4 spots hold a reservation from now on
        const carType = arrangeEdition({ inUse: 4 });

        // Act
        const res = await edit({ totalSlots: 3 });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'CAPACITY_BELOW_IN_USE', spotsInUse: 4 });
        expect(carType.update).toHaveBeenCalledWith(expect.anything(), { transaction });
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});
