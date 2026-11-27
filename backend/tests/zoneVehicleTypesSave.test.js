const jwt = require('jsonwebtoken');
const request = require('supertest');
const availability = require('../src/services/availability');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ZoneVehicleType, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-31: creating and editing a zone with the vehicle types it accepts.
// "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, open24h: true };

const type = (vehicleType, totalSlots, hourlyRate) => ({ vehicleType, totalSlots, hourlyRate });

let transaction;
let createSpots;
let updateSpots;

const create = (vehicleTypes) => request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, vehicleTypes });
const edit = (vehicleTypes) => request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, vehicleTypes });

// A row of zone_vehicle_types as the model gives it, whose update keeps the
// new values
function row(vehicleType, totalSlots, hourlyRate, isAccepting = true) {
    const tipo = ZoneVehicleType.build({ id: `type-${vehicleType}`, zoneId: ZONE_ID, vehicleType, totalSlots, hourlyRate, isAccepting });
    jest.spyOn(tipo, 'update').mockImplementation(async (values) => tipo.set(values));
    return tipo;
}

// A zone that the API creates, with the values of the request
function arrangeCreation() {
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    jest.spyOn(Zona, 'create').mockImplementation(async (values) => {
        const created = Zona.build({ id: ZONE_ID, ...values, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
        jest.spyOn(created, 'reload').mockResolvedValue(created);
        return created;
    });
    // What the transaction reads back: the types that were created
    jest.spyOn(ZoneVehicleType, 'bulkCreate').mockImplementation(async (rows) => {
        ZoneVehicleType.findAll.mockResolvedValue(rows.map((values) => ZoneVehicleType.build(values)));
        return rows;
    });
    jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([]);
}

// A zone with the types `rows`, read with a lock. `inUse` maps a type to its
// spots in use, `free` to the numbers of its spots that can be disabled, and
// `disabled` to the numbers of its disabled spots. The highest number of
// each type is `highest`.
function arrangeEdition(rows, { inUse = {}, free = {}, disabled = {}, highest = {} } = {}) {
    const zona = Zona.build({ id: ZONE_ID, ...ZONE, isActive: true, schedules: [] }, { include: [{ model: ZoneSchedule, as: 'schedules' }] });
    jest.spyOn(zona, 'update').mockImplementation(async (values) => zona.set(values));
    jest.spyOn(zona, 'reload').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue(rows);
    jest.spyOn(ZoneVehicleType, 'update').mockImplementation(async (values, { where }) => {
        for (const tipo of rows.filter((r) => where.id.includes(r.id))) tipo.set(values);
        return [where.id.length];
    });
    jest.spyOn(availability, 'spotsOfTypeInUse').mockImplementation(async (_zoneId, vehicleType) => inUse[vehicleType] ?? 0);
    jest.spyOn(ParkingSpot, 'findAll').mockImplementation(async ({ where }) => {
        const numbers = where.status === 'Disabled' ? disabled[where.vehicleType] : free[where.vehicleType];
        return (numbers ?? []).map((n) => ({ id: `${where.vehicleType}-${n}`, spotNumber: n }));
    });
    jest.spyOn(ParkingSpot, 'max').mockImplementation(async (_field, { where }) => highest[where.vehicleType] ?? null);
    jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
    jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
    return zona;
}

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session of the administrator (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    jest.spyOn(ZoneVehicleType, 'create').mockResolvedValue({});
    createSpots = jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);
    updateSpots = jest.spyOn(ParkingSpot, 'update').mockResolvedValue([1]);
    // The counts of the answer (tests/zoneAvailability.test.js)
    jest.spyOn(availability, 'availableNowByZoneAndType').mockResolvedValue(new Map());
    jest.spyOn(availability, 'inUseByZoneAndType').mockResolvedValue(new Map());
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Creating a zone with its vehicle types (HU-31, AC-01 to AC-03)', () => {
    test('saves each type with its spots and its rate, taking reservations, in the transaction of the zone and before the spots', async () => {
        // Arrange
        arrangeCreation();

        // Act
        const res = await create([type('motorcycle', 4, 1500), type('car', 10, 2500)]);

        // Assert: in the order car, motorcycle, truck
        expect(res.status).toBe(201);
        expect(ZoneVehicleType.bulkCreate).toHaveBeenCalledWith([
            { zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 10, hourlyRate: 2500, isAccepting: true },
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', totalSlots: 4, hourlyRate: 1500, isAccepting: true },
        ], { transaction });
        expect(ZoneVehicleType.bulkCreate.mock.invocationCallOrder[0]).toBeLessThan(createSpots.mock.invocationCallOrder[0]);
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('the spots of each type are numbered from 1, each with its type', async () => {
        // Arrange
        arrangeCreation();

        // Act
        await create([type('car', 2, 2500), type('motorcycle', 2, 1500)]);

        // Assert
        expect(createSpots).toHaveBeenCalledWith([
            { zoneId: ZONE_ID, vehicleType: 'car', spotNumber: 1, status: 'Available' },
            { zoneId: ZONE_ID, vehicleType: 'car', spotNumber: 2, status: 'Available' },
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', spotNumber: 1, status: 'Available' },
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', spotNumber: 2, status: 'Available' },
        ], { transaction });
    });

    test('the zone is saved without spots or a rate of its own: they are the ones of its types', async () => {
        // Arrange
        arrangeCreation();

        // Act
        await create([type('truck', 2, 9000), type('car', 10, 2500)]);

        // Assert
        const [values] = Zona.create.mock.calls[0];
        expect(Object.keys(values).sort()).toEqual(['address', 'latitude', 'longitude', 'name', 'open24h']);
    });

    test('answers 201 with the types counted in the transaction, as the administrator sees them', async () => {
        // Arrange
        arrangeCreation();

        // Act
        const res = await create([type('car', 10, 2500), type('motorcycle', 4, 1500)]);

        // Assert
        expect(res.body.zone).toMatchObject({ totalSlots: 14, availableSlots: 0 });
        expect(res.body.zone).not.toHaveProperty('hourlyRate');
        expect(res.body.zone.vehicleTypes.map((tipo) => [tipo.vehicleType, tipo.totalSlots, tipo.hourlyRate, tipo.isAccepting])).toEqual([
            ['car', 10, 2500, true],
            ['motorcycle', 4, 1500, true],
        ]);
        expect(availability.availableNowByZoneAndType.mock.calls[0][1].transaction).toBe(transaction);
    });

    test('when the spots fail, nothing is saved: neither the zone nor its types', async () => {
        // Arrange
        arrangeCreation();
        createSpots.mockRejectedValue(new Error('the spots could not be saved'));
        jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const res = await create([type('car', 10, 2500)]);

        // Assert
        expect(res.status).toBe(500);
        expect(ZoneVehicleType.bulkCreate).toHaveBeenCalledWith(expect.anything(), { transaction });
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });

    test('a body with an error in its types saves nothing', async () => {
        // Arrange
        arrangeCreation();

        // Act
        const res = await create([type('car', 10, 2500), type('car', 4, 1500)]);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'VALIDATION_ERROR', errors: [{ path: 'vehicleTypes[1].vehicleType', msg: 'vehicleType car is repeated' }] });
        expect(sequelize.transaction).not.toHaveBeenCalled();
    });
});

describe('Editing the vehicle types of a zone (HU-31, AC-04 and AC-05)', () => {
    test('a type that is not in the list is turned off, and keeps its spots and its rate', async () => {
        // Arrange
        const car = row('car', 10, '2500.00');
        const moto = row('motorcycle', 4, '1500.00');
        arrangeEdition([car, moto]);

        // Act
        const res = await edit([type('car', 10, 2500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(ZoneVehicleType.update).toHaveBeenCalledWith({ isAccepting: false }, { where: { id: ['type-motorcycle'] }, transaction });
        expect(moto.update).not.toHaveBeenCalled();
        expect(updateSpots).not.toHaveBeenCalled();
        expect(createSpots).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('a type that was already turned off is left as it is', async () => {
        // Arrange
        arrangeEdition([row('car', 10, '2500.00'), row('truck', 2, '9000.00', false)]);

        // Act
        await edit([type('car', 10, 2500)]);

        // Assert
        expect(ZoneVehicleType.update).not.toHaveBeenCalled();
    });

    test('a type that was turned off takes reservations again, with the spots it kept', async () => {
        // Arrange
        const truck = row('truck', 2, '9000.00', false);
        arrangeEdition([row('car', 10, '2500.00'), truck]);

        // Act
        const res = await edit([type('car', 10, 2500), type('truck', 2, 9500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(truck.update).toHaveBeenCalledWith({ totalSlots: 2, hourlyRate: 9500, isAccepting: true }, { transaction });
        expect(createSpots).not.toHaveBeenCalled();
        expect(updateSpots).not.toHaveBeenCalled();
    });

    test('a new type is saved before its spots, numbered from 1', async () => {
        // Arrange
        arrangeEdition([row('car', 10, '2500.00')]);

        // Act
        const res = await edit([type('car', 10, 2500), type('motorcycle', 2, 1500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(ZoneVehicleType.create).toHaveBeenCalledWith(
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', totalSlots: 2, hourlyRate: 1500, isAccepting: true },
            { transaction },
        );
        expect(createSpots).toHaveBeenCalledWith([
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', spotNumber: 1, status: 'Available' },
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', spotNumber: 2, status: 'Available' },
        ], { transaction });
        expect(ZoneVehicleType.create.mock.invocationCallOrder[0]).toBeLessThan(createSpots.mock.invocationCallOrder[0]);
    });

    test('more spots of a type reuse its disabled spots first, and the new ones go after its highest number', async () => {
        // Arrange: the car spots 9 and 10 were disabled; the highest is 10
        const car = row('car', 8, '2500.00');
        arrangeEdition([car, row('motorcycle', 4, '1500.00')], { disabled: { car: [9, 10] }, highest: { car: 10, motorcycle: 4 } });

        // Act
        const res = await edit([type('car', 11, 2500), type('motorcycle', 4, 1500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(updateSpots).toHaveBeenCalledWith({ status: 'Available' }, { where: { id: ['car-9', 'car-10'] }, transaction });
        expect(ParkingSpot.max).toHaveBeenCalledWith('spotNumber', { where: { zoneId: ZONE_ID, vehicleType: 'car' }, transaction });
        expect(createSpots).toHaveBeenCalledWith([{ zoneId: ZONE_ID, vehicleType: 'car', spotNumber: 11, status: 'Available' }], { transaction });
        expect(car.update).toHaveBeenCalledWith({ totalSlots: 11, hourlyRate: 2500, isAccepting: true }, { transaction });
    });

    test('fewer spots of a type disable only spots of that type', async () => {
        // Arrange
        arrangeEdition([row('car', 10, '2500.00'), row('motorcycle', 4, '1500.00')], { free: { motorcycle: [4, 3] } });

        // Act
        const res = await edit([type('car', 10, 2500), type('motorcycle', 2, 1500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(availability.spotsOfTypeInUse).toHaveBeenCalledWith(ZONE_ID, 'motorcycle', { transaction, now: NOW });
        expect(ParkingSpot.findAll.mock.calls[0][0].where).toMatchObject({ zoneId: ZONE_ID, vehicleType: 'motorcycle' });
        expect(updateSpots).toHaveBeenCalledWith({ status: 'Disabled' }, { where: { id: ['motorcycle-4', 'motorcycle-3'] }, transaction });
    });

    test('below the spots in use of a type answers 400 with that type, and saves nothing', async () => {
        // Arrange: 3 motorcycle spots hold a reservation from now on
        const car = row('car', 10, '2500.00');
        arrangeEdition([car, row('motorcycle', 4, '1500.00')], { inUse: { motorcycle: 3 } });

        // Act
        const res = await edit([type('car', 12, 3000), type('motorcycle', 2, 1500)]);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            code: 'CAPACITY_BELOW_IN_USE',
            message: 'Cannot reduce the motorcycle spots below 3 spots currently in use',
            vehicleType: 'motorcycle',
            spotsInUse: 3,
        });
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });

    test('the zone is saved without spots or a rate of its own: they are the ones of its types', async () => {
        // Arrange
        const zona = arrangeEdition([row('car', 10, '2500.00'), row('truck', 2, '9000.00')], { free: { car: [10, 9] } });

        // Act
        await edit([type('car', 8, 2800), type('motorcycle', 3, 1500)]);

        // Assert
        const [values, options] = zona.update.mock.calls[0];
        expect(Object.keys(values).sort()).toEqual(['address', 'latitude', 'longitude', 'name', 'open24h']);
        expect(options).toEqual({ transaction });
    });

    test('answers 200 with every type, the ones turned off included, counted in the transaction', async () => {
        // Arrange
        arrangeEdition([row('car', 10, '2500.00'), row('motorcycle', 4, '1500.00')]);

        // Act
        const res = await edit([type('car', 10, 2500)]);

        // Assert
        expect(res.body.zone.vehicleTypes.map((tipo) => [tipo.vehicleType, tipo.isAccepting])).toEqual([['car', true], ['motorcycle', false]]);
        expect(res.body.zone.totalSlots).toBe(10);
        expect(availability.inUseByZoneAndType.mock.calls[0][1].transaction).toBe(transaction);
    });

    test('a zone that does not exist answers 404 and saves nothing', async () => {
        // Arrange
        arrangeEdition([]);
        Zona.findByPk.mockResolvedValue(null);

        // Act
        const res = await edit([type('car', 10, 2500)]);

        // Assert
        expect(res.status).toBe(404);
        expect(ZoneVehicleType.findAll).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
    });
});
