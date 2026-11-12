const crypto = require('crypto');
const request = require('supertest');

// The email is replaced by a fake and the database by spies on the two
// models this route uses (tests/setup.js: the tests never reach MySQL).
jest.mock('../src/utils/mailer', () => ({ enviarCorreoRecuperacion: jest.fn() }));
const { enviarCorreoRecuperacion } = require('../src/utils/mailer');
const { Usuario, PasswordResetToken, sequelize } = require('../src/models');
const app = require('../src/app');

const GENERIC_ANSWER = { message: "If an account exists for that email, we've sent a recovery link" };
const LAURA = { id: 'user-laura', fullName: 'Laura Gómez Ríos', email: 'laura@correo.test' };

// Each test comes from its own IP so the recovery limit (#191) never applies
const askForLink = (ip, email) =>
    request(app).post('/api/auth/forgot-password').set('X-Forwarded-For', ip).send({ email });

// The link is created and sent after the answer (#199); this waits for it
const flushBackground = () => new Promise((resolve) => setTimeout(resolve, 20));

let findUser;
let saveToken;
let expireLinks;

beforeEach(() => {
    findUser = jest.spyOn(Usuario, 'findOne').mockResolvedValue(LAURA);
    jest.spyOn(Usuario, 'findByPk').mockResolvedValue(LAURA);
    saveToken = jest.spyOn(PasswordResetToken, 'create').mockResolvedValue({});
    expireLinks = jest.spyOn(PasswordResetToken, 'update').mockResolvedValue([0]);
    // Runs the code of the transaction without a database
    jest.spyOn(sequelize, 'transaction').mockImplementation(async (work) => work({ LOCK: { UPDATE: 'UPDATE' } }));
    enviarCorreoRecuperacion.mockReset().mockResolvedValue();
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('Asking for a recovery link (HU-07, #241, #280)', () => {
    test('sends the link and the first name to the account and stores only the hash of its token', async () => {
        // Act
        const res = await askForLink('198.51.100.1', LAURA.email);
        await flushBackground();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        const [to, link, firstName] = enviarCorreoRecuperacion.mock.calls[0];
        expect(to).toBe(LAURA.email);
        expect(firstName).toBe('Laura');
        const token = new URL(link).searchParams.get('token');
        expect(token).toMatch(/^[0-9a-f]{64}$/);
        const stored = saveToken.mock.calls[0][0];
        expect(stored.userId).toBe(LAURA.id);
        expect(stored.tokenHash).toBe(crypto.createHash('sha256').update(token).digest('hex'));
    });

    test('if the email provider fails, the answer is the same 200 (it does not reveal the account)', async () => {
        // Arrange
        enviarCorreoRecuperacion.mockRejectedValue(new Error('550 domain not verified'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const res = await askForLink('198.51.100.2', LAURA.email);
        await flushBackground();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        expect(log).toHaveBeenCalledWith('Could not send the recovery email:', '550 domain not verified');
    });

    test('an email without an account gets the same answer and nothing is sent', async () => {
        // Arrange
        findUser.mockResolvedValue(null);

        // Act
        const res = await askForLink('198.51.100.3', 'nadie@correo.test');

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        await flushBackground();
        expect(saveToken).not.toHaveBeenCalled();
        expect(enviarCorreoRecuperacion).not.toHaveBeenCalled();
    });

    test('a new link makes the previous ones stop working (#199)', async () => {
        // Act
        await askForLink('198.51.100.4', LAURA.email);
        await flushBackground();

        // Assert: the account is locked first, then its unused links are closed
        expect(Usuario.findByPk).toHaveBeenCalledWith(LAURA.id, expect.objectContaining({ lock: 'UPDATE' }));
        expect(expireLinks).toHaveBeenCalledWith(
            { usedAt: expect.any(Date) },
            expect.objectContaining({ where: { userId: LAURA.id, usedAt: null } })
        );
        expect(expireLinks.mock.invocationCallOrder[0]).toBeLessThan(saveToken.mock.invocationCallOrder[0]);
    });

    test('if the link cannot be saved, the answer is still 200 and no email goes out (#199)', async () => {
        // Arrange
        saveToken.mockRejectedValue(new Error('database is down'));
        const log = jest.spyOn(console, 'error').mockImplementation(() => {});

        // Act
        const res = await askForLink('198.51.100.5', LAURA.email);
        await flushBackground();

        // Assert
        expect(res.status).toBe(200);
        expect(res.body).toEqual(GENERIC_ANSWER);
        expect(enviarCorreoRecuperacion).not.toHaveBeenCalled();
        expect(log).toHaveBeenCalledWith('Could not send the recovery email:', 'database is down');
    });
});
