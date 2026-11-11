const crypto = require('crypto');
const bcrypt = require('bcrypt');
const request = require('supertest');

// The emails are replaced by a fake and the database by spies on the models
// (tests/setup.js: the tests never reach MySQL).
jest.mock('../src/utils/mailer', () => ({
    enviarCorreoRecuperacion: jest.fn(),
    enviarCorreoVerificacion: jest.fn(),
}));
const { enviarCorreoVerificacion } = require('../src/utils/mailer');
const { Usuario, Rol, EmailVerificationToken, sequelize } = require('../src/models');
const app = require('../src/app');

const sha256 = (value) => crypto.createHash('sha256').update(value).digest('hex');
const HOUR = 60 * 60 * 1000;
const PASSWORD = 'Clave123*';

// Each request comes from its own IP so the attempt limits (#191) only
// apply in the tests about them
let nextIp = 1;
const post = (path, body) =>
    request(app).post(path).set('X-Forwarded-For', `198.51.100.${nextIp++}`).send(body);

// The email goes out in the background; this lets it reach the fake
const flushBackground = () => new Promise((resolve) => setImmediate(resolve));

let passwordHash;

beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 4);
});

beforeEach(() => {
    enviarCorreoVerificacion.mockReset().mockResolvedValue();
    // Runs the code of each transaction without a database
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({}));
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Signing up creates the account as not verified (HU-30, AC-01)', () => {
    const NEW_USER = {
        fullName: 'Laura Gómez Ríos',
        email: 'laura@correo.test',
        password: PASSWORD,
        confirmPassword: PASSWORD,
        phone: '3001234567',
        documentType: 'CC',
        documentNumber: '1001',
    };

    let createUser;
    let saveToken;
    let expireTokens;

    // findOne is asked first for the email and then for the document
    function existingAccounts({ byEmail = null, byDocument = null }) {
        jest.spyOn(Usuario, 'findOne').mockImplementation(({ where }) =>
            Promise.resolve(where.email ? byEmail : byDocument));
    }

    beforeEach(() => {
        jest.spyOn(Rol, 'findOne').mockResolvedValue({ id: 'role-user' });
        createUser = jest.spyOn(Usuario, 'create').mockImplementation(async (data) => ({ id: 'user-laura', ...data }));
        saveToken = jest.spyOn(EmailVerificationToken, 'create').mockResolvedValue({});
        expireTokens = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([0]);
    });

    test('a new account is saved without verifying and gets the link by email', async () => {
        // Arrange
        existingAccounts({});

        // Act
        const res = await post('/api/auth/register', NEW_USER);
        await flushBackground();

        // Assert
        expect(res.status).toBe(201);
        expect(res.body.message).toBe('Registration complete. Check your email to verify your account.');
        const saved = createUser.mock.calls[0][0];
        expect(saved.emailVerifiedAt).toBeUndefined();
        expect(saved.roleId).toBe('role-user');

        const [to, link, firstName] = enviarCorreoVerificacion.mock.calls[0];
        expect(to).toBe(NEW_USER.email);
        expect(firstName).toBe('Laura');
        const token = new URL(link).searchParams.get('token');
        expect(new URL(link).pathname).toBe('/verify-email');
        expect(token).toMatch(/^[0-9a-f]{64}$/);

        const stored = saveToken.mock.calls[0][0];
        expect(stored.userId).toBe('user-laura');
        expect(stored.tokenHash).toBe(sha256(token));
        const lifetime = new Date(stored.expiresAt).getTime() - Date.now();
        expect(lifetime).toBeGreaterThan(24 * HOUR - 60 * 1000);
        expect(lifetime).toBeLessThanOrEqual(24 * HOUR);
    });

    test('if the email provider fails, the account is still created (the user can ask again)', async () => {
        // Arrange
        existingAccounts({});
        enviarCorreoVerificacion.mockRejectedValue(new Error('550 domain not verified'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const res = await post('/api/auth/register', NEW_USER);
        await flushBackground();

        // Assert
        expect(res.status).toBe(201);
        expect(log).toHaveBeenCalledWith('Could not send the verification email:', '550 domain not verified');
    });

    test('an email of a verified account is still taken', async () => {
        // Arrange
        existingAccounts({ byEmail: { id: 'user-old', emailVerifiedAt: new Date() } });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(enviarCorreoVerificacion).not.toHaveBeenCalled();
    });

    test('a document of a verified account is still taken', async () => {
        // Arrange
        existingAccounts({ byDocument: { id: 'user-old', emailVerifiedAt: new Date() } });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_ALREADY_REGISTERED');
    });

    test('a new sign-up takes the place of an account that was never verified', async () => {
        // Arrange: someone signed up with Laura's email and never verified it
        const unverified = {
            id: 'user-squatter',
            emailVerifiedAt: null,
            update: jest.fn(async function update(data) { return { ...this, ...data }; }),
        };
        existingAccounts({ byEmail: unverified, byDocument: unverified });

        // Act
        const res = await post('/api/auth/register', NEW_USER);
        await flushBackground();

        // Assert
        expect(res.status).toBe(201);
        expect(createUser).not.toHaveBeenCalled();
        const data = unverified.update.mock.calls[0][0];
        expect(data.fullName).toBe(NEW_USER.fullName);
        expect(data.roleId).toBe('role-user');
        expect(await bcrypt.compare(PASSWORD, data.password)).toBe(true);
        // The links it had before stop working, and the new one goes to the email
        expect(expireTokens).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: 'user-squatter', usedAt: null } })
        );
        expect(saveToken.mock.calls[0][0].userId).toBe('user-squatter');
        expect(enviarCorreoVerificacion.mock.calls[0][0]).toBe(NEW_USER.email);
    });

    test('a document taken by another account that was never verified is freed', async () => {
        // Arrange
        const otherUnverified = { id: 'user-squatter', emailVerifiedAt: null, update: jest.fn().mockResolvedValue({}) };
        existingAccounts({ byDocument: otherUnverified });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(201);
        expect(otherUnverified.update).toHaveBeenCalledWith({ documentNumber: null }, expect.anything());
        expect(createUser.mock.calls[0][0].documentNumber).toBe('1001');
    });
});

describe('An account that is not verified cannot sign in (HU-30, AC-04)', () => {
    function account(changes) {
        return { id: 'user-laura', fullName: 'Laura', email: 'laura@correo.test', password: passwordHash,
            isActive: true, emailVerifiedAt: null, role: { name: 'user' }, ...changes };
    }

    test.each(['/api/auth/login', '/api/auth/login-admin'])('%s with the right password answers 403 EMAIL_NOT_VERIFIED', async (path) => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(account({}));

        // Act
        const res = await post(path, { email: 'laura@correo.test', password: PASSWORD });

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('EMAIL_NOT_VERIFIED');
        expect(res.body.token).toBeUndefined();
    });

    test('with a wrong password it answers 401, so it never reveals the account', async () => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(account({}));

        // Act
        const res = await post('/api/auth/login', { email: 'laura@correo.test', password: 'Otra123*' });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    test('a verified account signs in as before', async () => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(account({ emailVerifiedAt: new Date() }));

        // Act
        const res = await post('/api/auth/login', { email: 'laura@correo.test', password: PASSWORD });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.token).toEqual(expect.any(String));
    });
});

describe('Opening the verification link (HU-30, AC-02 and AC-03)', () => {
    const TOKEN = 'a'.repeat(64);
    let markUsed;
    let verifyUser;

    function storedLink(changes) {
        jest.spyOn(EmailVerificationToken, 'findOne').mockResolvedValue({
            id: 'link-1', userId: 'user-laura', usedAt: null, expiresAt: new Date(Date.now() + HOUR), ...changes,
        });
    }

    beforeEach(() => {
        markUsed = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([1]);
        verifyUser = jest.spyOn(Usuario, 'update').mockResolvedValue([1]);
    });

    test('a valid link verifies the account and is marked as used', async () => {
        // Arrange
        storedLink({});

        // Act
        const res = await post('/api/auth/verify-email', { token: TOKEN });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Your email has been verified. Please sign in.');
        expect(EmailVerificationToken.findOne).toHaveBeenCalledWith({ where: { tokenHash: sha256(TOKEN) } });
        expect(markUsed).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { id: 'link-1', usedAt: null } })
        );
        expect(verifyUser).toHaveBeenCalledWith(
            { emailVerifiedAt: expect.any(Date) },
            expect.objectContaining({ where: { id: 'user-laura', emailVerifiedAt: null } })
        );
    });

    test.each([
        ['already used', { usedAt: new Date() }],
        ['expired', { expiresAt: new Date(Date.now() - 1000) }],
    ])('a link that was %s answers 400 VERIFICATION_TOKEN_INVALID', async (_, changes) => {
        // Arrange
        storedLink(changes);

        // Act
        const res = await post('/api/auth/verify-email', { token: TOKEN });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VERIFICATION_TOKEN_INVALID');
        expect(verifyUser).not.toHaveBeenCalled();
    });

    test('a link that does not exist answers 400 VERIFICATION_TOKEN_INVALID', async () => {
        // Arrange
        jest.spyOn(EmailVerificationToken, 'findOne').mockResolvedValue(null);

        // Act
        const res = await post('/api/auth/verify-email', { token: TOKEN });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VERIFICATION_TOKEN_INVALID');
    });

    test('if the same link was used a moment before (opened twice), it answers 400', async () => {
        // Arrange: the other request marked it first
        storedLink({});
        markUsed.mockResolvedValue([0]);

        // Act
        const res = await post('/api/auth/verify-email', { token: TOKEN });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VERIFICATION_TOKEN_INVALID');
        expect(verifyUser).not.toHaveBeenCalled();
    });

    test('without a token it answers 400 VALIDATION_ERROR', async () => {
        // Act
        const res = await post('/api/auth/verify-email', {});

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
    });
});

describe('Asking for the verification email again (HU-30, AC-05)', () => {
    const GENERIC_ANSWER = { message: "If that account still needs to be verified, we've sent a new link" };
    let expireTokens;
    let saveToken;

    beforeEach(() => {
        expireTokens = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([1]);
        saveToken = jest.spyOn(EmailVerificationToken, 'create').mockResolvedValue({});
    });

    test('an account that is not verified gets a new link and the previous ones stop working', async () => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue({ id: 'user-laura', fullName: 'Laura Gómez', email: 'laura@correo.test', emailVerifiedAt: null });

        // Act
        const res = await post('/api/auth/resend-verification', { email: 'laura@correo.test' });
        await flushBackground();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        expect(expireTokens).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: 'user-laura', usedAt: null } })
        );
        const [to, link] = enviarCorreoVerificacion.mock.calls[0];
        expect(to).toBe('laura@correo.test');
        expect(saveToken.mock.calls[0][0].tokenHash).toBe(sha256(new URL(link).searchParams.get('token')));
    });

    test.each([
        ['does not exist', null],
        ['is already verified', { id: 'user-laura', email: 'laura@correo.test', emailVerifiedAt: new Date() }],
    ])('an email that %s gets the same answer and nothing is sent', async (_, found) => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(found);

        // Act
        const res = await post('/api/auth/resend-verification', { email: 'laura@correo.test' });
        await flushBackground();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        expect(saveToken).not.toHaveBeenCalled();
        expect(enviarCorreoVerificacion).not.toHaveBeenCalled();
    });

    test('has the same limit as password recovery: the sixth request answers 429', async () => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(null);
        const ask = () => request(app)
            .post('/api/auth/resend-verification')
            .set('X-Forwarded-For', '192.0.2.77')
            .send({ email: 'limite@correo.test' });

        // Act
        for (let i = 0; i < 5; i++) {
            expect((await ask()).status).toBe(200);
        }
        const res = await ask();

        // Assert
        expect(res.status).toBe(429);
        expect(res.body.code).toBe('TOO_MANY_REQUESTS');
    });
});
