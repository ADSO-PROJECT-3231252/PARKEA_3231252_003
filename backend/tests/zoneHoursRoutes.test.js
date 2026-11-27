const jwt = require('jsonwebtoken');
const request = require('supertest');
const availability = require('../src/services/availability');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ZoneVehicleType, ParkingSpot, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-29: POST and PUT /zones check the opening hours before touching the
// database, and save them with the zone. The rules of each day are tested in
// zoneHours.test.js and validarHorario in zona.validation.test.js; here, that
// both routes really use them.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const token = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);

// A valid zone, without its hours
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, vehicleTypes: [{ vehicleType: 'car', totalSlots: 10, hourlyRate: 2000 }] };
// Open Monday to Friday from 6:00 a. m. to 8:00 p. m.
const WEEKDAYS = [1, 2, 3, 4, 5].map((day) => ({ day, opensAt: '06:00', closesAt: '20:00' }));
// Wednesday closes before it opens
const WRONG_WEDNESDAY = WEEKDAYS.map((s) => (s.day === 3 ? { ...s, opensAt: '20:00', closesAt: '06:00' } : s));

const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
const send = (method, path, body) => request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);

// A zone as the model gives it, without a database behind it
function zoneInstance(values = {}) {
    const zona = Zona.build({ id: ZONE_ID, ...ZONE, isActive: true, open24h: true, ...values });
    jest.spyOn(zona, 'reload').mockResolvedValue(zona);
    jest.spyOn(zona, 'update').mockResolvedValue(zona);
    return zona;
}

let startTransaction;
let saveHours;
let deleteHours;

beforeEach(() => {
    // The session of the admin (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    startTransaction = jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    saveHours = jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
    deleteHours = jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
    jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);
    jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
    // HU-31: the vehicle types of the zone and their spots, saved with it
    // (tests/zoneVehicleTypesSave.test.js) and counted when it is sent
    // (tests/zoneAvailability.test.js)
    jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([]);
    jest.spyOn(ZoneVehicleType, 'bulkCreate').mockResolvedValue([]);
    jest.spyOn(ZoneVehicleType, 'create').mockResolvedValue({});
    jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([]);
    jest.spyOn(ParkingSpot, 'max').mockResolvedValue(0);
    jest.spyOn(availability, 'availableNowByZoneAndType').mockResolvedValue(new Map());
    jest.spyOn(availability, 'inUseByZoneAndType').mockResolvedValue(new Map());
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Creating a zone with its opening hours (HU-29, AC-01 and AC-02)', () => {
    let createZone;

    beforeEach(() => {
        createZone = jest.spyOn(Zona, 'create').mockImplementation(async (values) => zoneInstance(values));
    });

    test('two requests for the same zone name return 201 and 409', async () => {
        // Both requests pass the initial name check. The unique index rejects one insert.
        const duplicateName = Object.assign(new Error('Duplicate zone name'), {
            name: 'SequelizeUniqueConstraintError',
            fields: { zones_name_unique: ZONE.name },
        });
        createZone.mockRejectedValueOnce(duplicateName);

        const body = { ...ZONE, open24h: true };
        const responses = await Promise.all([
            send('post', '/api/zones', body),
            send('post', '/api/zones', body),
        ]);

        expect(createZone).toHaveBeenCalledTimes(2);
        expect(responses.map((res) => res.status).sort()).toEqual([201, 409]);

        const conflict = responses.find((res) => res.status === 409);
        expect(conflict.body.code).toBe('ZONE_NAME_TAKEN');
    });

    test('without choosing the hours it answers 400 on open24h and creates nothing', async () => {
        // Act
        const res = await send('post', '/api/zones', ZONE);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'VALIDATION_ERROR', errors: [{ path: 'open24h', msg: 'open24h must be true or false' }] });
        expect(startTransaction).not.toHaveBeenCalled();
        expect(createZone).not.toHaveBeenCalled();
    });

    test('a day that closes before it opens answers 400 with that day and creates nothing', async () => {
        // Act
        const res = await send('post', '/api/zones', { ...ZONE, open24h: false, schedule: WRONG_WEDNESDAY });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors).toEqual([expect.objectContaining({ path: 'schedule', day: 3 })]);
        expect(startTransaction).not.toHaveBeenCalled();
        expect(createZone).not.toHaveBeenCalled();
        expect(saveHours).not.toHaveBeenCalled();
    });

    test('a valid custom schedule is saved with the zone, one row per open day', async () => {
        // Act
        const res = await send('post', '/api/zones', { ...ZONE, open24h: false, schedule: WEEKDAYS });

        // Assert
        expect(res.status).toBe(201);
        expect(createZone).toHaveBeenCalledWith(expect.objectContaining({ open24h: false }), expect.anything());
        expect(saveHours).toHaveBeenCalledWith(
            WEEKDAYS.map(({ day, opensAt, closesAt }) => ({ zoneId: ZONE_ID, dayOfWeek: day, opensAt, closesAt })),
            expect.objectContaining({ transaction }),
        );
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('a zone open 24 hours is saved without rows', async () => {
        // Act
        const res = await send('post', '/api/zones', { ...ZONE, open24h: true });

        // Assert
        expect(res.status).toBe(201);
        expect(createZone).toHaveBeenCalledWith(expect.objectContaining({ open24h: true }), expect.anything());
        expect(saveHours).toHaveBeenCalledWith([], expect.anything());
    });
});

describe('Editing the opening hours of a zone (HU-29, AC-02 and AC-07)', () => {
    let readZone;
    let zona;

    beforeEach(() => {
        zona = zoneInstance();
        readZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
        // HU-31: its car type keeps its 10 spots
        const carType = ZoneVehicleType.build({ zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 10, hourlyRate: '2000.00', isAccepting: true });
        jest.spyOn(carType, 'update').mockResolvedValue(carType);
        jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([carType]);
    });

    test('without choosing the hours it answers 400 on open24h and changes nothing', async () => {
        // Act
        const res = await send('put', `/api/zones/${ZONE_ID}`, ZONE);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([{ path: 'open24h', msg: 'open24h must be true or false' }]);
        expect(readZone).not.toHaveBeenCalled();
        expect(deleteHours).not.toHaveBeenCalled();
    });

    test('a day that closes before it opens answers 400 with that day and changes nothing', async () => {
        // Act
        const res = await send('put', `/api/zones/${ZONE_ID}`, { ...ZONE, open24h: false, schedule: WRONG_WEDNESDAY });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([expect.objectContaining({ path: 'schedule', day: 3 })]);
        expect(readZone).not.toHaveBeenCalled();
        expect(deleteHours).not.toHaveBeenCalled();
        expect(saveHours).not.toHaveBeenCalled();
    });

    test('valid hours replace the old ones, and the reservations that exist are not touched', async () => {
        // Arrange
        const changeReservations = jest.spyOn(Reserva, 'update');

        // Act
        const res = await send('put', `/api/zones/${ZONE_ID}`, { ...ZONE, open24h: false, schedule: WEEKDAYS });

        // Assert
        expect(res.status).toBe(200);
        expect(zona.update).toHaveBeenCalledWith(expect.objectContaining({ open24h: false }), expect.anything());
        expect(deleteHours).toHaveBeenCalledWith(expect.objectContaining({ where: { zoneId: ZONE_ID }, transaction }));
        expect(saveHours).toHaveBeenCalledWith(
            WEEKDAYS.map(({ day, opensAt, closesAt }) => ({ zoneId: ZONE_ID, dayOfWeek: day, opensAt, closesAt })),
            expect.objectContaining({ transaction }),
        );
        // The old hours go first, or the new rows would be deleted too
        expect(deleteHours.mock.invocationCallOrder[0]).toBeLessThan(saveHours.mock.invocationCallOrder[0]);
        expect(changeReservations).not.toHaveBeenCalled();
    });

    test('changing to "Abierta 24 horas" deletes the rows and saves none', async () => {
        // Act
        const res = await send('put', `/api/zones/${ZONE_ID}`, { ...ZONE, open24h: true });

        // Assert
        expect(res.status).toBe(200);
        expect(deleteHours).toHaveBeenCalledWith(expect.objectContaining({ where: { zoneId: ZONE_ID } }));
        expect(saveHours).toHaveBeenCalledWith([], expect.anything());
    });

    test('two renames to the same name at once: the unique index rejects one, and it answers 409 (#304)', async () => {
        // Arrange: both requests pass the check of the name; the index rejects the second save
        const duplicateName = Object.assign(new Error('Duplicate zone name'), {
            name: 'SequelizeUniqueConstraintError',
            fields: { 'zones.zones_name_unique': 'Norte' },
        });
        zona.update.mockResolvedValueOnce(zona).mockRejectedValueOnce(duplicateName);
        const body = { ...ZONE, name: 'Norte', open24h: true };

        // Act
        const responses = await Promise.all([
            send('put', `/api/zones/${ZONE_ID}`, body),
            send('put', `/api/zones/${ZONE_ID}`, body),
        ]);

        // Assert
        expect(responses.map((res) => res.status).sort()).toEqual([200, 409]);
        const conflict = responses.find((res) => res.status === 409);
        expect(conflict.body).toEqual({ code: 'ZONE_NAME_TAKEN', message: 'A zone with this name already exists' });
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test('another unique index that fails is still a 500 (#304)', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const otherIndex = Object.assign(new Error('Duplicate spot'), {
            name: 'SequelizeUniqueConstraintError',
            fields: { 'parking_spots.parking_spots_zone_spot_unique': '1' },
        });
        zona.update.mockRejectedValueOnce(otherIndex);

        // Act
        const res = await send('put', `/api/zones/${ZONE_ID}`, { ...ZONE, open24h: true });

        // Assert
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
    });
});

describe('Setting the active state of a zone (#304)', () => {
    let zona;
    const path = `/api/zones/${ZONE_ID}/toggle`;

    beforeEach(() => {
        zona = zoneInstance();
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
        // HU-31: its car type, with 7 free spots
        jest.spyOn(ZoneVehicleType, 'findAll').mockResolvedValue([ZoneVehicleType.build({ zoneId: ZONE_ID, vehicleType: 'car', totalSlots: 10, hourlyRate: '2000.00' })]);
        jest.spyOn(availability, 'availableNowByZoneAndType').mockResolvedValue(new Map([[`${ZONE_ID}:car`, 7]]));
        startTransaction.mockImplementation(async (...args) => {
            const readZone = args.at(-1);
            return readZone(transaction);
        });
        zona.update.mockImplementation(async (values) => {
            zona.set(values);
            return zona;
        });
    });

    test('two deactivate requests both succeed and leave the zone inactive', async () => {
        const responses = await Promise.all([
            send('patch', path, { isActive: false }),
            send('patch', path, { isActive: false }),
        ]);

        for (const response of responses) {
            expect(response.status).toBe(200);
            expect(response.body.zone.isActive).toBe(false);
        }
        expect(zona.isActive).toBe(false);
    });

    test('an inactive zone can be activated', async () => {
        zona.set({ isActive: false });

        const response = await send('patch', path, { isActive: true });

        expect(response.status).toBe(200);
        expect(response.body.zone.isActive).toBe(true);
        expect(response.body.zone.availableSlots).toBe(7);
        expect(zona.isActive).toBe(true);
    });

    test.each([
        ['there is no body', undefined],
        ['isActive is missing', {}],
        ['isActive is a string', { isActive: 'false' }],
        ['isActive is a number', { isActive: 0 }],
        ['isActive is null', { isActive: null }],
    ])('rejects the request when %s, before reading the zone', async (_description, body) => {
        const response = await send('patch', path, body);

        expect(response.status).toBe(400);
        // The same shape as every validation error: errors with path and msg, no message
        expect(response.body).toEqual({
            code: 'VALIDATION_ERROR',
            errors: [{ path: 'isActive', msg: 'isActive must be true or false' }],
        });
        expect(startTransaction).not.toHaveBeenCalled();
        expect(Zona.findByPk).not.toHaveBeenCalled();
        expect(zona.update).not.toHaveBeenCalled();
    });
});
