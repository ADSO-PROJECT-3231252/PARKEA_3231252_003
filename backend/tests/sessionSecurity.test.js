const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL) and the emails by a fake.
jest.mock('../src/utils/mailer', () => ({
    enviarCorreoRecuperacion: jest.fn(),
    enviarCorreoVerificacion: jest.fn(),
}));
const { Usuario, PasswordResetToken, EmailVerificationToken, sequelize } = require('../src/models');
const app = require('../src/app');

const PASSWORD = 'Clave123*';
const NEW_PASSWORD = 'Nueva123*';
const HOUR = 60 * 60 * 1000;

let nextIp = 1;
const fromNewIp = (req) => req.set('X-Forwarded-For', `203.0.113.${nextIp++}`);

const sessionToken = (payload) => jwt.sign({ id: 'user-laura', email: 'laura@correo.test', rol: 'user', ...payload }, process.env.JWT_SECRET);

let passwordHash;

beforeAll(async () => {
    passwordHash = await bcrypt.hash(PASSWORD, 10);
});

beforeEach(() => {
    // Runs the code of each transaction without a database
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('A session token stops working when the password changes (#199)', () => {
    // What auth.middleware.js reads on every request
    function accountAtVersion(passwordVersion) {
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue({
            id: 'user-laura', fullName: 'Laura', email: 'laura@correo.test', phone: null, documentType: 'CC',
            documentNumber: '1001', isActive: true, passwordVersion, role: { name: 'user' },
        });
    }
    const profile = (token) => request(app).get('/api/users/me').set('Authorization', `Bearer ${token}`);

    test('a token issued with the current password version is accepted', async () => {
        // Arrange
        accountAtVersion(2);

        // Act
        const res = await profile(sessionToken({ pv: 2 }));

        // Assert
        expect(res.status).toBe(200);
    });

    test('a token issued before the password changed answers 403 INVALID_TOKEN', async () => {
        // Arrange
        accountAtVersion(3);

        // Act
        const res = await profile(sessionToken({ pv: 2 }));

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test('a token from before this change (without version) still works while the password is the same', async () => {
        // Arrange
        accountAtVersion(0);

        // Act
        const res = await profile(sessionToken({}));

        // Assert
        expect(res.status).toBe(200);
    });

    test('a token without version is rejected once the password changed', async () => {
        // Arrange
        accountAtVersion(1);

        // Act
        const res = await profile(sessionToken({}));

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('INVALID_TOKEN');
    });

    test.each(['/api/auth/login', '/api/auth/login-admin'])('%s issues the token with the password version of the account', async (path) => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue({
            id: 'user-laura', fullName: 'Laura', email: 'laura@correo.test', password: passwordHash,
            isActive: true, emailVerifiedAt: new Date(), passwordVersion: 4, role: { name: 'admin' },
        });

        // Act
        const res = await fromNewIp(request(app).post(path)).send({ email: 'laura@correo.test', password: PASSWORD });

        // Assert
        expect(res.status).toBe(200);
        expect(jwt.decode(res.body.token)).toEqual(expect.objectContaining({ id: 'user-laura', rol: 'admin', pv: 4 }));
    });
});

describe('Changing the password in the profile (#199)', () => {
    let account;
    let closeLinks;

    const changePassword = (body) => request(app)
        .put('/api/users/me/password')
        .set('Authorization', `Bearer ${sessionToken({ pv: 1 })}`)
        .send(body);

    beforeEach(() => {
        account = {
            id: 'user-laura', email: 'laura@correo.test', password: passwordHash, isActive: true,
            passwordVersion: 1, role: { name: 'user' },
            update: jest.fn(async function update(data) { return { ...this, ...data }; }),
        };
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(account);
        closeLinks = jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([1]);
    });

    test('raises the password version, closes the recovery links and answers with a new token', async () => {
        // Act
        const res = await changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });

        // Assert
        expect(res.status).toBe(200);
        expect(Usuario.findByPk).toHaveBeenCalledWith('user-laura', expect.objectContaining({ lock: 'UPDATE' }));
        const changes = account.update.mock.calls[0][0];
        expect(changes.passwordVersion).toBe(2);
        expect(await bcrypt.compare(NEW_PASSWORD, changes.password)).toBe(true);
        expect(closeLinks).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: 'user-laura', usedAt: null } })
        );
        // This session goes on with the new token; the old one is version 1
        expect(jwt.decode(res.body.token)).toEqual(expect.objectContaining({ id: 'user-laura', rol: 'user', pv: 2 }));
    });

    test('if the password changed while the new one was hashed, it answers 401 and changes nothing', async () => {
        // Arrange: the locked read finds another password (a recovery link was used meanwhile)
        const changedMeanwhile = { ...account, password: 'another-hash', update: jest.fn() };
        Usuario.findByPk
            .mockResolvedValueOnce(account) // auth.middleware.js
            .mockResolvedValueOnce(account) // the first read of the controller
            .mockResolvedValueOnce(changedMeanwhile); // the locked read

        // Act
        const res = await changePassword({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
        expect(res.body.token).toBeUndefined();
        expect(changedMeanwhile.update).not.toHaveBeenCalled();
        expect(closeLinks).not.toHaveBeenCalled();
    });

    test('a wrong current password changes nothing', async () => {
        // Act
        const res = await changePassword({ currentPassword: 'Otra1234*', newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('CURRENT_PASSWORD_INCORRECT');
        expect(account.update).not.toHaveBeenCalled();
    });
});

describe('Resetting the password with the email link (#199)', () => {
    test('raises the password version and closes every other recovery link of the account', async () => {
        // Arrange
        const account = { id: 'user-laura', emailVerifiedAt: new Date(), passwordVersion: 5, update: jest.fn().mockResolvedValue({}) };
        jest.spyOn(PasswordResetToken, 'findOne').mockResolvedValue({
            id: 'reset-1', userId: 'user-laura', usedAt: null, expiresAt: new Date(Date.now() + HOUR),
        });
        jest.spyOn(Usuario, 'findByPk').mockResolvedValue(account);
        const closeLinks = jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([1]);
        jest.spyOn(EmailVerificationToken, 'update').mockResolvedValue([0]);

        // Act
        const res = await fromNewIp(request(app).post('/api/auth/reset-password'))
            .send({ token: 'c'.repeat(64), newPassword: NEW_PASSWORD, confirmNewPassword: NEW_PASSWORD });

        // Assert
        expect(res.status).toBe(200);
        expect(account.update.mock.calls[0][0].passwordVersion).toBe(6);
        // First this link (only if it is still unused), then all the others
        expect(closeLinks.mock.calls[0][1].where).toEqual(expect.objectContaining({ id: 'reset-1', usedAt: null }));
        expect(closeLinks.mock.calls[1][1].where).toEqual({ userId: 'user-laura', usedAt: null });
    });
});

describe('Signing in takes the same time whether the email exists or not (#199)', () => {
    test.each(['/api/auth/login', '/api/auth/login-admin'])('%s compares the password even when the email is not registered', async (path) => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(null);
        const compare = jest.spyOn(bcrypt, 'compare');

        // Act
        const res = await fromNewIp(request(app).post(path)).send({ email: 'nadie@correo.test', password: PASSWORD });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('INVALID_CREDENTIALS');
        expect(compare).toHaveBeenCalledTimes(1);
        const [password, hash] = compare.mock.calls[0];
        expect(password).toBe(PASSWORD);
        // A real bcrypt hash with the same cost as the passwords of the accounts
        expect(hash).toMatch(/^\$2[aby]\$10\$/);
    });

    test('the password that matches the dummy hash still cannot sign in', async () => {
        // Arrange
        jest.spyOn(Usuario, 'findOne').mockResolvedValue(null);
        jest.spyOn(bcrypt, 'compare').mockResolvedValue(true);

        // Act
        const res = await fromNewIp(request(app).post('/api/auth/login')).send({ email: 'nadie@correo.test', password: 'not-a-real-password' });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.token).toBeUndefined();
    });
});
