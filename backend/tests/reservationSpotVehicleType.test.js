const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Zona, ZoneSchedule, Reserva, ParkingSpot } = require('../src/models');
const app = require('../src/app');

// HU-31: the detail and the list of the reservations send `spotVehicleType`,
// the type of the spot of each one, so the screens can show it with its number
// ("Cupo 3 · Moto"). The times are in Colombia (UTC-5); "now" is Monday
// 2026-11-16 at 8:00 a. m.
const colombia = (time, date = '2026-11-16') => new Date(`${date}T${time}:00-05:00`);
const NOW = colombia('08:00');
const USER_ID = '11111111-1111-4111-8111-111111111111';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const token = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);

// A Pending reservation of a motorcycle for today from 10:00 a. m. to
// 12:00 p. m. in spot 3, read with its zone, vehicle, payments and spot
function reservation(values = {}) {
    return {
        id: RESERVATION_ID,
        status: 'Pending',
        openEnded: false,
        parkingSpotId: 'spot-3',
        spotNumber: 3,
        startTime: colombia('10:00'),
        endTime: colombia('12:00'),
        holdExpiresAt: colombia('08:15'),
        appliedHourlyRate: '1000.00',
        zone: Zona.build(
            { id: ZONE_ID, name: 'Centro', address: 'Calle 1', isActive: true, open24h: true, schedules: [] },
            { include: [{ model: ZoneSchedule, as: 'schedules' }] },
        ),
        vehicle: { id: VEHICLE_ID, plate: 'ABC12D', brand: 'Yamaha', model: 'NMAX', color: 'Negro' },
        payments: [],
        parkingSpot: { vehicleType: 'motorcycle' },
        ...values,
    };
}

const getDetail = () => request(app).get(`/api/reservations/${RESERVATION_ID}`).set('Authorization', `Bearer ${token}`);
const getList = () => request(app).get('/api/reservations').set('Authorization', `Bearer ${token}`);

// The spot of the reservation, read with it, with only its type
const spotInclude = (options) => options.include.find((include) => include.as === 'parkingSpot');

beforeEach(() => {
    jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] });
    // The session of the user (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue({ id: USER_ID, isActive: true, passwordVersion: 0, roleId: 'role-user', role: { name: 'user' } });
});

afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
});

describe('The type of the spot in the detail of a reservation (HU-31)', () => {
    test('is sent with the number of the spot, and the spot is read with the reservation', async () => {
        // Arrange
        const findOne = jest.spyOn(Reserva, 'findOne').mockResolvedValue(reservation());

        // Act
        const res = await getDetail();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation).toMatchObject({ spotNumber: 3, spotVehicleType: 'motorcycle' });
        expect(spotInclude(findOne.mock.calls[0][0])).toEqual({ model: ParkingSpot, as: 'parkingSpot', attributes: ['vehicleType'] });
    });

    test('a reservation with no spot has no type', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(reservation({ parkingSpotId: null, spotNumber: null, parkingSpot: null }));

        // Act
        const res = await getDetail();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservation.spotVehicleType).toBeNull();
    });

    test('the zone has no rate of its own: the reservation keeps the rate of its type', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(reservation());

        // Act
        const res = await getDetail();

        // Assert
        expect(res.body.reservation.zone).not.toHaveProperty('hourlyRate');
        expect(res.body.reservation.paymentSummary.hourlyRate).toBe(1000);
    });
});

describe('The type of the spot in the list of the reservations (HU-31)', () => {
    test('each reservation is sent with the type of its spot, read with it', async () => {
        // Arrange
        const findAll = jest.spyOn(Reserva, 'findAndCountAll').mockResolvedValue({
            count: 3,
            rows: [
                reservation(),
                reservation({ id: 'car', parkingSpot: { vehicleType: 'car' } }),
                reservation({ id: 'none', parkingSpotId: null, spotNumber: null, parkingSpot: null }),
            ],
        });

        // Act
        const res = await getList();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.reservations.map((item) => [item.id, item.spotVehicleType])).toEqual([
            [RESERVATION_ID, 'motorcycle'],
            ['car', 'car'],
            ['none', null],
        ]);
        expect(spotInclude(findAll.mock.calls[0][0])).toEqual({ model: ParkingSpot, as: 'parkingSpot', attributes: ['vehicleType'] });
    });
});
