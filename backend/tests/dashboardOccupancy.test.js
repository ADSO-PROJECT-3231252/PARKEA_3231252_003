const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneVehicleType, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-22 and #373: the occupation and the alerts of the dashboard come from
// the same calculation as availableSlots. HU-31 (AC-14): for each vehicle
// type the zone accepts. "Now" is Tuesday 2026-11-10 at 10:00 a. m. in
// Colombia (15:00 UTC).
const NOW = new Date('2026-11-10T15:00:00Z');
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CENTRO = '22222222-2222-4222-8222-222222222222';
const NORTE = '55555555-5555-4555-8555-555555555555';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
// The transaction both reads share (#373)
const TRANSACTION = { id: 'dashboard-reads' };
const get = (path) => request(app).get(`/api/admin/dashboard/${path}`).set('Authorization', `Bearer ${adminToken}`);

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // The session of the admin (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    jest.spyOn(Zona, 'findAll').mockImplementation(async () => [
        Zona.build({ id: CENTRO, name: 'Centro' }),
        Zona.build({ id: NORTE, name: 'Norte' }),
    ]);
    // Centro takes 10 cars and 4 motorcycles, and its trucks are turned off;
    // Norte takes 4 cars
    jest.spyOn(ZoneVehicleType, 'findAll').mockImplementation(async ({ where }) => [
        [CENTRO, 'car', 10, true],
        [CENTRO, 'motorcycle', 4, true],
        [CENTRO, 'truck', 2, false],
        [NORTE, 'car', 4, true],
    ].filter(([, , , isAccepting]) => where.isAccepting === undefined || isAccepting === where.isAccepting)
        .map(([zoneId, vehicleType, totalSlots, isAccepting]) => ZoneVehicleType.build({ zoneId, vehicleType, totalSlots, hourlyRate: '2000.00', isAccepting })));
    // Free now: 7 cars and 1 motorcycle in Centro, its 2 trucks, and nothing in Norte
    jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([
        { zoneId: CENTRO, vehicleType: 'car', free: 7 },
        { zoneId: CENTRO, vehicleType: 'motorcycle', free: 1 },
        { zoneId: CENTRO, vehicleType: 'truck', free: 2 },
    ]);
    // A managed transaction: it runs the function with its transaction
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work(TRANSACTION));
});

// The zones, their types and their free spots were read in the same transaction
function expectOneMoment() {
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    expect(Zona.findAll.mock.calls[0][0].transaction).toBe(TRANSACTION);
    expect(ZoneVehicleType.findAll.mock.calls[0][0].transaction).toBe(TRANSACTION);
    expect(ParkingSpot.findAll.mock.calls[0][0].transaction).toBe(TRANSACTION);
}

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('GET /api/admin/dashboard/occupancy (HU-22, #373)', () => {
    test('the occupied spots of each active zone and of each type it accepts are the ones not free now, counted in one query', async () => {
        // Act
        const res = await get('occupancy');

        // Assert: the trucks of Centro are turned off, so they do not count
        expect(res.status).toBe(200);
        expect(res.body.occupancy).toEqual([
            {
                zoneId: CENTRO,
                zoneName: 'Centro',
                totalSlots: 14,
                occupiedSlots: 6,
                vehicleTypes: [
                    { vehicleType: 'car', totalSlots: 10, occupiedSlots: 3 },
                    { vehicleType: 'motorcycle', totalSlots: 4, occupiedSlots: 3 },
                ],
            },
            {
                zoneId: NORTE,
                zoneName: 'Norte',
                totalSlots: 4,
                occupiedSlots: 4,
                vehicleTypes: [{ vehicleType: 'car', totalSlots: 4, occupiedSlots: 4 }],
            },
        ]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ZoneVehicleType.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { zoneId: [CENTRO, NORTE], isAccepting: true } }));
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        const { where, group } = ParkingSpot.findAll.mock.calls[0][0];
        expect(where.zoneId).toEqual([CENTRO, NORTE]);
        expect(group).toEqual(['zoneId', 'vehicleType']);
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-10 15:40:00'");
    });

    test('the zones and their free spots are read in one transaction, so a capacity changed between them never gives a negative number', async () => {
        // Act
        await get('occupancy');

        // Assert
        expectOneMoment();
    });
});

describe('GET /api/admin/dashboard/alerts (HU-22, #373)', () => {
    test('a type with no spot free now in a zone is full, with one alert that says the type', async () => {
        // Arrange: Centro has no motorcycle spot free now
        ParkingSpot.findAll.mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 7 }]);

        // Act
        const res = await get('alerts');

        // Assert: its trucks are turned off, so they give no alert
        expect(res.status).toBe(200);
        expect(res.body.alerts).toEqual([
            { type: 'zone_full', severity: 'warning', zoneName: 'Centro', zoneId: CENTRO, vehicleType: 'motorcycle' },
            { type: 'zone_full', severity: 'warning', zoneName: 'Norte', zoneId: NORTE, vehicleType: 'car' },
        ]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        expectOneMoment();
    });

    test('with spots free of every type in every zone there is no alert', async () => {
        // Arrange
        ParkingSpot.findAll.mockResolvedValue([
            { zoneId: CENTRO, vehicleType: 'car', free: 7 },
            { zoneId: CENTRO, vehicleType: 'motorcycle', free: 1 },
            { zoneId: NORTE, vehicleType: 'car', free: 1 },
        ]);

        // Act
        const res = await get('alerts');

        // Assert
        expect(res.body.alerts).toEqual([]);
    });
});
