const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ParkingSpot } = require('../src/models');
const app = require('../src/app');

// HU-22 and #373: the occupation and the alerts of the dashboard come from
// the same calculation as availableSlots. "Now" is Tuesday 2026-11-10 at
// 10:00 a. m. in Colombia (15:00 UTC).
const NOW = new Date('2026-11-10T15:00:00Z');
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const CENTRO = '22222222-2222-4222-8222-222222222222';
const NORTE = '55555555-5555-4555-8555-555555555555';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const get = (path) => request(app).get(`/api/admin/dashboard/${path}`).set('Authorization', `Bearer ${adminToken}`);

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // The session of the admin (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    jest.spyOn(Zona, 'findAll').mockResolvedValue([
        { id: CENTRO, name: 'Centro', totalSlots: 10 },
        { id: NORTE, name: 'Norte', totalSlots: 4 },
    ]);
    // Centro has 7 spots free now and Norte none
    jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, free: 7 }]);
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('GET /api/admin/dashboard/occupancy (HU-22, #373)', () => {
    test('the occupied spots of each active zone are the ones not free now, counted in one query', async () => {
        // Act
        const res = await get('occupancy');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.occupancy).toEqual([
            { zoneId: CENTRO, zoneName: 'Centro', totalSlots: 10, occupiedSlots: 3 },
            { zoneId: NORTE, zoneName: 'Norte', totalSlots: 4, occupiedSlots: 4 },
        ]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        const { where } = ParkingSpot.findAll.mock.calls[0][0];
        expect(where.zoneId).toEqual([CENTRO, NORTE]);
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-10 15:40:00'");
    });
});

describe('GET /api/admin/dashboard/alerts (HU-22, #373)', () => {
    test('a zone with no spot free now is full', async () => {
        // Act
        const res = await get('alerts');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.alerts).toEqual([{
            type: 'zone_full',
            severity: 'warning',
            message: 'La zona "Norte" ha alcanzado su capacidad máxima.',
            zoneId: NORTE,
        }]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
    });

    test('with spots free in every zone there is no alert', async () => {
        // Arrange
        ParkingSpot.findAll.mockResolvedValue([{ zoneId: CENTRO, free: 7 }, { zoneId: NORTE, free: 1 }]);

        // Act
        const res = await get('alerts');

        // Assert
        expect(res.body.alerts).toEqual([]);
    });
});
