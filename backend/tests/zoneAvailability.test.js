const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, ZoneVehicleType, ParkingSpot, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// #373: the free spots of each zone are calculated from the reservations.
// HU-31: for each vehicle type the zone accepts, and the zone sends the sums.
// "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const CENTRO = '22222222-2222-4222-8222-222222222222';
const NORTE = '55555555-5555-4555-8555-555555555555';
const SUR = '66666666-6666-4666-8666-666666666666';
const ADMIN_ID = '99999999-9999-4999-8999-999999999999';
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);
// The transaction the reads of a zone and its free spots share (#373)
const TRANSACTION = { id: 'zone-reads' };
const asAdmin = (req) => req.set('Authorization', `Bearer ${adminToken}`);

// A zone as the model gives it, read with its hours
function zone(id, name, totalSlots) {
    return Zona.build(
        { id, name, address: 'Calle 1', totalSlots, hourlyRate: '2000.00', isActive: true, open24h: true, schedules: [] },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
}

// HU-31: the vehicle types of the zones, as the model gives them: each item
// is [zoneId, vehicleType, totalSlots, hourlyRate, isAccepting]
function vehicleTypes(...rows) {
    return jest.spyOn(ZoneVehicleType, 'findAll').mockImplementation(async ({ where }) => rows
        .map(([zoneId, vehicleType, totalSlots, hourlyRate = '2000.00', isAccepting = true]) => ZoneVehicleType.build({ zoneId, vehicleType, totalSlots, hourlyRate, isAccepting }))
        .filter((tipo) => where.zoneId.includes(tipo.zoneId) && (where.isAccepting === undefined || tipo.isAccepting === where.isAccepting)));
}

// The car type of each zone, with all its spots
const carsOf = (...zones) => vehicleTypes(...zones.map((z) => [z.id, 'car', z.totalSlots]));

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // A managed transaction: it runs the function with its transaction
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work(TRANSACTION));
});

// Every read was made in the same transaction, so they see the same moment
// and a capacity changed meanwhile never gives more free spots than it
function expectOneMoment(...spies) {
    expect(sequelize.transaction).toHaveBeenCalledTimes(1);
    for (const spy of spies) expect(spy.mock.calls[0].at(-1).transaction).toBe(TRANSACTION);
}

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('GET /api/zones (HU-09, #373)', () => {
    test('each zone has the spots free for 30 minutes from now, all counted in one query', async () => {
        // Arrange
        const zonas = [zone(CENTRO, 'Centro', 10), zone(NORTE, 'Norte', 4)];
        jest.spyOn(Zona, 'findAll').mockResolvedValue(zonas);
        carsOf(...zonas);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 6 }, { zoneId: NORTE, vehicleType: 'car', free: 1 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zones.map((z) => [z.name, z.availableSlots])).toEqual([['Centro', 6], ['Norte', 1]]);
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        const { where, group } = ParkingSpot.findAll.mock.calls[0][0];
        expect(where.zoneId).toEqual([CENTRO, NORTE]);
        expect(group).toEqual(['zoneId', 'vehicleType']);
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
        expect(ZoneVehicleType.findAll).toHaveBeenCalledTimes(1);
        expect(ZoneVehicleType.findAll.mock.calls[0][0].where).toEqual({ zoneId: [CENTRO, NORTE], isAccepting: true });
        expectOneMoment(Zona.findAll, ZoneVehicleType.findAll, ParkingSpot.findAll);
    });

    test('lists the zones by the share of free spots, the highest first, and a full zone last', async () => {
        // Arrange: Centro has 3 of 10 free, Norte 2 of 4 and Sur none
        const zonas = [zone(SUR, 'Sur', 5), zone(CENTRO, 'Centro', 10), zone(NORTE, 'Norte', 4)];
        jest.spyOn(Zona, 'findAll').mockResolvedValue(zonas);
        carsOf(...zonas);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 3 }, { zoneId: NORTE, vehicleType: 'car', free: 2 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.body.zones.map((z) => [z.name, z.availableSlots])).toEqual([['Norte', 2], ['Centro', 3], ['Sur', 0]]);
    });

    test('zones with the same share go by name', async () => {
        // Arrange
        const zonas = [zone(NORTE, 'Norte', 4), zone(CENTRO, 'Centro', 4)];
        jest.spyOn(Zona, 'findAll').mockResolvedValue(zonas);
        carsOf(...zonas);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 4 }, { zoneId: NORTE, vehicleType: 'car', free: 4 }]);

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.body.zones.map((z) => z.name)).toEqual(['Centro', 'Norte']);
    });

    test('only the active zones are listed, with their hours', async () => {
        // Arrange
        jest.spyOn(Zona, 'findAll').mockResolvedValue([]);
        jest.spyOn(ZoneVehicleType, 'findAll');
        jest.spyOn(ParkingSpot, 'findAll');

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zones).toEqual([]);
        expect(Zona.findAll).toHaveBeenCalledWith(expect.objectContaining({ where: { isActive: true } }));
        expect(ZoneVehicleType.findAll).not.toHaveBeenCalled();
        expect(ParkingSpot.findAll).not.toHaveBeenCalled();
    });
});

describe('GET /api/zones/:id (HU-14, #373)', () => {
    test('the zone has its spots free for 30 minutes from now', async () => {
        // Arrange
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zone(CENTRO, 'Centro', 10));
        vehicleTypes([CENTRO, 'car', 10]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 8 }]);

        // Act
        const res = await request(app).get(`/api/zones/${CENTRO}`);

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ id: CENTRO, totalSlots: 10, availableSlots: 8 });
        const { where } = ParkingSpot.findAll.mock.calls[0][0];
        expect(where).toMatchObject({ zoneId: [CENTRO], status: { [Op.ne]: 'Disabled' } });
        expect(where[Op.and][0].val).toContain("r.start_time < '2026-11-16 13:40:00'");
        expectOneMoment(Zona.findByPk, ZoneVehicleType.findAll, ParkingSpot.findAll);
    });

    test('a zone that does not exist answers 404 and counts nothing', async () => {
        // Arrange
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(null);
        jest.spyOn(ZoneVehicleType, 'findAll');
        jest.spyOn(ParkingSpot, 'findAll');

        // Act
        const res = await request(app).get(`/api/zones/${CENTRO}`);

        // Assert
        expect(res.status).toBe(404);
        expect(ZoneVehicleType.findAll).not.toHaveBeenCalled();
        expect(ParkingSpot.findAll).not.toHaveBeenCalled();
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
        const zonas = [centro, zone(NORTE, 'Norte', 4)];
        jest.spyOn(Zona, 'findAll').mockResolvedValue(zonas);
        carsOf(...zonas);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 8 }, { zoneId: NORTE, vehicleType: 'car', free: 4 }]);
        // First the spots in use of each type, then of each zone
        jest.spyOn(Reserva, 'findAll')
            .mockResolvedValueOnce([{ zoneId: CENTRO, vehicleType: 'car', spots: 2, reservations: 3 }])
            .mockResolvedValueOnce([{ zoneId: CENTRO, spots: 2 }]);

        // Act
        const res = await asAdmin(request(app).get('/api/zones/all'));

        // Assert: Centro has 3 reservations in 2 of its spots
        expect(res.status).toBe(200);
        expect(res.body.zones.map((z) => [z.name, z.availableSlots, z.spotsInUse])).toEqual([['Centro', 8, 2], ['Norte', 4, 0]]);
        expect(res.body.zones[0].activeReservations).toBe(3);
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        expect(Reserva.findAll).toHaveBeenCalledTimes(2);
        for (const [options] of Reserva.findAll.mock.calls) {
            expect(options.where).toMatchObject({ zoneId: [CENTRO, NORTE], endTime: { [Op.gt]: NOW } });
        }
        expectOneMoment(Zona.findAll, ZoneVehicleType.findAll, ParkingSpot.findAll, Reserva.findAll);
    });

    test('PATCH /api/zones/:id/toggle sends the zone with its free spots', async () => {
        // Arrange
        const centro = zone(CENTRO, 'Centro', 10);
        jest.spyOn(centro, 'update').mockImplementation(async (values) => centro.set(values));
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(centro);
        vehicleTypes([CENTRO, 'car', 10]);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 9 }]);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([]);

        // Act
        const res = await asAdmin(request(app).patch(`/api/zones/${CENTRO}/toggle`).send({ isActive: false }));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ id: CENTRO, isActive: false, availableSlots: 9 });
        expectOneMoment(Zona.findByPk, ZoneVehicleType.findAll, ParkingSpot.findAll, Reserva.findAll);
    });

    test('PATCH /api/zones/:id/toggle counts the free spots before saving, so a failed count changes nothing and can be repeated', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        const centro = zone(CENTRO, 'Centro', 10);
        jest.spyOn(centro, 'update').mockImplementation(async (values) => centro.set(values));
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(centro);
        vehicleTypes([CENTRO, 'car', 10]);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([]);
        jest.spyOn(ParkingSpot, 'findAll').mockRejectedValueOnce(new Error('Connection lost')).mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 9 }]);

        // Act
        const failed = await asAdmin(request(app).patch(`/api/zones/${CENTRO}/toggle`).send({ isActive: false }));
        const again = await asAdmin(request(app).patch(`/api/zones/${CENTRO}/toggle`).send({ isActive: false }));

        // Assert: the first one saved nothing, so the second one deactivates it
        expect(failed.status).toBe(500);
        expect(centro.update).toHaveBeenCalledTimes(1);
        expect(again.status).toBe(200);
        expect(again.body.zone).toMatchObject({ isActive: false, availableSlots: 9 });
        expect(ParkingSpot.findAll.mock.invocationCallOrder[1]).toBeLessThan(centro.update.mock.invocationCallOrder[0]);
    });
});

describe('The vehicle types of the zones (HU-31)', () => {
    beforeEach(() => {
        // The session of the administrator (auth middleware)
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
    });

    // Centro: 10 cars (6 free) and 4 motorcycles (1 free) that it accepts,
    // and 2 trucks that it no longer accepts (2 free)
    function arrangeCentro() {
        const centro = zone(CENTRO, 'Centro', 14);
        jest.spyOn(Zona, 'findAll').mockResolvedValue([centro]);
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(centro);
        vehicleTypes([CENTRO, 'truck', 2, '9000.00', false], [CENTRO, 'motorcycle', 4, '1500.00'], [CENTRO, 'car', 10, '2500.00']);
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([
            { zoneId: CENTRO, vehicleType: 'car', free: 6 },
            { zoneId: CENTRO, vehicleType: 'motorcycle', free: 1 },
            { zoneId: CENTRO, vehicleType: 'truck', free: 2 },
        ]);
        return centro;
    }

    test('a zone sends the types it accepts, in the order car, motorcycle, truck, with their spots, free spots and rates as numbers', async () => {
        // Arrange
        arrangeCentro();

        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.body.zones[0].vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 10, availableSlots: 6, hourlyRate: 2500 },
            { vehicleType: 'motorcycle', totalSlots: 4, availableSlots: 1, hourlyRate: 1500 },
        ]);
    });

    test.each([
        ['the list', '/api/zones', (body) => body.zones[0]],
        ['the detail', `/api/zones/${CENTRO}`, (body) => body.zone],
    ])('in %s, the spots of the zone are the ones of the types it accepts, and the zone has no rate of its own', async (_case, url, zoneOf) => {
        // Arrange
        arrangeCentro();

        // Act
        const res = await request(app).get(url);

        // Assert
        expect(res.status).toBe(200);
        expect(zoneOf(res.body)).toMatchObject({ totalSlots: 14, availableSlots: 7 });
        expect(zoneOf(res.body)).not.toHaveProperty('hourlyRate');
    });

    test('a type with no free spot sends 0', async () => {
        // Arrange
        arrangeCentro();
        ParkingSpot.findAll.mockResolvedValue([{ zoneId: CENTRO, vehicleType: 'car', free: 6 }]);

        // Act
        const res = await request(app).get(`/api/zones/${CENTRO}`);

        // Assert
        expect(res.body.zone.vehicleTypes.map((tipo) => tipo.availableSlots)).toEqual([6, 0]);
        expect(res.body.zone.availableSlots).toBe(6);
    });

    test('the administrator also gets the types that are turned off, and for each one its spots in use and its open reservations', async () => {
        // Arrange: 2 reservations in the same car spot, and 1 in a truck spot
        arrangeCentro();
        jest.spyOn(Reserva, 'findAll')
            .mockResolvedValueOnce([
                { zoneId: CENTRO, vehicleType: 'car', spots: 1, reservations: 2 },
                { zoneId: CENTRO, vehicleType: 'truck', spots: 1, reservations: 1 },
            ])
            .mockResolvedValueOnce([{ zoneId: CENTRO, spots: 2 }]);

        // Act
        const res = await asAdmin(request(app).get('/api/zones/all'));

        // Assert: the spots of the zone are still the ones of the types it accepts
        expect(res.status).toBe(200);
        expect(res.body.zones[0]).toMatchObject({ totalSlots: 14, availableSlots: 7, spotsInUse: 2 });
        expect(res.body.zones[0].vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 10, availableSlots: 6, hourlyRate: 2500, isAccepting: true, spotsInUse: 1, openReservations: 2 },
            { vehicleType: 'motorcycle', totalSlots: 4, availableSlots: 1, hourlyRate: 1500, isAccepting: true, spotsInUse: 0, openReservations: 0 },
            { vehicleType: 'truck', totalSlots: 2, availableSlots: 2, hourlyRate: 9000, isAccepting: false, spotsInUse: 1, openReservations: 1 },
        ]);
        expect(ZoneVehicleType.findAll.mock.calls[0][0].where).toEqual({ zoneId: [CENTRO] });
        const [byType] = Reserva.findAll.mock.calls[0];
        expect(byType.group).toEqual(['zoneId', 'parkingSpot.vehicle_type']);
    });

    test('toggling a zone sends it to the administrator with every type', async () => {
        // Arrange
        const centro = arrangeCentro();
        jest.spyOn(centro, 'update').mockImplementation(async (values) => centro.set(values));
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([]);

        // Act
        const res = await asAdmin(request(app).patch(`/api/zones/${CENTRO}/toggle`).send({ isActive: true }));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone.vehicleTypes.map((tipo) => [tipo.vehicleType, tipo.isAccepting])).toEqual([['car', true], ['motorcycle', true], ['truck', false]]);
        expect(res.body.zone).toMatchObject({ totalSlots: 14, availableSlots: 7 });
    });
});

describe('GET /api/zones/:id/spots (#373)', () => {
    test('no longer exists: its Occupied would not be true with spots by time range', async () => {
        // Arrange: the session of the administrator (auth middleware)
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } });
        jest.spyOn(Zona, 'findByPk');

        // Act
        const res = await asAdmin(request(app).get(`/api/zones/${CENTRO}/spots`));

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ROUTE_NOT_FOUND');
        expect(Zona.findByPk).not.toHaveBeenCalled();
    });
});
