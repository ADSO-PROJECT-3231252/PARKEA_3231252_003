const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL). What the search finds on a real database is checked in
// tests/integration.
const { Usuario, Zona, ZoneSchedule, Reserva } = require('../src/models');
const availability = require('../src/services/availability');
const app = require('../src/app');

// #375: the list and the detail of the reservations send `spotFreeUntil`:
// until when the spot of a stay that can still be extended is free after its
// exit time, 10 minutes before the next reservation of the spot. The times
// are in Colombia (UTC-5); "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time, date = '2026-11-16') => new Date(`${date}T${time}:00-05:00`);
const NOW = colombia('08:00');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const STAY_ID = '44444444-4444-4444-8444-444444444444';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

// A zone open 24 hours, or open on Mondays from 6:00 a. m. to 8:00 p. m.
function zone({ open24h = true } = {}) {
    const schedules = open24h ? [] : [{ dayOfWeek: 1, opensAt: '06:00:00', closesAt: '20:00:00' }];
    return Zona.build(
        { id: ZONE_ID, name: 'Centro', address: 'Calle 1', totalSlots: 10, hourlyRate: '2000.00', isActive: true, open24h, schedules },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
}

// A paid stay today from 10:00 a. m. to 12:00 p. m. in spot 3, read with its
// zone, vehicle and payments
function stay(values = {}) {
    return {
        id: STAY_ID,
        status: 'Active',
        openEnded: false,
        parkingSpotId: 'spot-3',
        spotNumber: 3,
        startTime: colombia('10:00'),
        endTime: colombia('12:00'),
        holdExpiresAt: null,
        appliedHourlyRate: '2000.00',
        zone: zone(),
        vehicle: { id: VEHICLE_ID, plate: 'ABC123', brand: 'Mazda', model: '3', color: 'Rojo' },
        payments: [{ amount: '4000.00', paymentStatus: 'Paid', type: 'initial' }],
        ...values,
    };
}

const getDetail = () => request(app).get(`/api/reservations/${STAY_ID}`).set('Authorization', `Bearer ${token}`);
const getList = () => request(app).get('/api/reservations').set('Authorization', `Bearer ${token}`);

let findOne;

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // The session of the user (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, roleId: 'role-user', role: { name: 'user' } });
    findOne = jest.spyOn(Reserva, 'findOne');
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('spotFreeUntil in the detail of a reservation (#375)', () => {
    test('a stay whose spot has a reservation at 3:00 p. m. is free until 2:50 p. m.', async () => {
        // Arrange: the detail, then the next reservation of the spot
        findOne.mockResolvedValueOnce(stay()).mockResolvedValueOnce({ id: 'next', startTime: colombia('15:00') });

        // Act
        const res = await getDetail();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation.spotFreeUntil).toBe(colombia('14:50').toISOString());
    });

    test('the search is the one of an extension: the same spot, without the stay, from its exit time to 24 hours after the entry', async () => {
        // Arrange
        findOne.mockResolvedValueOnce(stay()).mockResolvedValueOnce(null);

        // Act
        const res = await getDetail();

        // Assert: from 12:00 p. m. to 10:00 a. m. of Tuesday, with the 10 minutes
        expect(res.body.reservation.spotFreeUntil).toBeNull();
        const { where } = findOne.mock.calls[1][0];
        expect(where).toMatchObject({
            id: { [Op.ne]: STAY_ID },
            parkingSpotId: 'spot-3',
            startTime: { [Op.lt]: colombia('10:10', '2026-11-17') },
            endTime: { [Op.gt]: colombia('11:50') },
        });
        expect(where[Op.and]).toEqual([availability.holdsItsSpot(NOW)]);
    });

    test('in a zone with hours, the search goes up to the closing time of the day of the entry', async () => {
        // Arrange: it closes at 8:00 p. m.
        findOne.mockResolvedValueOnce(stay({ zone: zone({ open24h: false }) })).mockResolvedValueOnce(null);

        // Act
        await getDetail();

        // Assert
        expect(findOne.mock.calls[1][0].where.startTime).toEqual({ [Op.lt]: colombia('20:10') });
    });

    test.each([
        ['a Pending reservation', { status: 'Pending', holdExpiresAt: colombia('08:10'), payments: [] }],
        ['a Finished stay', { status: 'Finished', startTime: colombia('05:00', '2026-11-16'), endTime: colombia('07:00') }],
        ['a Cancelled reservation', { status: 'Cancelled' }],
        ['an open stay', { openEnded: true, endTime: colombia('10:00', '2026-11-17') }],
        ['a stay whose exit time passed', { startTime: colombia('06:00'), endTime: colombia('07:30') }],
    ])('%s cannot be extended, so it has no spotFreeUntil and nothing is searched', async (_case, values) => {
        // Arrange
        findOne.mockResolvedValueOnce(stay(values));

        // Act
        const res = await getDetail();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation).toHaveProperty('spotFreeUntil', null);
        expect(findOne).toHaveBeenCalledTimes(1);
    });
});

describe('spotFreeUntil in the list of reservations (#375)', () => {
    test('each stay that can be extended gets its own, and the others get null, with one search for each of those stays', async () => {
        // Arrange: two paid stays (the latest first) and a Pending reservation
        jest.spyOn(Reserva, 'findAndCountAll').mockResolvedValue({
            count: 3,
            rows: [
                stay({ id: 'tomorrow', parkingSpotId: 'spot-5', startTime: colombia('09:00', '2026-11-17'), endTime: colombia('11:00', '2026-11-17') }),
                stay({ id: 'pending', status: 'Pending', holdExpiresAt: colombia('08:10'), payments: [] }),
                stay({ id: 'today' }),
            ],
        });
        // The spot of tomorrow's stay has another reservation at 1:00 p. m.; today's is free
        findOne.mockImplementation(async ({ where }) => (where.parkingSpotId === 'spot-5' ? { id: 'next', startTime: colombia('13:00', '2026-11-17') } : null));

        // Act
        const res = await getList();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservations.map((r) => [r.id, r.spotFreeUntil])).toEqual([
            ['tomorrow', colombia('12:50', '2026-11-17').toISOString()],
            ['pending', null],
            ['today', null],
        ]);
        expect(findOne).toHaveBeenCalledTimes(2);
    });

    test('a failed search answers 500 INTERNAL_ERROR', async () => {
        // Arrange
        jest.spyOn(console, 'error').mockImplementation(() => {});
        jest.spyOn(Reserva, 'findAndCountAll').mockResolvedValue({ count: 1, rows: [stay()] });
        findOne.mockRejectedValue(new Error('connection lost'));

        // Act
        const res = await getList();

        // Assert
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
    });
});
