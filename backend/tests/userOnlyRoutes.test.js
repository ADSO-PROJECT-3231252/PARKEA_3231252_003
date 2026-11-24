const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Reserva, Pago, sequelize } = require('../src/models');
const app = require('../src/app');

// #316: vehicles, reservations and payments belong to user accounts. An
// administrator manages the system from its own screens, so these routes
// answer 403 FORBIDDEN_ROLE before reading or changing anything.
const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';

const tokenOf = (rol) => jwt.sign({ id: ACCOUNT_ID, email: 'cuenta@correo.test', rol }, process.env.JWT_SECRET);

// The role saved now in the database, which is the one that counts
let savedRole;

const USER_ROUTES = [
    ['post', '/api/vehicles'],
    ['get', '/api/vehicles'],
    ['get', `/api/vehicles/${VEHICLE_ID}`],
    ['put', `/api/vehicles/${VEHICLE_ID}`],
    ['patch', `/api/vehicles/${VEHICLE_ID}/default`],
    ['delete', `/api/vehicles/${VEHICLE_ID}`],
    ['post', '/api/reservations'],
    ['get', '/api/reservations'],
    ['get', `/api/reservations/${RESERVATION_ID}`],
    ['patch', `/api/reservations/${RESERVATION_ID}/cancel`],
    ['patch', `/api/reservations/${RESERVATION_ID}/finish`],
    ['patch', `/api/reservations/${RESERVATION_ID}/extend`],
    ['post', `/api/payments/${RESERVATION_ID}`],
    ['post', `/api/payments/${RESERVATION_ID}/balance`],
];

// Every way these routes reach the database
const DATABASE_SPIES = [
    [Vehiculo, 'findAll'], [Vehiculo, 'findOne'], [Vehiculo, 'count'], [Vehiculo, 'create'],
    [Reserva, 'findAll'], [Reserva, 'findOne'], [Reserva, 'findByPk'], [Reserva, 'findAndCountAll'], [Reserva, 'create'],
    [Pago, 'findAll'], [Pago, 'findOne'], [Pago, 'create'],
    [sequelize, 'transaction'],
];
let spies;

const send = (method, path, rol) => request(app)[method](path)
    .set('Authorization', `Bearer ${tokenOf(rol)}`)
    .send({});

beforeEach(() => {
    savedRole = 'admin';
    // The session of the account (auth middleware)
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async () => (
        { id: ACCOUNT_ID, isActive: true, passwordVersion: 0, role: { name: savedRole } }
    ));
    spies = DATABASE_SPIES.map(([model, method]) => jest.spyOn(model, method).mockRejectedValue(new Error('the route read the database')));
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('An administrator cannot use the routes of users (#316)', () => {
    test.each(USER_ROUTES)('%s %s answers 403 FORBIDDEN_ROLE and reads nothing', async (method, path) => {
        // Act
        const res = await send(method, path, 'admin');

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_ROLE');
        spies.forEach((spy) => expect(spy).not.toHaveBeenCalled());
    });

    test('the role saved now counts, not the one in the token: a user made admin is rejected', async () => {
        // Arrange: the token was issued when the account was still a user
        savedRole = 'admin';

        // Act
        const res = await send('get', '/api/reservations', 'user');

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_ROLE');
    });

    test('a user account goes on to the route', async () => {
        // Arrange
        savedRole = 'user';
        jest.spyOn(Reserva, 'findAndCountAll').mockResolvedValue({ count: 0, rows: [] });

        // Act
        const res = await send('get', '/api/reservations', 'user');

        // Assert
        expect(res.status).toBe(200);
        expect(Reserva.findAndCountAll).toHaveBeenCalled();
    });
});
