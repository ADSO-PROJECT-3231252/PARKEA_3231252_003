const request = require('supertest');
const app = require('../src/app');

// Limits on repeated attempts (card #191). Every request here fails in the
// validators (empty fields), so none of them reads the database. Each test
// comes from its own IP address (X-Forwarded-For, trusted because of
// "trust proxy" in app.js), so the counts of one test never affect another.
const send = (path, ip, body = {}) => request(app).post(path).set('X-Forwarded-For', ip).send(body);

async function sendTimes(times, path, ip) {
    const statuses = [];
    for (let i = 0; i < times; i++) {
        statuses.push((await send(path, ip)).status);
    }
    return statuses;
}

describe('Sign-in limit (10 failed attempts every 15 minutes)', () => {
    test('answers 429 TOO_MANY_REQUESTS after 10 failed attempts', async () => {
        // Arrange
        const ip = '203.0.113.1';
        const firstTen = await sendTimes(10, '/api/auth/login', ip);

        // Act
        const res = await send('/api/auth/login', ip);

        // Assert
        expect(firstTen.every((status) => status === 400)).toBe(true);
        expect(res.status).toBe(429);
        expect(res.body).toEqual({ code: 'TOO_MANY_REQUESTS', message: 'Too many attempts. Please try again later' });
    });

    test('the user and admin sign-ins share the count', async () => {
        // Arrange
        const ip = '203.0.113.2';
        await sendTimes(10, '/api/auth/login', ip);

        // Act
        const res = await send('/api/auth/login-admin', ip);

        // Assert
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    });

    test('another visitor can still try', async () => {
        // Arrange
        await sendTimes(11, '/api/auth/login', '203.0.113.3');

        // Act
        const res = await send('/api/auth/login', '203.0.113.4');

        // Assert
        expect(res.status).toBe(400);
    });

    test('the port that some Azure proxies add to the address is ignored', async () => {
        // Arrange: the same visitor, a different port on every connection
        for (let port = 50001; port <= 50010; port++) {
            await send('/api/auth/login', `203.0.113.5:${port}`);
        }

        // Act
        const res = await send('/api/auth/login', '203.0.113.5:50011');

        // Assert
        expect(res.status).toBe(429);
    });

    test('tells the client how many tries are left', async () => {
        // Act
        const res = await send('/api/auth/login', '203.0.113.6');

        // Assert
        expect(res.headers.ratelimit).toMatch(/r=9/);
    });
});

describe('Password recovery limit (5 requests every 15 minutes)', () => {
    test('answers 429 TOO_MANY_REQUESTS after 5 requests', async () => {
        // Arrange
        const ip = '203.0.113.10';
        await sendTimes(5, '/api/auth/forgot-password', ip);

        // Act
        const res = await send('/api/auth/forgot-password', ip);

        // Assert
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    });
});

describe('Sign-up limit (10 created accounts every hour)', () => {
    test('attempts that fail do not count', async () => {
        // Arrange
        const ip = '203.0.113.20';
        await sendTimes(15, '/api/auth/register', ip);

        // Act
        const res = await send('/api/auth/register', ip);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
});
