const bcrypt = require('bcrypt');
const request = require('supertest');
const { Usuario, PasswordResetToken, sequelize } = require('../src/models');
const app = require('../src/app');

// Limit on failed tries of the recovery link (card #301): 10 every 15
// minutes for each network. Every request here sends an empty form, which
// fails in the validators, so it never reads the database. Each test comes
// from its own IP address (X-Forwarded-For, trusted because of "trust proxy"
// in app.js), so the counts of one test never affect another.
const reset = (ip) => request(app).post('/api/auth/reset-password').set('X-Forwarded-For', ip).send({});

afterEach(() => {
    jest.restoreAllMocks();
});

async function resetTimes(times, ip) {
    const statuses = [];
    for (let i = 0; i < times; i++) {
        statuses.push((await reset(ip)).status);
    }
    return statuses;
}

describe('Recovery link limit (10 failed tries per network every 15 minutes)', () => {
    test('the eleventh failed try answers 429 TOO_MANY_REQUESTS', async () => {
        // Arrange
        const firstTen = await resetTimes(10, '203.0.113.1');

        // Act
        const res = await reset('203.0.113.1');

        // Assert
        expect(firstTen).toEqual(Array(10).fill(400));
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later' });
    });

    test('another network can still try', async () => {
        // Arrange
        await resetTimes(11, '203.0.113.2');

        // Act
        const res = await reset('203.0.113.3');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });

    test('a link that works is not counted, so a class on the same Wi-Fi can use theirs', async () => {
        // Arrange: a valid link of an account whose password is another one
        // (the database is replaced by spies, tests/setup.js)
        const account = {
            id: 'user-fabio',
            password: await bcrypt.hash('Anterior1*', 4),
            passwordVersion: 0,
            emailVerifiedAt: new Date(),
            update: jest.fn(),
        };
        const link = { id: 'link-1', userId: account.id, usedAt: null, expiresAt: new Date(Date.now() + 60 * 60 * 1000) };
        jest.spyOn(PasswordResetToken, 'findOne').mockResolvedValue(link);
        jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([1]);
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(account);
        jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
        const ip = '203.0.113.4';
        await resetTimes(9, ip);
        const works = await request(app)
            .post('/api/auth/reset-password')
            .set('X-Forwarded-For', ip)
            .send({ token: 'a-valid-link', newPassword: 'Nueva123*', confirmNewPassword: 'Nueva123*' });

        // Act: if the link that worked counted, this would be the eleventh
        const res = await reset(ip);

        // Assert
        expect(works.status).toBe(200);
        expect(res.status).toBe(400);
    });
});
