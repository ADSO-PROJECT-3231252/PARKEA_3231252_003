const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Zona, ZoneSchedule, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-29: reservations and extensions must fit the hours of the zone. The
// times are in Colombia (UTC-5); 2026-11-16 is a Monday.
const colombia = (date, time) => new Date(`${date}T${time}:00-05:00`);
const MONDAY = '2026-11-16';
const WEDNESDAY = '2026-11-18';
// "Now" is Monday at 8:00 a. m.
const NOW = colombia(MONDAY, '08:00');

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);
const MONDAY_HOURS = { day: 1, opensAt: '06:00', closesAt: '20:00' };

// A zone read with its hours: open Monday and Tuesday from 6:00 a. m. to
// 8:00 p. m., or open 24 hours
function zone({ open24h = false } = {}) {
    const schedules = open24h ? [] : [
        { dayOfWeek: 1, opensAt: '06:00:00', closesAt: '20:00:00' },
        { dayOfWeek: 2, opensAt: '06:00:00', closesAt: '20:00:00' },
    ];
    const zona = Zona.build(
        { id: ZONE_ID, name: 'Centro', address: 'Calle 1', totalSlots: 10, availableSlots: 10, hourlyRate: '2000.00', isActive: true, open24h, schedules },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
    jest.spyOn(zona, 'decrement').mockResolvedValue(zona);
    return zona;
}

const transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
const send = (method, path, body) => request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    // The session (auth middleware) and the lock of the user. The token has
    // no password version, so the account is at version 0 (#199)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, role: { name: 'user' } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('Creating a reservation inside the hours of the zone (HU-29, AC-03 and AC-04)', () => {
    let createReservation;

    function arrange(zona) {
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue({ id: VEHICLE_ID });
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
        jest.spyOn(Pago, 'findOne').mockResolvedValue(null);
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(null);
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue({ id: 'spot-1', spotNumber: 1, update: jest.fn() });
        createReservation = jest.spyOn(Reserva, 'create').mockResolvedValue({ id: RESERVATION_ID });
        jest.spyOn(Reserva, 'findByPk').mockResolvedValue({ id: RESERVATION_ID });
    }

    const book = (startTime, endTime) => send('post', '/api/reservations', {
        zoneId: ZONE_ID,
        vehicleId: VEHICLE_ID,
        startTime: startTime.toISOString(),
        ...(endTime ? { endTime: endTime.toISOString() } : { openEnded: true }),
    });

    test('a reservation inside the hours is created', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await book(colombia(MONDAY, '10:00'), colombia(MONDAY, '12:00'));

        // Assert
        expect(res.status).toBe(201);
        expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({ endTime: colombia(MONDAY, '12:00') }), expect.anything());
    });

    test('leaving after the closing time answers 400 OUTSIDE_ZONE_HOURS with the hours of that day', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await book(colombia(MONDAY, '19:00'), colombia(MONDAY, '20:30'));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('OUTSIDE_ZONE_HOURS');
        expect(res.body.hours).toEqual(MONDAY_HOURS);
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('a closed day answers 400 ZONE_CLOSED_THAT_DAY', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await book(colombia(WEDNESDAY, '07:00'), colombia(WEDNESDAY, '09:00'));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'ZONE_CLOSED_THAT_DAY', hours: { day: 3, closed: true } });
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('an open stay 30 minutes before closing ends at the closing time', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await book(colombia(MONDAY, '19:30'));

        // Assert
        expect(res.status).toBe(201);
        expect(createReservation).toHaveBeenCalledWith(
            expect.objectContaining({ openEnded: true, endTime: colombia(MONDAY, '20:00') }),
            expect.anything(),
        );
    });

    test('an open stay 29 minutes before closing answers 400 OUTSIDE_ZONE_HOURS', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await book(colombia(MONDAY, '19:31'));

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'OUTSIDE_ZONE_HOURS', hours: MONDAY_HOURS });
    });

    test('the overlap check of the vehicle uses the closing time of the open stay', async () => {
        // Arrange
        arrange(zone());

        // Act
        await book(colombia(MONDAY, '18:00'));

        // Assert: the vehicle is busy from the entry until the closing time
        const { where } = Reserva.findOne.mock.calls[0][0];
        expect(where.startTime[Op.lt]).toEqual(colombia(MONDAY, '20:00'));
        expect(where.endTime[Op.gt]).toEqual(colombia(MONDAY, '18:00'));
    });

    test('in a zone open 24 hours an open stay still ends 24 hours after the entry', async () => {
        // Arrange
        arrange(zone({ open24h: true }));

        // Act
        const res = await book(colombia(MONDAY, '23:50'));

        // Assert
        expect(res.status).toBe(201);
        expect(createReservation).toHaveBeenCalledWith(
            expect.objectContaining({ endTime: new Date(colombia(MONDAY, '23:50').getTime() + 24 * 60 * 60 * 1000) }),
            expect.anything(),
        );
    });
});

describe('Extending a stay inside the hours of the zone (HU-29, AC-05)', () => {
    let saveReservation;
    let createPayment;

    // A paid reservation from 10:00 a. m. to 12:00 p. m. on Monday
    function arrange(zona) {
        saveReservation = jest.fn();
        jest.spyOn(Reserva, 'findOne')
            .mockResolvedValueOnce({
                id: RESERVATION_ID,
                userId: USER_ID,
                zoneId: ZONE_ID,
                vehicleId: VEHICLE_ID,
                status: 'Active',
                openEnded: false,
                startTime: colombia(MONDAY, '10:00'),
                endTime: colombia(MONDAY, '12:00'),
                appliedHourlyRate: '2000.00',
                update: saveReservation,
            })
            .mockResolvedValue(null);
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue({ id: VEHICLE_ID });
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zona);
        createPayment = jest.spyOn(Pago, 'create').mockResolvedValue({});
    }

    const extend = (body) => send('patch', `/api/reservations/${RESERVATION_ID}/extend`, {
        fromEndTime: colombia(MONDAY, '12:00').toISOString(),
        ...body,
    });

    test('up to the closing time is allowed and paid', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await extend({ newEndTime: colombia(MONDAY, '20:00').toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(res.status).toBe(200);
        expect(createPayment).toHaveBeenCalledWith(expect.objectContaining({ type: 'extension', amount: 16000 }), expect.anything());
        expect(saveReservation).toHaveBeenCalledWith({ endTime: colombia(MONDAY, '20:00'), openEnded: false }, expect.anything());
    });

    test('past the closing time answers 400 OUTSIDE_ZONE_HOURS and charges nothing', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await extend({ newEndTime: colombia(MONDAY, '20:30').toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toMatchObject({ code: 'OUTSIDE_ZONE_HOURS', hours: MONDAY_HOURS });
        expect(createPayment).not.toHaveBeenCalled();
        expect(saveReservation).not.toHaveBeenCalled();
    });

    test('switching to an open stay ends it at the closing time', async () => {
        // Arrange
        arrange(zone());

        // Act
        const res = await extend({ openEnded: true });

        // Assert
        expect(res.status).toBe(200);
        expect(saveReservation).toHaveBeenCalledWith({ endTime: colombia(MONDAY, '20:00'), openEnded: true }, expect.anything());
        expect(createPayment).not.toHaveBeenCalled();
    });

    test('in a zone open 24 hours the limit is still 24 hours from the entry', async () => {
        // Arrange
        arrange(zone({ open24h: true }));

        // Act
        const res = await extend({ newEndTime: colombia(MONDAY, '23:00').toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(res.status).toBe(200);
    });
});

describe('The latest exit time of a stay (HU-29)', () => {
    test('the confirmation of a stay sends the closing time as latestEndTime', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findOne').mockResolvedValue({
            id: RESERVATION_ID,
            status: 'Active',
            openEnded: false,
            spotNumber: 1,
            startTime: colombia(MONDAY, '10:00'),
            endTime: colombia(MONDAY, '12:00'),
            appliedHourlyRate: '2000.00',
            zone: zone(),
            vehicle: { id: VEHICLE_ID, plate: 'ABC123' },
            payments: [],
        });

        // Act
        const res = await send('get', `/api/reservations/${RESERVATION_ID}`);

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation.latestEndTime).toBe(colombia(MONDAY, '20:00').toISOString());
    });
});
