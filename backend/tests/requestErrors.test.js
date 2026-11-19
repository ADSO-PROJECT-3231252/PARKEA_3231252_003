
const request = require('supertest');
const jwt = require('jsonwebtoken');

const { Usuario } = require('../src/models');
const app = require('../src/app');

const ACCOUNT_ID = '11111111-1111-4111-8111-111111111111';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';

const userToken = (role = 'user') => jwt.sign(
    {
        id: ACCOUNT_ID,
        email: 'cuenta@correo.test',
        rol: role,
    },
    process.env.JWT_SECRET
);

let mockUser;

beforeEach(() => {
    mockUser = {
        id: ACCOUNT_ID,
        fullName: 'Usuario de Prueba',
        email: 'cuenta@correo.test',
        phone: '3001234567',
        isActive: true,
        passwordVersion: 0,
        role: { name: 'user' },
        update: jest.fn(),
    };

    jest.spyOn(Usuario, 'findByPk').mockImplementation(
        async () => mockUser
    );
});

afterEach(() => {
    jest.restoreAllMocks();
});

// #300: Requests without a body must return 400, never 500.
describe('Requests without a body (#300)', () => {
    const routes = [
        ['put', '/api/users/me', 'user'],
        ['post', '/api/reservations', 'user'],
        ['post', `/api/payments/${RESERVATION_ID}`, 'user'],
        ['post', `/api/payments/${RESERVATION_ID}/balance`, 'user'],
        ['post', '/api/zones', 'admin'],
        ['put', `/api/zones/${ZONE_ID}`, 'admin'],
    ];

    test.each(routes)(
        '%s %s without a body returns 400',
        async (method, path, role) => {
            mockUser.role.name = role;

            const res = await request(app)[method](path)
                .set('Authorization', `Bearer ${userToken(role)}`);

            expect(res.status).toBe(400);
            expect(res.status).not.toBe(500);
        }
    );
});

// #300: Empty profile updates must be rejected.
describe('Empty profile update (#300)', () => {
    test('PUT /api/users/me with {} returns 400 MISSING_REQUIRED_FIELDS', async () => {
        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${userToken()}`)
            .send({});

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MISSING_REQUIRED_FIELDS');
        expect(mockUser.update).not.toHaveBeenCalled();
    });

    test('PUT /api/users/me without a body does not update the user', async () => {
        const res = await request(app)
            .put('/api/users/me')
            .set('Authorization', `Bearer ${userToken()}`);

        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MISSING_REQUIRED_FIELDS');
        expect(mockUser.update).not.toHaveBeenCalled();
    });
});
