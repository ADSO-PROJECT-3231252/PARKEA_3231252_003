const request = require('supertest');
const app = require('../src/app');

// Limits on repeated attempts (card #191). Almost every request here fails in
// the validators (empty fields), so it never reads the database. Each test
// comes from its own IP address (X-Forwarded-For, trusted because of
// "trust proxy" in app.js), so the counts of one test never affect another.
const send = (path, ip, body = {}) => request(app).post(path).set('X-Forwarded-For', ip).send(body);

async function sendTimes(times, path, ip, body = {}) {
    const statuses = [];
    for (let i = 0; i < times; i++) {
        statuses.push((await send(path, ip, body)).status);
    }
    return statuses;
}

describe('Sign-in limit (10 failed attempts per email, 100 per network, every 15 minutes)', () => {
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

    test('the port is also ignored in an IPv6 address ("[2800:e2::1]:4000")', async () => {
        // Arrange
        for (let port = 4001; port <= 4010; port++) {
            await send('/api/auth/login', `[2001:db8::7]:${port}`);
        }

        // Act
        const res = await send('/api/auth/login', '[2001:db8::7]:4011');

        // Assert
        expect(res.status).toBe(429);
    });

    test('on a shared network, the mistakes of one person do not block another one', async () => {
        // Arrange: the same Wi-Fi, someone else fails 10 times
        const ip = '203.0.113.7';
        await sendTimes(10, '/api/auth/login', ip, { email: 'laura@correo.test' });
        const blocked = await send('/api/auth/login', ip, { email: 'laura@correo.test' });

        // Act
        const res = await send('/api/auth/login', ip, { email: 'andres@correo.test' });

        // Assert
        expect(blocked.status).toBe(429);
        expect(res.status).toBe(400);
    });

    test('a person who keeps trying after being blocked does not block the network', async () => {
        // Arrange: 10 failed attempts, then 100 more that are already rejected
        const ip = '203.0.113.9';
        await sendTimes(110, '/api/auth/login', ip, { email: 'beto@correo.test' });

        // Act
        const res = await send('/api/auth/login', ip, { email: 'ana@correo.test' });

        // Assert
        expect(res.status).toBe(400);
    });

    test('server errors do not count (the database is down)', async () => {
        // Arrange: here the database never answers (tests/setup.js), so a
        // valid sign-in ends in a 500. Its log is hidden to keep the output clean.
        const hideLog = jest.spyOn(console, 'error').mockImplementation(() => {});
        const ip = '203.0.113.14';
        const body = { email: 'laura@correo.test', password: 'Clave#123' };
        const statuses = [];

        // Act
        for (let i = 0; i < 12; i++) {
            statuses.push((await send('/api/auth/login', ip, body)).status);
        }
        hideLog.mockRestore();

        // Assert
        expect(statuses.every((status) => status === 500)).toBe(true);
    });

    test('one network cannot try more than 100 failed sign-ins with different emails', async () => {
        // Arrange
        const ip = '203.0.113.8';
        for (let i = 1; i <= 100; i++) {
            await send('/api/auth/login', ip, { email: `user${i}@correo.test` });
        }

        // Act
        const res = await send('/api/auth/login', ip, { email: 'user101@correo.test' });

        // Assert
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    });

    test('tells the client how many tries are left', async () => {
        // Act
        const res = await send('/api/auth/login', '203.0.113.6');

        // Assert
        expect(res.headers.ratelimit).toMatch(/r=9/);
    });
});

describe('Password recovery limit (5 per email every 15 minutes, 20 per network every hour)', () => {
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
    test('another email on the same network can still ask', async () => {
        // Arrange
        const ip = '203.0.113.11';
        await sendTimes(6, '/api/auth/forgot-password', ip, { email: 'laura' });

        // Act
        const res = await send('/api/auth/forgot-password', ip, { email: 'andres' });

        // Assert
        expect(res.status).toBe(400);
    });

    test('the requests rejected for one email do not use the quota of the network', async () => {
        // Arrange: 5 requests, then 20 more that are already rejected
        const ip = '203.0.113.13';
        await sendTimes(25, '/api/auth/forgot-password', ip, { email: 'beto' });

        // Act
        const res = await send('/api/auth/forgot-password', ip, { email: 'ana' });

        // Assert
        expect(res.status).toBe(400);
    });

    test('one network cannot ask more than 20 times in an hour', async () => {
        // Arrange
        const ip = '203.0.113.12';
        for (let i = 1; i <= 20; i++) {
            await send('/api/auth/forgot-password', ip, { email: `user${i}` });
        }

        // Act
        const res = await send('/api/auth/forgot-password', ip, { email: 'user21' });

        // Assert
        expect(res.status).toBe(429);
    });
});

describe('Sign-up limit (30 created accounts every hour)', () => {
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
