const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL). What the SQL finds on a real database is checked in
// tests/integration.
const { Usuario, Vehiculo, Zona, ZoneSchedule, ParkingSpot, Pago, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');

// #375: GET /api/zones/:id/availability says how many spots of a zone are
// free for some hours, with the same rules as POST /reservations. The times
// are in Colombia (UTC-5), and "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time, date = '2026-11-16') => new Date(`${date}T${time}:00-05:00`);
const NOW = colombia('08:00');
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const userToken = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

// The transaction the reads of the zone and its free spots share. It also
// works as the transaction of POST /reservations, to compare both.
const TRANSACTION = { id: 'zone-reads', LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };

// A zone open 24 hours, or open on Mondays from 6:00 a. m. to 8:00 p. m.
function zone({ open24h = true, isActive = true } = {}) {
    const schedules = open24h ? [] : [{ dayOfWeek: 1, opensAt: '06:00:00', closesAt: '20:00:00' }];
    return Zona.build(
        { id: ZONE_ID, name: 'Centro', address: 'Calle 1', totalSlots: 10, hourlyRate: '2000.00', isActive, open24h, schedules },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
}

const ask = (query) => request(app).get(`/api/zones/${ZONE_ID}/availability`).query(query);
const hours = (start, end) => ({ startTime: colombia(start).toISOString(), endTime: colombia(end).toISOString() });

// The SQL text of the literal in a where
const sqlOf = (where) => where[Op.and].map((part) => part.val).join(' ');

let readZone;
let countFree;

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // A managed transaction runs the function with its transaction; without
    // a function (POST /reservations) it gives the transaction
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => (work ? work(TRANSACTION) : TRANSACTION));
    readZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue(zone());
    countFree = jest.spyOn(ParkingSpot, 'count').mockResolvedValue(4);
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('The free spots of a zone for some hours (#375)', () => {
    test('counts the enabled spots with no reservation in those hours, with the 10 minutes before and after', async () => {
        // Act: today from 10:00 a. m. to 12:00 p. m., with no session
        const res = await ask(hours('10:00', '12:00'));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual({
            zoneId: ZONE_ID,
            startTime: colombia('10:00').toISOString(),
            endTime: colombia('12:00').toISOString(),
            openEnded: false,
            availableSlots: 4,
            totalSlots: 10,
        });
        const { where } = countFree.mock.calls[0][0];
        expect(where.zoneId).toBe(ZONE_ID);
        expect(where.status).toEqual({ [Op.ne]: 'Disabled' });
        // 15:00 to 17:00 UTC, so from 14:50 to 17:10 with the margin
        expect(sqlOf(where)).toContain("r.start_time < '2026-11-16 17:10:00'");
        expect(sqlOf(where)).toContain("r.end_time > '2026-11-16 14:50:00'");
    });

    test('the zone and its free spots are read at the same moment, in one transaction', async () => {
        // Act
        await ask(hours('10:00', '12:00'));

        // Assert
        expect(sequelize.transaction).toHaveBeenCalledTimes(1);
        expect(readZone.mock.calls[0][1]).toMatchObject({ transaction: TRANSACTION, include: [expect.objectContaining({ as: 'schedules' })] });
        expect(countFree.mock.calls[0][0].transaction).toBe(TRANSACTION);
    });

    test('a zone with no spot free in those hours answers 0, not an error', async () => {
        // Arrange
        countFree.mockResolvedValue(0);

        // Act
        const res = await ask(hours('10:00', '12:00'));

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.availableSlots).toBe(0);
    });

    test('an open stay in a zone open 24 hours needs its spot for 24 hours', async () => {
        // Act
        const res = await ask({ startTime: colombia('10:00').toISOString(), openEnded: 'true' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ openEnded: true, endTime: colombia('10:00', '2026-11-17').toISOString() });
        expect(sqlOf(countFree.mock.calls[0][0].where)).toContain("r.start_time < '2026-11-17 15:10:00'");
    });

    test('an open stay in a zone with hours needs its spot until the closing time', async () => {
        // Arrange
        readZone.mockResolvedValue(zone({ open24h: false }));

        // Act
        const res = await ask({ startTime: colombia('10:00').toISOString(), openEnded: 'true' });

        // Assert: it closes at 8:00 p. m. (01:00 UTC), so up to 01:10
        expect(res.body).toMatchObject({ openEnded: true, endTime: colombia('20:00').toISOString() });
        expect(sqlOf(countFree.mock.calls[0][0].where)).toContain("r.start_time < '2026-11-17 01:10:00'");
    });

    test('openEnded=false is a stay with an exit time', async () => {
        // Act
        const res = await ask({ ...hours('10:00', '12:00'), openEnded: 'false' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ openEnded: false, endTime: colombia('12:00').toISOString() });
    });

    test('an open stay does not need its endTime, and one sent with it is ignored, as in POST /reservations', async () => {
        // Act
        const res = await ask({ ...hours('10:00', '12:00'), openEnded: 'true' });

        // Assert: it still needs its spot for 24 hours
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ openEnded: true, endTime: colombia('10:00', '2026-11-17').toISOString() });
    });
});

describe('The times are checked like in POST /reservations (#375)', () => {
    test.each([
        ['without startTime', 'MISSING_REQUIRED_FIELDS', { endTime: colombia('12:00').toISOString() }],
        ['without endTime', 'MISSING_REQUIRED_FIELDS', { startTime: colombia('10:00').toISOString() }],
        ['with an entry that is not a date', 'INVALID_DATE', { startTime: 'abc', endTime: colombia('12:00').toISOString() }],
        ['with an entry in the past', 'START_TIME_IN_PAST', hours('07:00', '09:00')],
        ['more than 48 hours ahead', 'RESERVATION_TOO_FAR_AHEAD', { startTime: colombia('09:00', '2026-11-18').toISOString(), endTime: colombia('10:00', '2026-11-18').toISOString() }],
        ['with the exit before the entry', 'END_BEFORE_START', hours('12:00', '10:00')],
        ['for 20 minutes', 'INVALID_DURATION', hours('10:00', '10:20')],
    ])('%s it answers 400 %s and reads nothing', async (_case, code, query) => {
        // Act
        const res = await ask(query);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe(code);
        expect(readZone).not.toHaveBeenCalled();
        expect(countFree).not.toHaveBeenCalled();
    });

    test.each([
        ['a repeated startTime', 'startTime must be text', `startTime=${encodeURIComponent(colombia('10:00').toISOString())}&startTime=x&endTime=x`],
        ['an openEnded that is not true or false', 'openEnded must be true or false', `startTime=${encodeURIComponent(colombia('10:00').toISOString())}&openEnded=yes`],
    ])('%s answers 400 VALIDATION_ERROR: "%s"', async (_case, message, query) => {
        // Act
        const res = await request(app).get(`/api/zones/${ZONE_ID}/availability?${query}`);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'VALIDATION_ERROR', message });
        expect(readZone).not.toHaveBeenCalled();
    });

    // The session and everything a reservation needs, with no free spot
    function everythingButASpot() {
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, roleId: 'role-user', role: { name: 'user' } });
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue({ id: VEHICLE_ID });
        jest.spyOn(Reserva, 'count').mockResolvedValue(0);
        jest.spyOn(Pago, 'findOne').mockResolvedValue(null);
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(null);
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue(null);
        countFree.mockResolvedValue(0);
    }
    const book = (times) => request(app)
        .post('/api/reservations')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ zoneId: ZONE_ID, vehicleId: VEHICLE_ID, ...times });

    test.each([
        ['an entry in the past', 'START_TIME_IN_PAST', hours('07:00', '09:00'), {}],
        ['more than 48 hours ahead', 'RESERVATION_TOO_FAR_AHEAD', { startTime: colombia('09:00', '2026-11-18').toISOString(), endTime: colombia('10:00', '2026-11-18').toISOString() }, {}],
        ['an exit before the entry', 'END_BEFORE_START', hours('12:00', '10:00'), {}],
        ['25 hours', 'INVALID_DURATION', { startTime: colombia('10:00').toISOString(), endTime: colombia('11:00', '2026-11-17').toISOString() }, {}],
        ['a date that is not a date', 'INVALID_DATE', { startTime: '2026-13-45', endTime: colombia('12:00').toISOString() }, {}],
        ['a deactivated zone', 'ZONE_INACTIVE', hours('10:00', '12:00'), { isActive: false }],
        ['a stay past the closing time', 'OUTSIDE_ZONE_HOURS', hours('19:00', '21:00'), { open24h: false }],
        ['a day the zone does not open', 'ZONE_CLOSED_THAT_DAY', { startTime: colombia('10:00', '2026-11-17').toISOString(), endTime: colombia('12:00', '2026-11-17').toISOString() }, { open24h: false }],
    ])('with %s the question and the reservation both answer %s, with the same body', async (_case, code, times, zoneOptions) => {
        // Arrange
        everythingButASpot();
        readZone.mockResolvedValue(zone(zoneOptions));

        // Act
        const asked = await ask(times);
        const booked = await book(times);

        // Assert
        expect(asked.body.code).toBe(code);
        expect({ status: asked.status, body: asked.body }).toEqual({ status: booked.status, body: booked.body });
    });

    test('with valid hours and no free spot, the question answers 0 and the reservation NO_SPOTS_AVAILABLE', async () => {
        // Arrange
        everythingButASpot();

        // Act
        const asked = await ask(hours('10:00', '12:00'));
        const booked = await book(hours('10:00', '12:00'));

        // Assert
        expect(asked.status).toBe(200);
        expect(asked.body.availableSlots).toBe(0);
        expect(booked.status).toBe(409);
        expect(booked.body.code).toBe('NO_SPOTS_AVAILABLE');
    });
});

describe('The zone of the question (#375)', () => {
    test('a zone that does not exist answers 404 ZONE_NOT_FOUND and counts nothing', async () => {
        // Arrange
        readZone.mockResolvedValue(null);

        // Act
        const res = await ask(hours('10:00', '12:00'));

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ZONE_NOT_FOUND');
        expect(countFree).not.toHaveBeenCalled();
    });

    test('a deactivated zone answers 409 ZONE_INACTIVE and counts nothing', async () => {
        // Arrange
        readZone.mockResolvedValue(zone({ isActive: false }));

        // Act
        const res = await ask(hours('10:00', '12:00'));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ZONE_INACTIVE');
        expect(countFree).not.toHaveBeenCalled();
    });

    test('a stay past the closing time answers OUTSIDE_ZONE_HOURS with the hours of that day, and counts nothing', async () => {
        // Arrange: on Mondays it opens from 6:00 a. m. to 8:00 p. m.
        readZone.mockResolvedValue(zone({ open24h: false }));

        // Act
        const res = await ask(hours('19:00', '21:00'));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'OUTSIDE_ZONE_HOURS', hours: { day: 1, opensAt: '06:00', closesAt: '20:00' } });
        expect(countFree).not.toHaveBeenCalled();
    });

    test('a day the zone does not open answers ZONE_CLOSED_THAT_DAY, and counts nothing', async () => {
        // Arrange: it only opens on Mondays, and the stay is on Tuesday
        readZone.mockResolvedValue(zone({ open24h: false }));

        // Act
        const res = await ask({ startTime: colombia('10:00', '2026-11-17').toISOString(), endTime: colombia('12:00', '2026-11-17').toISOString() });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'ZONE_CLOSED_THAT_DAY', hours: { day: 2, closed: true } });
        expect(countFree).not.toHaveBeenCalled();
    });

    test('a failed count answers 500 INTERNAL_ERROR', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        countFree.mockRejectedValue(new Error('connection lost'));

        // Act
        const res = await ask(hours('10:00', '12:00'));

        // Assert
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
    });
});
