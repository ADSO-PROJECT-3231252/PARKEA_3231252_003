const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op, UniqueConstraintError } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-10 to HU-13: the vehicles of a user and the rule that exactly one of
// them is the default vehicle.
const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const NEXT_VEHICLE_ID = '77777777-7777-4777-8777-777777777777';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

const transaction = { LOCK: { UPDATE: 'UPDATE' } };
let lockUser;

// A vehicle of the user, with its own update and destroy spies
const vehicle = (values = {}) => ({
    id: VEHICLE_ID,
    userId: USER_ID,
    plate: 'ABC123',
    vehicleType: 'car',
    isDefault: false,
    update: jest.fn(),
    destroy: jest.fn(),
    ...values,
});

const NEW_CAR = { plate: 'ABC123', vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo' };

const send = (method, path, body) => request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);

beforeEach(() => {
    // Runs the code of each transaction without a database
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work(transaction));
    // The session (auth middleware) and the lock of the user
    lockUser = jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
});

afterEach(() => {
    jest.restoreAllMocks();
});

// The call that locks the user (the other one is the session check)
const userLockCall = () => lockUser.mock.calls.findIndex(([, options]) => options && options.lock === 'UPDATE');

describe('Registering a vehicle (HU-10)', () => {
    let findPlate;
    let countVehicles;
    let createVehicle;

    beforeEach(() => {
        findPlate = jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(null);
        countVehicles = jest.spyOn(Vehiculo, 'count').mockResolvedValue(0);
        createVehicle = jest.spyOn(Vehiculo, 'create').mockImplementation(async (values) => ({ id: VEHICLE_ID, ...values }));
    });

    test('the first vehicle of the user is the default one (AC-09)', async () => {
        // Act
        const res = await send('post', '/api/vehicles', NEW_CAR);

        // Assert
        expect(res.status).toBe(201);
        expect(createVehicle).toHaveBeenCalledWith(expect.objectContaining({ isDefault: true, userId: USER_ID }), { transaction });
    });

    test('a second vehicle is not the default one', async () => {
        // Arrange
        countVehicles.mockResolvedValue(1);

        // Act
        const res = await send('post', '/api/vehicles', { ...NEW_CAR, plate: 'XYZ987' });

        // Assert
        expect(res.status).toBe(201);
        expect(createVehicle).toHaveBeenCalledWith(expect.objectContaining({ isDefault: false }), { transaction });
    });

    test('the vehicles are counted after locking the user, so two registrations at once cannot both be the default', async () => {
        // Act
        await send('post', '/api/vehicles', NEW_CAR);

        // Assert
        const call = userLockCall();
        expect(lockUser.mock.calls[call]).toEqual([USER_ID, expect.objectContaining({ transaction, lock: 'UPDATE' })]);
        expect(countVehicles).toHaveBeenCalledWith({ where: { userId: USER_ID }, transaction });
        expect(lockUser.mock.invocationCallOrder[call]).toBeLessThan(countVehicles.mock.invocationCallOrder[0]);
    });

    test('the plate is saved in capital letters', async () => {
        // Act
        await send('post', '/api/vehicles', { ...NEW_CAR, plate: 'abc123' });

        // Assert
        expect(createVehicle).toHaveBeenCalledWith(expect.objectContaining({ plate: 'ABC123' }), { transaction });
    });

    test.each([
        ['a car with a motorcycle plate', 'car', 'ABC12D'],
        ['a truck with a motorcycle plate', 'truck', 'ABC12D'],
        ['a motorcycle with a car plate', 'motorcycle', 'ABC123'],
        ['a car with a plate too short', 'car', 'AB123'],
    ])('%s answers 400 INVALID_PLATE_FORMAT', async (name, vehicleType, plate) => {
        // Act
        const res = await send('post', '/api/vehicles', { ...NEW_CAR, vehicleType, plate });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PLATE_FORMAT');
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('a motorcycle with its own plate format is accepted', async () => {
        // Act
        const res = await send('post', '/api/vehicles', { ...NEW_CAR, vehicleType: 'motorcycle', plate: 'ABC12D' });

        // Assert
        expect(res.status).toBe(201);
    });

    test('a plate already registered answers 409 PLATE_ALREADY_REGISTERED', async () => {
        // Arrange
        findPlate.mockResolvedValue(vehicle({ userId: 'another-user' }));

        // Act
        const res = await send('post', '/api/vehicles', NEW_CAR);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PLATE_ALREADY_REGISTERED');
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('the same plate registered at the same moment by another request also answers 409, not 500', async () => {
        // Arrange: the check found nothing, but the unique index stops the second one
        createVehicle.mockRejectedValue(new UniqueConstraintError({ message: 'Duplicate entry' }));

        // Act
        const res = await send('post', '/api/vehicles', NEW_CAR);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('PLATE_ALREADY_REGISTERED');
    });

    test('a vehicle type that does not exist answers 400 VALIDATION_ERROR', async () => {
        // Act
        const res = await send('post', '/api/vehicles', { ...NEW_CAR, vehicleType: 'bus' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(createVehicle).not.toHaveBeenCalled();
    });
});

describe('Choosing the default vehicle (HU-11, AC-06)', () => {
    let readVehicle;
    let clearDefaults;

    beforeEach(() => {
        readVehicle = jest.spyOn(Vehiculo, 'findOne');
        clearDefaults = jest.spyOn(Vehiculo, 'update').mockResolvedValue([1]);
    });

    test('the other default is cleared and this vehicle becomes the default one', async () => {
        // Arrange: read before the lock and again after it
        const actual = vehicle();
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(actual);

        // Act
        const res = await send('patch', `/api/vehicles/${VEHICLE_ID}/default`);

        // Assert
        expect(res.status).toBe(200);
        expect(actual.update).toHaveBeenCalledWith({ isDefault: true }, { transaction });
        expect(clearDefaults.mock.invocationCallOrder[0]).toBeLessThan(actual.update.mock.invocationCallOrder[0]);
    });

    test('this vehicle is left out when the other defaults are cleared, so a second click never leaves the user without one', async () => {
        // Arrange
        readVehicle.mockResolvedValueOnce(vehicle({ isDefault: true })).mockResolvedValueOnce(vehicle({ isDefault: true }));

        // Act
        await send('patch', `/api/vehicles/${VEHICLE_ID}/default`);

        // Assert
        const [values, { where }] = clearDefaults.mock.calls[0];
        expect(values).toEqual({ isDefault: false });
        expect(where.userId).toBe(USER_ID);
        expect(where.isDefault).toBe(true);
        expect(where.id[Op.ne]).toBe(VEHICLE_ID);
    });

    test('the vehicle is read again after locking the user', async () => {
        // Arrange
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(vehicle());

        // Act
        await send('patch', `/api/vehicles/${VEHICLE_ID}/default`);

        // Assert
        expect(readVehicle.mock.calls[1][0]).toEqual({ where: { id: VEHICLE_ID, userId: USER_ID }, transaction });
        expect(lockUser.mock.invocationCallOrder[userLockCall()]).toBeLessThan(readVehicle.mock.invocationCallOrder[1]);
    });

    test('a vehicle of another user answers 404 VEHICLE_NOT_FOUND', async () => {
        // Arrange
        readVehicle.mockResolvedValue(null);

        // Act
        const res = await send('patch', `/api/vehicles/${VEHICLE_ID}/default`);

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('VEHICLE_NOT_FOUND');
        expect(readVehicle).toHaveBeenCalledWith({ where: { id: VEHICLE_ID, userId: USER_ID } });
        expect(clearDefaults).not.toHaveBeenCalled();
    });

    test('a vehicle deleted by another request while this one waited answers 404 and changes nothing', async () => {
        // Arrange
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(null);

        // Act
        const res = await send('patch', `/api/vehicles/${VEHICLE_ID}/default`);

        // Assert
        expect(res.status).toBe(404);
        expect(clearDefaults).not.toHaveBeenCalled();
    });
});

describe('Deleting a vehicle (HU-13)', () => {
    let readVehicle;
    let findActiveReservation;

    beforeEach(() => {
        readVehicle = jest.spyOn(Vehiculo, 'findOne');
        findActiveReservation = jest.spyOn(Reserva, 'findOne').mockResolvedValue(null);
    });

    test('a vehicle with a pending or active reservation answers 409 VEHICLE_HAS_ACTIVE_RESERVATION and is kept (AC-02)', async () => {
        // Arrange
        const actual = vehicle();
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(actual);
        findActiveReservation.mockResolvedValue({ id: 'reservation-1' });

        // Act
        const res = await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('VEHICLE_HAS_ACTIVE_RESERVATION');
        expect(findActiveReservation).toHaveBeenCalledWith({ where: { vehicleId: VEHICLE_ID, status: ['Pending', 'Active'] }, transaction });
        expect(actual.destroy).not.toHaveBeenCalled();
    });

    test('deleting the default vehicle makes the newest remaining one the default (AC-04)', async () => {
        // Arrange
        const actual = vehicle({ isDefault: true });
        const next = vehicle({ id: NEXT_VEHICLE_ID, plate: 'XYZ987' });
        readVehicle.mockResolvedValueOnce(vehicle({ isDefault: true })).mockResolvedValueOnce(actual).mockResolvedValueOnce(next);

        // Act
        const res = await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(res.status).toBe(200);
        expect(actual.destroy).toHaveBeenCalledWith({ transaction });
        expect(readVehicle.mock.calls[2][0]).toEqual({ where: { userId: USER_ID }, order: [['created_at', 'DESC']], transaction });
        expect(next.update).toHaveBeenCalledWith({ isDefault: true }, { transaction });
    });

    test('deleting a vehicle that is not the default one leaves the default as it is', async () => {
        // Arrange
        const actual = vehicle({ isDefault: false });
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(actual);

        // Act
        const res = await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(res.status).toBe(200);
        expect(actual.destroy).toHaveBeenCalled();
        expect(readVehicle).toHaveBeenCalledTimes(2);
    });

    test('deleting the only vehicle leaves the user without vehicles, and without errors', async () => {
        // Arrange
        readVehicle.mockResolvedValueOnce(vehicle({ isDefault: true })).mockResolvedValueOnce(vehicle({ isDefault: true })).mockResolvedValueOnce(null);

        // Act
        const res = await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(res.status).toBe(200);
    });

    test('a vehicle of another user answers 404 VEHICLE_NOT_FOUND', async () => {
        // Arrange
        readVehicle.mockResolvedValue(null);

        // Act
        const res = await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('VEHICLE_NOT_FOUND');
        expect(readVehicle).toHaveBeenCalledWith({ where: { id: VEHICLE_ID, userId: USER_ID } });
    });

    test('the reservations are checked after locking the user, so a reservation created at the same time is seen (#288)', async () => {
        // Arrange
        readVehicle.mockResolvedValueOnce(vehicle()).mockResolvedValueOnce(vehicle());

        // Act
        await send('delete', `/api/vehicles/${VEHICLE_ID}`);

        // Assert
        expect(lockUser.mock.invocationCallOrder[userLockCall()]).toBeLessThan(findActiveReservation.mock.invocationCallOrder[0]);
    });
});

describe('Editing a vehicle (HU-12)', () => {
    test('a vehicle of another user answers 404 VEHICLE_NOT_FOUND', async () => {
        // Arrange: the vehicle is only searched among the vehicles of this user
        const findVehicle = jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(null);

        // Act
        const res = await send('put', `/api/vehicles/${VEHICLE_ID}`, { vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo' });

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('VEHICLE_NOT_FOUND');
        expect(findVehicle).toHaveBeenCalledWith({ where: { id: VEHICLE_ID, userId: USER_ID } });
    });

    test('changing the type to one that does not match the plate answers 400 INVALID_PLATE_FORMAT (AC-05)', async () => {
        // Arrange
        const actual = vehicle({ plate: 'ABC123', vehicleType: 'car' });
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(actual);

        // Act
        const res = await send('put', `/api/vehicles/${VEHICLE_ID}`, { vehicleType: 'motorcycle', brand: 'Yamaha', model: 'FZ', color: 'Azul' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_PLATE_FORMAT');
        expect(actual.update).not.toHaveBeenCalled();
    });

    test('the data is saved and the plate and the default are never changed', async () => {
        // Arrange
        const actual = vehicle();
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue(actual);

        // Act
        const res = await send('put', `/api/vehicles/${VEHICLE_ID}`, { vehicleType: 'truck', brand: 'Chevrolet', model: 'NHR', color: 'Blanco', plate: 'ZZZ999', isDefault: true });

        // Assert
        expect(res.status).toBe(200);
        expect(actual.update).toHaveBeenCalledWith({ vehicleType: 'truck', brand: 'Chevrolet', model: 'NHR', color: 'Blanco', visualDescription: undefined });
    });
});
