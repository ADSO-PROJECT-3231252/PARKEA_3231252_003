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
const { Usuario, Rol, EmailVerificationToken, PasswordResetToken, AdminActionLog, sequelize } = require('../src/models');
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
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
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
    let validLinks;

    // findOne is asked first for the email and then for the document. Inside
    // the transaction the same accounts are read again, locked, by id.
    function existingAccounts({ byEmail = null, byDocument = null }) {
        jest.spyOn(Usuario, 'findOne').mockImplementation(({ where }) =>
            Promise.resolve(where.email ? byEmail : byDocument));
        jest.spyOn(Usuario, 'findByPk').mockImplementation((id) =>
            Promise.resolve([byEmail, byDocument].find((account) => account?.id === id) || null));
    }

    function unverifiedAccount(changes) {
        return {
            id: 'user-old',
            email: NEW_USER.email,
            documentNumber: '9999',
            emailVerifiedAt: null,
            update: jest.fn(async function update(data) { return { ...this, ...data }; }),
            destroy: jest.fn().mockResolvedValue(),
            ...changes,
        };
    }

    beforeEach(() => {
        jest.spyOn(Rol, 'findOne').mockResolvedValue({ id: 'role-user' });
        createUser = jest.spyOn(Usuario, 'create').mockImplementation(async (data) => ({ id: 'user-laura', ...data }));
        saveToken = jest.spyOn(EmailVerificationToken, 'create').mockResolvedValue({});
        expireTokens = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([0]);
        // By default the old account has no valid link and no admin log
        validLinks = jest.spyOn(EmailVerificationToken, 'count').mockResolvedValue(0);
        jest.spyOn(AdminActionLog, 'count').mockResolvedValue(0);
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
        existingAccounts({ byEmail: unverifiedAccount({ emailVerifiedAt: new Date() }) });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(enviarCorreoVerificacion).not.toHaveBeenCalled();
    });

    test('a document of a verified account is still taken', async () => {
        // Arrange
        existingAccounts({ byDocument: unverifiedAccount({ email: 'otra@correo.test', documentNumber: '1001', emailVerifiedAt: new Date() }) });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_ALREADY_REGISTERED');
    });

    test('an account that is not verified but still has a valid link keeps its email', async () => {
        // Arrange: Ana signed up a few minutes ago and has not opened the email yet
        const ana = unverifiedAccount({});
        existingAccounts({ byEmail: ana });
        validLinks.mockResolvedValue(1);

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(ana.update).not.toHaveBeenCalled();
        expect(saveToken).not.toHaveBeenCalled();
        expect(enviarCorreoVerificacion).not.toHaveBeenCalled();
    });

    test('an account verified while the password was hashed keeps its email (read again, locked)', async () => {
        // Arrange: the first read says not verified; the locked read says verified
        const before = unverifiedAccount({});
        const now = unverifiedAccount({ emailVerifiedAt: new Date() });
        jest.spyOn(Usuario, 'findOne').mockImplementation(({ where }) => Promise.resolve(where.email ? before : null));
        const lockedRead = jest.spyOn(Usuario, 'findByPk').mockResolvedValue(now);

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
        expect(lockedRead).toHaveBeenCalledWith('user-old', expect.objectContaining({ lock: 'UPDATE' }));
        expect(now.update).not.toHaveBeenCalled();
    });

    test('a new sign-up takes the place of an account whose links all expired', async () => {
        // Arrange
        const expired = unverifiedAccount({ documentNumber: '1001' });
        existingAccounts({ byEmail: expired, byDocument: expired });

        // Act
        const res = await post('/api/auth/register', NEW_USER);
        await flushBackground();

        // Assert
        expect(res.status).toBe(201);
        expect(createUser).not.toHaveBeenCalled();
        const data = expired.update.mock.calls[0][0];
        expect(data.fullName).toBe(NEW_USER.fullName);
        expect(data.roleId).toBe('role-user');
        expect(await bcrypt.compare(PASSWORD, data.password)).toBe(true);
        // The links it had before stop working, and the new one goes to the email
        expect(expireTokens).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: 'user-old', usedAt: null } })
        );
        expect(saveToken.mock.calls[0][0].userId).toBe('user-old');
        expect(enviarCorreoVerificacion.mock.calls[0][0]).toBe(NEW_USER.email);
    });

    test('a document held by another account with a valid link stays taken', async () => {
        // Arrange
        const other = unverifiedAccount({ email: 'otra@correo.test', documentNumber: '1001' });
        existingAccounts({ byDocument: other });
        validLinks.mockResolvedValue(1);

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('DOCUMENT_ALREADY_REGISTERED');
        expect(other.destroy).not.toHaveBeenCalled();
    });

    test('the account that held the document with expired links is deleted', async () => {
        // Arrange
        const other = unverifiedAccount({ email: 'otra@correo.test', documentNumber: '1001' });
        existingAccounts({ byDocument: other });

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(201);
        expect(other.destroy).toHaveBeenCalled();
        expect(createUser.mock.calls[0][0].documentNumber).toBe('1001');
    });

    test('if an administrator already acted on that account, it only loses the document', async () => {
        // Arrange
        const other = unverifiedAccount({ email: 'otra@correo.test', documentNumber: '1001' });
        existingAccounts({ byDocument: other });
        AdminActionLog.count.mockResolvedValue(1);

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(201);
        expect(other.destroy).not.toHaveBeenCalled();
        expect(other.update).toHaveBeenCalledWith({ documentNumber: null }, expect.anything());
    });

    test.each([
        ['email', { email: 'laura@correo.test' }, 'EMAIL_ALREADY_REGISTERED'],
        ['document', { document_number: '1001' }, 'DOCUMENT_ALREADY_REGISTERED'],
    ])('two sign-ups with the same new %s at once: the second one answers 409, not 500', async (_, fields, code) => {
        // Arrange: the database rejects the second insert
        existingAccounts({});
        const duplicate = Object.assign(new Error('Validation error'), { name: 'SequelizeUniqueConstraintError', fields });
        createUser.mockRejectedValue(duplicate);

        // Act
        const res = await post('/api/auth/register', NEW_USER);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe(code);
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
    let account;

    function storedLink(changes) {
        jest.spyOn(EmailVerificationToken, 'findOne').mockResolvedValue({
            id: 'link-1', userId: 'user-laura', usedAt: null, expiresAt: new Date(Date.now() + HOUR), ...changes,
        });
    }

    beforeEach(() => {
        markUsed = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([1]);
        account = { id: 'user-laura', emailVerifiedAt: null, update: jest.fn().mockResolvedValue({}) };
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(account);
    });

    test('a valid link verifies the account (locked first) and is marked as used', async () => {
        // Arrange
        storedLink({});

        // Act
        const res = await post('/api/auth/verify-email', { token: TOKEN });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.message).toBe('Your email has been verified. Please sign in.');
        expect(EmailVerificationToken.findOne).toHaveBeenCalledWith({ where: { tokenHash: sha256(TOKEN) } });
        expect(Usuario.findByPk).toHaveBeenCalledWith('user-laura', expect.objectContaining({ lock: 'UPDATE' }));
        const [, options] = markUsed.mock.calls[0];
        expect(options.where).toEqual(expect.objectContaining({ id: 'link-1', usedAt: null }));
        expect(account.update).toHaveBeenCalledWith({ emailVerifiedAt: expect.any(Date) }, expect.anything());
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
        expect(account.update).not.toHaveBeenCalled();
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
        expect(account.update).not.toHaveBeenCalled();
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
        const laura = { id: 'user-laura', fullName: 'Laura Gómez', email: 'laura@correo.test', emailVerifiedAt: null };
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(laura);
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(laura);

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

describe('The recovery link also verifies the account (HU-30)', () => {
    const TOKEN = 'b'.repeat(64);
    const NEW_PASSWORD = 'Nueva123*';
    let markLinkUsed;
    let expireVerificationLinks;

    function resetWith(account, linkChanges = {}) {
        jest.spyOn(PasswordResetToken, 'findOne').mockResolvedValue({
            id: 'reset-1', userId: account.id, usedAt: null, expiresAt: new Date(Date.now() + HOUR), ...linkChanges,
        });
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(account);
        return post('/api/auth/reset-password', { token: TOKEN, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });
    }

    beforeEach(() => {
        markLinkUsed = jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([1]);
        expireVerificationLinks = jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([1]);
    });

    test('an account that was not verified gets the new password and is verified', async () => {
        // Arrange
        const account = { id: 'user-laura', password: passwordHash, emailVerifiedAt: null, update: jest.fn().mockResolvedValue({}) };

        // Act
        const res = await resetWith(account);

        // Assert
        expect(res.status).toBe(200);
        expect(Usuario.findByPk).toHaveBeenCalledWith('user-laura', expect.objectContaining({ lock: 'UPDATE' }));
        const changes = account.update.mock.calls[0][0];
        expect(changes.emailVerifiedAt).toEqual(expect.any(Date));
        expect(await bcrypt.compare(NEW_PASSWORD, changes.password)).toBe(true);
        expect(expireVerificationLinks).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: 'user-laura', usedAt: null } })
        );
    });

    test('a verified account only changes the password', async () => {
        // Arrange
        const verifiedAt = new Date('2026-11-01T12:00:00Z');
        const account = { id: 'user-laura', password: passwordHash, emailVerifiedAt: verifiedAt, update: jest.fn().mockResolvedValue({}) };

        // Act
        const res = await resetWith(account);

        // Assert
        expect(res.status).toBe(200);
        expect(account.update.mock.calls[0][0].emailVerifiedAt).toBeUndefined();
        expect(expireVerificationLinks).not.toHaveBeenCalled();
    });

    test('if the same recovery link was used a moment before, it answers 400 and changes nothing', async () => {
        // Arrange
        markLinkUsed.mockResolvedValue([0]);
        const account = { id: 'user-laura', password: passwordHash, emailVerifiedAt: null, update: jest.fn() };

        // Act
        const res = await resetWith(account);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('RESET_TOKEN_INVALID');
        expect(account.update).not.toHaveBeenCalled();
    });
});
