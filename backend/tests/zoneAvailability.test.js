const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ParkingSpot, Reserva } = require('../src/models');
const app = require('../src/app');

// #373: the free spots of each zone are calculated from the reservations.
// "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const CENTRO = '22222222-2222-4222-8222-222222222222';
const NORTE = '55555555-5555-4555-8555-555555555555';
const SUR = '66666666-6666-4666-8666-666666666666';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);

// A zone as the model gives it, read with its hours
function zone(id, name, totalSlots) {
    return Zona.build(
        { id, name, address: 'Calle 1', totalSlots, hourlyRate: '2000.00', isActive: true, open24h: true, schedules: [] },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
}

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('GET /api/zones (HU-09, #373)', () => {
    test('each zone has the spots free for 30 minutes from now, all counted in one query', async () => {
        // Arrange
        jest.spyOn(Zona, 'findAll').mockResolvedValue([zone(CENTRO, 'Centro', 10), zone(NORTE, 'Norte', 4)]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, free: 6 }, { zoneId: NORTE, free: 1 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zones.map((z) => [z.name, z.availableSlots])).toEqual([['Centro', 6], ['Norte', 1]]);
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        const { where } = ParkingSpot.findAll.mock.calls[0][0];
        expect(where.zoneId).toEqual([CENTRO, NORTE]);
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
    });

    test('lists the zones by the share of free spots, the highest first, and a full zone last', async () => {
        // Arrange: Centro has 3 of 10 free, Norte 2 of 4 and Sur none
        jest.spyOn(Zona, 'findAll').mockResolvedValue([zone(SUR, 'Sur', 5), zone(CENTRO, 'Centro', 10), zone(NORTE, 'Norte', 4)]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, free: 3 }, { zoneId: NORTE, free: 2 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.body.zones.map((z) => [z.name, z.availableSlots])).toEqual([['Norte', 2], ['Centro', 3], ['Sur', 0]]);
    });

    test('zones with the same share go by name', async () => {
        // Arrange
        jest.spyOn(Zona, 'findAll').mockResolvedValue([zone(NORTE, 'Norte', 4), zone(CENTRO, 'Centro', 4)]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, free: 4 }, { zoneId: NORTE, free: 4 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.body.zones.map((z) => z.name)).toEqual(['Centro', 'Norte']);
    });

    test('only the active zones are listed, with their hours', async () => {
        // Arrange
        jest.spyOn(Zona, 'findAll').mockResolvedValue([]);
        jest.spyOn(ParkingSpot, 'findAll');

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zones).toEqual([]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ParkingSpot.findAll).not.toHaveBeenCalled();
    });
});

describe('GET /api/zones/:id (HU-14, #373)', () => {
    test('the zone has its spots free for 30 minutes from now', async () => {
        // Arrange
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zone(CENTRO, 'Centro', 10));
        jest.spyOn(ParkingSpot, 'count').mockResolvedValue(8);

        // Act
        const res = await request(app).get(`/api/zones/${CENTRO}`);

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ id: CENTRO, totalSlots: 10, availableSlots: 8 });
        const { where } = ParkingSpot.count.mock.calls[0][0];
        expect(where).toMatchObject({ zoneId: CENTRO, status: { [Op.ne]: 'Disabled' } });
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
    });

    test('a zone that does not exist answers 404 and counts nothing', async () => {
        // Arrange
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(null);
        jest.spyOn(ParkingSpot, 'count');

        // Act
        const res = await request(app).get(`/api/zones/${CENTRO}`);

        // Assert
        expect(res.status).toBe(404);
        expect(ParkingSpot.count).not.toHaveBeenCalled();
    });
});

describe('The zones of the administrator (HU-19, HU-21, #373)', () => {
    beforeEach(() => {
        // The session of the administrator (auth middleware)
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    });

    test('GET /api/zones/all sends the free spots and the spots in use of each zone, each counted in one query', async () => {
        // Arrange
        const centro = zone(CENTRO, 'Centro', 10);
        centro.setDataValue('activeReservations', 3);
        jest.spyOn(Zona, 'findAll').mockResolvedValue([centro, zone(NORTE, 'Norte', 4)]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, free: 8 }, { zoneId: NORTE, free: 4 }]);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ zoneId: CENTRO, spots: 2 }]);

        // Act
        const res = await asAdmin(request(app).get('/api/zones/all'));

        // Assert: Centro has 3 reservations in 2 of its spots
        expect(res.status).toBe(200);
        expect(res.body.zones.map((z) => [z.name, z.availableSlots, z.spotsInUse])).toEqual([['Centro', 8, 2], ['Norte', 4, 0]]);
        expect(res.body.zones[0].activeReservations).toBe(3);
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        expect(Reserva.findAll).toHaveBeenCalledTimes(1);
        expect(Reserva.findAll.mock.calls[0][0].where).toMatchObject({ zoneId: [CENTRO, NORTE], endTime: { [Op.gt]: NOW } });
    });

    test('PATCH /api/zones/:id/toggle sends the zone with its free spots', async () => {
        // Arrange
        const centro = zone(CENTRO, 'Centro', 10);
        jest.spyOn(centro, 'update').mockImplementation(async (values) => centro.set(values));
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(centro);
        jest.spyOn(ParkingSpot, 'count').mockResolvedValue(9);

        // Act
        const res = await asAdmin(request(app).patch(`/api/zones/${CENTRO}/toggle`));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ id: CENTRO, isActive: false, availableSlots: 9 });
    });
});
