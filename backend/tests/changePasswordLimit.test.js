const bcrypt = require('bcrypt');
const request = require('supertest');
const { Usuario, PasswordResetToken, sequelize } = require('../src/models');
const { createSessionToken } = require('../src/utils/sessionToken');
const app = require('../src/app');

// Limit on failed password changes (card #301): 5 every 15 minutes for each
// account. The database is replaced by spies (tests/setup.js: the tests never
// reach MySQL). Each test uses its own accounts, so the counts of one test
// never affect another.
const PASSWORD = 'Clave123*';
const WRONG_PASSWORD = 'Otra1234*';
const NEW_PASSWORD = 'Nueva123*';
let passwordHash;

beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
});

afterEach(() => {
    jest.restoreAllMocks();
});

// The accounts that auth.middleware.js and the controller read. A change
// that works keeps the same password version here, so the token of the test
// keeps working after it.
function accounts(...ids) {
    const byId = {};
    for (const id of ids) {
        byId[id] = {
            id,
            email: `${id}@correo.test`,
            password: passwordHash,
            passwordVersion: 0,
            isActive: true,
            role: { name: 'user' },
            update: jest.fn(async () => byId[id]),
        };
    }
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async (id) => byId[id] ?? null);
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
    jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([0]);
}

// Each request comes from the IP address given (X-Forwarded-For, trusted
// because of "trust proxy" in app.js)
function change(id, currentPassword, ip = '198.51.100.1') {
    const token = createSessionToken({ id, email: `${id}@correo.test`, passwordVersion: 0 }, 'user');
    return request(app)
        .put('/api/users/me/password')
        .set('X-Forwarded-For', ip)
        .set('Authorization', `Bearer ${token}`)
        .send({ currentPassword, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });
}

async function wrongTimes(times, id, ip) {
    const statuses = [];
    for (let i = 0; i < times; i++) {
        statuses.push((await change(id, WRONG_PASSWORD, ip)).status);
    }
    return statuses;
}

describe('Password change limit (5 failed changes per account every 15 minutes)', () => {
    test('the sixth wrong current password answers 429 TOO_MANY_REQUESTS', async () => {
        // Arrange
        accounts('user-ana');
        const firstFive = await wrongTimes(5, 'user-ana');

        // Act
        const res = await change('user-ana', WRONG_PASSWORD);

        // Assert
        expect(firstFive).toEqual([401, 401, 401, 401, 401]);
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later' });
    });

    test('the count goes with the account, also from another network', async () => {
        // Arrange
        accounts('user-beto');
        await wrongTimes(5, 'user-beto', '198.51.100.2');

        // Act
        const res = await change('user-beto', WRONG_PASSWORD, '198.51.100.3');

        // Assert
        expect(res.status).toBe(429);
    });

    test('another account on the same network can still change its password', async () => {
        // Arrange
        accounts('user-carla', 'user-dario');
        await wrongTimes(6, 'user-carla', '198.51.100.4');

        // Act
        const res = await change('user-dario', PASSWORD, '198.51.100.4');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
    });

    test('a new password that is not valid also counts', async () => {
        // Arrange: 5 tries with the right current password but a new one
        // without a special character (the validator answers 400)
        accounts('user-fer');
        const token = createSessionToken({ id: 'user-fer', email: 'user-fer@correo.test', passwordVersion: 0 }, 'user');
        for (let i = 0; i < 5; i++) {
            await request(app)
                .put('/api/users/me/password')
                .set('X-Forwarded-For', '198.51.100.5')
                .set('Authorization', `Bearer ${token}`)
                .send({ currentPassword: PASSWORD, newPassword: 'Nueva1234', confirmNewPassword: 'Nueva1234' });
        }

        // Act
        const res = await change('user-fer', PASSWORD, '198.51.100.5');

        // Assert
        expect(res.status).toBe(429);
    });

    test('a change that works is not counted', async () => {
        // Arrange: 4 wrong tries and one that works
        accounts('user-elena');
        await wrongTimes(4, 'user-elena');
        const right = await change('user-elena', PASSWORD);

        // Act: if the one that worked counted, this would be the sixth
        const res = await change('user-elena', WRONG_PASSWORD);

        // Assert
        expect(right.status).toBe(200);
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
    });
});
