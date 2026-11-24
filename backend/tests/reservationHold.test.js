const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, Reserva } = require('../src/models');
const app = require('../src/app');
const { countsAsExpired, RESERVATION_EXPIRED } = require('../src/utils/reservationHold');

// #347: when the 15 minutes to pay a Pending reservation end, it counts as
// expired for everything, even before the job marks it Expired. The times are
// in Colombia (UTC-5), and "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const NOW = colombia('08:00');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

describe('When a reservation counts as expired (#347)', () => {
    test.each([
        ['when its 15 minutes end', 'Pending', colombia('08:00')],
        ['after its 15 minutes end, before the job marks it', 'Pending', colombia('07:59')],
        ['once the job marked it Expired', 'Expired', colombia('07:59')],
    ])('it counts as expired %s', (name, status, holdExpiresAt) => {
        expect(countsAsExpired({ status, holdExpiresAt }, NOW)).toBe(true);
    });

    test.each([
        ['while its 15 minutes last', 'Pending', new Date(NOW.getTime() + 1)],
        ['a Pending one without a deadline', 'Pending', null],
        ['a paid one (Active), even with an old deadline left', 'Active', colombia('07:00')],
        ['a Cancelled one, even after its deadline', 'Cancelled', colombia('07:00')],
        ['a Finished one', 'Finished', null],
    ])('it does not count as expired: %s', (name, status, holdExpiresAt) => {
        expect(countsAsExpired({ status, holdExpiresAt }, NOW)).toBe(false);
    });

    test('the deadline can come as text, like in a JSON answer', () => {
        expect(countsAsExpired({ status: 'Pending', holdExpiresAt: colombia('07:59').toISOString() }, NOW)).toBe(true);
    });

    test('without a "now", it compares with the current time', () => {
        // Arrange
        jest.useFakeTimers({ now: NOW });

        // Act
        const atTheEnd = countsAsExpired({ status: 'Pending', holdExpiresAt: colombia('08:00') });
        const before = countsAsExpired({ status: 'Pending', holdExpiresAt: new Date(NOW.getTime() + 1) });
        jest.useRealTimers();

        // Assert
        expect(atTheEnd).toBe(true);
        expect(before).toBe(false);
    });

    test('the answer is the same one the payment gives', () => {
        expect(RESERVATION_EXPIRED).toEqual({
            code: 'RESERVATION_EXPIRED',
            message: 'This reservation expired because it was not paid in time. Please make a new reservation.',
        });
    });
});

describe('The list of reservations sends the deadline to pay (#347)', () => {
    // A reservation of the list, read with its zone, vehicle and payments
    function row(values) {
        const zone = Zona.build(
            { id: ZONE_ID, name: 'Centro', address: 'Calle 1', open24h: true, schedules: [] },
            { include: [{ model: ZoneSchedule, as: 'schedules' }] },
        );
        return {
            zoneId: ZONE_ID,
            spotNumber: 3,
            startTime: colombia('10:00'),
            endTime: colombia('12:00'),
            openEnded: false,
            appliedHourlyRate: '2000.00',
            zone,
            vehicle: { id: VEHICLE_ID, plate: 'ABC123' },
            payments: [],
            ...values,
        };
    }

    beforeEach(() => {
        jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
        // The session of the user (auth middleware)
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
    });

    afterEach(() => {
        jest.useRealTimers();
        jest.restoreAllMocks();
    });

    test('each reservation has holdExpiresAt: the deadline of a Pending one, null once it is paid', async () => {
        // Arrange: an Expired one keeps the deadline it had, like in its detail
        jest.spyOn(Reserva, 'findAndCountAll').mockResolvedValue({
            count: 3,
            rows: [
                row({ id: 'pending', status: 'Pending', holdExpiresAt: colombia('08:10') }),
                row({ id: 'paid', status: 'Active', holdExpiresAt: null, payments: [{ amount: '4000.00', paymentStatus: 'Paid', type: 'initial' }] }),
                row({ id: 'expired', status: 'Expired', holdExpiresAt: colombia('07:45') }),
            ],
        });

        // Act
        const res = await request(app).get('/api/reservations').set('Authorization', `Bearer ${token}`);

        // Assert
        expect(res.status).toBe(200);
        const [pending, paid, expired] = res.body.reservations;
        expect(pending.holdExpiresAt).toBe(colombia('08:10').toISOString());
        expect(paid).toHaveProperty('holdExpiresAt', null);
        expect(expired.holdExpiresAt).toBe(colombia('07:45').toISOString());
    });
});
