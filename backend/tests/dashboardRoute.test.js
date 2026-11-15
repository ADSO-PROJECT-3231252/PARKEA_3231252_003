const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Reserva, Zona, Pago } = require('../src/models');
const app = require('../src/app');

// HU-22 AC-03 (#298): the dashboard answers with the range of the request.
// If the route ignored the range and always used "today", the tests of
// getRangoFecha would still pass, so these ones go through the route.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';

const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);

// November 10, 2026, 10:00 a. m. in Colombia (UTC-5)
const NOW = new Date('2026-11-10T15:00:00Z');

const getDashboard = (query = '') => request(app)
    .get(`/api/admin/dashboard${query}`)
    .set('Authorization', `Bearer ${adminToken}`);

// The moments the payments were searched between
const paymentsRange = () => Pago.sum.mock.calls[0][1].where.paidAt[Op.between];

beforeEach(() => {
    // Only the clock is fake: the server and supertest need the real timers
    jest.useFakeTimers({
        now: NOW,
        doNotFake: [
            'hrtime', 'nextTick', 'performance', 'queueMicrotask',
            'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback',
            'setImmediate', 'clearImmediate', 'setInterval', 'clearInterval', 'setTimeout', 'clearTimeout',
        ],
    });
    // The session of the admin (auth middleware) and the numbers of the dashboard
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async (id) => (
        id === ADMIN_ID ? { id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: 'admin' } } : null
    ));
    jest.spyOn(Reserva, 'count').mockResolvedValue(3);
    jest.spyOn(Zona, 'count').mockResolvedValue(4);
    jest.spyOn(Usuario, 'count').mockResolvedValue(7);
    jest.spyOn(Pago, 'sum').mockResolvedValue(12500);
});

afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
});

describe('GET /api/admin/dashboard uses the range of the request (#298)', () => {
    test.each([
        ['today', '2026-11-10T05:00:00.000Z'],
        ['week', '2026-11-04T05:00:00.000Z'],
        ['month', '2026-10-12T05:00:00.000Z'],
    ])('range=%s searches the payments from %s until now', async (range, start) => {
        // Act
        const res = await getDashboard(`?range=${range}`);

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.range).toBe(range);
        expect(paymentsRange()).toEqual([new Date(start), NOW]);
    });

    test('the active reservations are searched in the same range', async () => {
        // Act
        await getDashboard('?range=week');

        // Assert
        const { where } = Reserva.count.mock.calls[0][0];
        expect(where.endTime[Op.gte]).toEqual(new Date('2026-11-04T05:00:00.000Z'));
        expect(where.startTime[Op.lte]).toEqual(NOW);
    });

    test('the metrics are the ones the models answer', async () => {
        // Act
        const res = await getDashboard('?range=week');

        // Assert
        expect(res.body.metrics).toEqual({ activeReservations: 3, revenue: 12500, activeZones: 4, registeredUsers: 7 });
    });

    test('without a range it uses today', async () => {
        // Act
        const res = await getDashboard();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.range).toBe('today');
        expect(paymentsRange()).toEqual([new Date('2026-11-10T05:00:00.000Z'), NOW]);
    });

    test('a range that does not exist answers 400 INVALID_RANGE and searches nothing', async () => {
        // Act
        const res = await getDashboard('?range=year');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_RANGE');
        expect(Pago.sum).not.toHaveBeenCalled();
    });
});

// The other two endpoints that take a range (#298). They search with the same
// getRangoFecha, so each one could also ignore the range of the request.
const getEndpoint = (endpoint, query = '') => request(app)
    .get(`/api/admin/dashboard/${endpoint}${query}`)
    .set('Authorization', `Bearer ${adminToken}`);

// The moments each endpoint searched between
const searchedRange = {
    // It counts with raw SQL, so it sends the moments as UTC text
    'reservations-by-zone': () => {
        const { replacements } = Zona.findAll.mock.calls[0][0];
        return [replacements.inicio, replacements.fin].map((text) => new Date(`${text.replace(' ', 'T')}Z`));
    },
    'payments-status': () => Pago.findAll.mock.calls[0][0].where.created_at[Op.between],
};

describe.each(Object.keys(searchedRange))('GET /api/admin/dashboard/%s uses the range of the request (#298)', (endpoint) => {
    beforeEach(() => {
        jest.spyOn(Zona, 'findAll').mockResolvedValue([]);
        jest.spyOn(Pago, 'findAll').mockResolvedValue([]);
    });

    test('range=week searches from midnight 6 days ago until now', async () => {
        // Act
        const res = await getEndpoint(endpoint, '?range=week');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.range).toBe('week');
        expect(searchedRange[endpoint]()).toEqual([new Date('2026-11-04T05:00:00.000Z'), NOW]);
    });

    test('without a range it uses today', async () => {
        // Act
        const res = await getEndpoint(endpoint);

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.range).toBe('today');
        expect(searchedRange[endpoint]()).toEqual([new Date('2026-11-10T05:00:00.000Z'), NOW]);
    });

    test('a range that does not exist answers 400 INVALID_RANGE and searches nothing', async () => {
        // Act
        const res = await getEndpoint(endpoint, '?range=year');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('INVALID_RANGE');
        expect(Zona.findAll).not.toHaveBeenCalled();
        expect(Pago.findAll).not.toHaveBeenCalled();
    });
});

test('reservations-by-zone counts the reservations that start inside the range, in UTC (#298)', async () => {
    // Arrange
    jest.spyOn(Zona, 'findAll').mockResolvedValue([]);

    // Act
    await getEndpoint('reservations-by-zone', '?range=week');

    // Assert: the database keeps UTC. A Date in the replacements would be
    // written in the time zone of the server (America/Bogota on Azure).
    const { attributes, replacements } = Zona.findAll.mock.calls[0][0];
    const [count] = attributes.find(Array.isArray);
    expect(count.val).toContain('r.start_time BETWEEN :inicio AND :fin');
    expect(replacements).toEqual({ inicio: '2026-11-04 05:00:00', fin: '2026-11-10 15:00:00' });
});
