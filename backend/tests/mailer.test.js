// mailer.js reads its settings when it loads, so every test sets the
// variables first and then loads a fresh copy. nodemailer is replaced by a
// fake: no email ever leaves the machine.
const mockCreateTransport = jest.fn();
jest.mock('nodemailer', () => ({ createTransport: (...args) => mockCreateTransport(...args) }));

const MAIL_VARIABLES = ['MAILTRAP_HOST', 'MAILTRAP_PORT', 'MAILTRAP_USER', 'MAILTRAP_PASS', 'MAIL_FROM'];
const RESET_URL = 'http://localhost:5173/reset-password?token=abc123';
const savedVariables = { ...process.env };

let sendMail;

function loadMailer(variables) {
    // Only the variables of the test count, never the ones of a local .env
    MAIL_VARIABLES.forEach((name) => delete process.env[name]);
    Object.assign(process.env, variables);
    let mailer;
    jest.isolateModules(() => {
        mailer = require('../src/utils/mailer');
    });
    return mailer;
}

beforeEach(() => {
    sendMail = jest.fn().mockResolvedValue({});
    mockCreateTransport.mockReset().mockReturnValue({ sendMail });
});

afterAll(() => {
    process.env = savedVariables;
});

describe('Recovery email (#241)', () => {
    test('connects with the MAILTRAP_* settings (Mailtrap locally, Resend on the published site)', () => {
        // Act
        loadMailer({ MAILTRAP_HOST: 'smtp.resend.com', MAILTRAP_PORT: '587', MAILTRAP_USER: 'resend', MAILTRAP_PASS: 'test-key' });

        // Assert
        expect(mockCreateTransport).toHaveBeenCalledWith({
            host: 'smtp.resend.com',
            port: 587,
            auth: { user: 'resend', pass: 'test-key' },
        });
    });

    test('comes from MAIL_FROM with the name PARKEA', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({ MAIL_FROM: 'no-reply@parkeaweb.me' });

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL);

        // Assert
        expect(sendMail).toHaveBeenCalledWith(expect.objectContaining({
            from: { name: 'PARKEA', address: 'no-reply@parkeaweb.me' },
            to: 'laura@correo.test',
            subject: 'Recupera tu contraseña de PARKEA',
        }));
    });

    test('without MAIL_FROM it keeps the old sender (Mailtrap accepts any)', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL);

        // Assert
        expect(sendMail.mock.calls[0][0].from).toEqual({ name: 'PARKEA', address: 'no-reply@parkea.com' });
    });

    test('has the link both in the HTML and in the plain-text copy', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL);

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain(`href="${RESET_URL}"`);
        expect(email.text).toContain(RESET_URL);
        expect(email.text).not.toContain('<');
    });

    test('a failure of the provider reaches the caller', async () => {
        // Arrange
        sendMail.mockRejectedValue(new Error('550 domain not verified'));
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        const sending = enviarCorreoRecuperacion('laura@correo.test', RESET_URL);

        // Assert
        await expect(sending).rejects.toThrow('550 domain not verified');
    });
});
