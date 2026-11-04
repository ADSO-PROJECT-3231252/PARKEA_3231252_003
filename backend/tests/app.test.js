const zlib = require('zlib');
const request = require('supertest');
const jwt = require('jsonwebtoken');
const app = require('../src/app');

// These requests are answered before any controller reads the database:
// by app.js itself, by the validators or by the token check.

describe('GET /api/health', () => {
    test('answers 200 while the server is running', async () => {
        // Act
        const res = await request(app).get('/api/health');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual({ status: 'ok', service: 'PARKEA API' });
    });
});

describe('Errors handled by app.js', () => {
    test('a route that does not exist answers 404 ROUTE_NOT_FOUND', async () => {
        // Act
        const res = await request(app).get('/api/route-that-does-not-exist');

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('ROUTE_NOT_FOUND');
    });

    test('a body that is not valid JSON answers 400 INVALID_JSON without parser details (#185)', async () => {
        // Arrange
        const brokenJson = '{"email": "admin@parkea.com", ';

        // Act
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .send(brokenJson);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({ code: 'INVALID_JSON', message: 'The request body is not valid JSON' });
    });

    test('a body larger than 100 kB answers 413 PAYLOAD_TOO_LARGE (#185)', async () => {
        // Arrange
        const bigBody = { email: 'admin@parkea.com', password: 'x'.repeat(110 * 1024) };

        // Act
        const res = await request(app).post('/api/auth/login').send(bigBody);

        // Assert
        expect(res.status).toBe(413);
        expect(res.body.code).toBe('PAYLOAD_TOO_LARGE');
    });
});

describe('Damaged or unsupported request bodies (#258)', () => {
    // The answer has the project's code and message only, never the parser's
    // (for example "Z_DATA_ERROR" or "unsupported charset").
    const INVALID_JSON = { code: 'INVALID_JSON', message: 'The request body is not valid JSON' };

    test.each(['gzip', 'deflate', 'br'])('a damaged %s body answers 400 INVALID_JSON', async (encoding) => {
        // Act
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('Content-Encoding', encoding)
            .send('this is not compressed');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual(INVALID_JSON);
    });

    test('a valid gzip body is still read', async () => {
        // Arrange: the empty fields reach the validator, so the body was read
        const compressed = zlib.gzipSync(JSON.stringify({ email: '', password: '' }));

        // Act
        const res = await request(app)
            .post('/api/auth/login')
            .set('Content-Type', 'application/json')
            .set('Content-Encoding', 'gzip')
            .serialize((body) => body)
            .send(compressed);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
});

describe('POST /api/auth/login validation', () => {
    test('empty fields answer 400 VALIDATION_ERROR naming both fields', async () => {
        // Act
        const res = await request(app).post('/api/auth/login').send({ email: '', password: '' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        const fields = res.body.errors.map((error) => error.path);
        expect(fields).toEqual(expect.arrayContaining(['email', 'password']));
    });

    test('an email sent as a list answers 400 VALIDATION_ERROR instead of 500 (#184)', async () => {
        // Act
        const res = await request(app)
            .post('/api/auth/login')
            .send({ email: ['admin@parkea.com'], password: 'Admin123!' });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expect(res.body.errors[0]).toMatchObject({ path: 'email', msg: 'Email must be text' });
    });
});

describe('Protected routes without a valid token', () => {
    test('no token answers 401 NO_TOKEN', async () => {
        // Act
        const res = await request(app).get('/api/admin/users');

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_TOKEN');
    });

    test('a token that is not a JWT answers 403 INVALID_TOKEN', async () => {
        // Act
        const res = await request(app).get('/api/admin/users').set('Authorization', 'Bearer not-a-real-token');

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('a token signed with another secret answers 403 INVALID_TOKEN', async () => {
        // Arrange: an admin token made by someone who doesn't know JWT_SECRET
        const forgedToken = jwt.sign({ id: 1, rol: 'admin' }, 'someone-elses-secret');

        // Act
        const res = await request(app).get('/api/admin/users').set('Authorization', `Bearer ${forgedToken}`);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('INVALID_TOKEN');
    });
});
