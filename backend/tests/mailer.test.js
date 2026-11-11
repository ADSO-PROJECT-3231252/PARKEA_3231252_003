const fs = require('fs');

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

describe('PARKEA layout of the recovery email (#280)', () => {
    test('carries the logo inside the email and the HTML points to it', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, 'Laura');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.attachments).toHaveLength(1);
        const [logo] = email.attachments;
        expect(logo.cid).toBe('parkea-logo');
        expect(logo.filename).toBe('parkea-logo.png');
        expect(fs.existsSync(logo.path)).toBe(true);
        expect(fs.statSync(logo.path).size).toBeGreaterThan(1000);
        expect(email.html).toContain('src="cid:parkea-logo"');
        expect(email.html).toContain('alt="PARKEA"');
    });

    test('greets the user by the first name in the HTML and in the text', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, 'Laura');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain('Hola, Laura:');
        expect(email.text).toContain('Hola, Laura:');
    });

    test('without a name it still greets ("Hola:")', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, '');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain('Hola:');
        expect(email.text).toContain('Hola:');
    });

    test('a name with HTML is shown as text, never as HTML', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, '<b>Laura</b>');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain('Hola, &lt;b&gt;Laura&lt;/b&gt;:');
        expect(email.html).not.toContain('<b>Laura</b>');
    });

    test('has the button, the 1-hour note, the full link and the footer in both copies', async () => {
        // Arrange
        const { enviarCorreoRecuperacion } = loadMailer({});

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, 'Laura');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain('<html lang="es">');
        expect(email.html).toContain('Crear nueva contraseña');
        expect(email.html).toContain('El enlace vence en <strong>1 hora</strong> y solo se puede usar <strong>una vez</strong>.');
        expect(email.html).toContain(`>${RESET_URL}</a>`);
        expect(email.html).toContain('Sistema de Reservas de Parqueo Urbano');
        expect(email.text).toContain('El enlace vence en 1 hora y solo se puede usar una vez.');
        expect(email.text).toContain(`Crear nueva contraseña:\n${RESET_URL}`);
        expect(email.text).toContain('Este correo se envió automáticamente; por favor no lo respondas.');
        expect(email.text).not.toContain('**');
    });

    test('the footer shows the year of the day the email is sent, not of the day the server started', async () => {
        // Arrange: the server started before January 1
        const { enviarCorreoRecuperacion } = loadMailer({});
        jest.spyOn(Date.prototype, 'getFullYear').mockReturnValue(2031);

        // Act
        await enviarCorreoRecuperacion('laura@correo.test', RESET_URL, 'Laura');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.html).toContain('PARKEA © 2031');
        expect(email.text).toContain('PARKEA © 2031');
        jest.restoreAllMocks();
    });
});

describe('Verification email (HU-30)', () => {
    const VERIFY_URL = 'http://localhost:5173/verify-email?token=abc123';

    test('uses the PARKEA layout with the link, the 24-hour note and the logo', async () => {
        // Arrange
        const { enviarCorreoVerificacion } = loadMailer({ MAIL_FROM: 'no-reply@parkeaweb.me' });

        // Act
        await enviarCorreoVerificacion('laura@correo.test', VERIFY_URL, 'Laura');

        // Assert
        const email = sendMail.mock.calls[0][0];
        expect(email.from).toEqual({ name: 'PARKEA', address: 'no-reply@parkeaweb.me' });
        expect(email.to).toBe('laura@correo.test');
        expect(email.subject).toBe('Confirma tu correo de PARKEA');
        expect(email.html).toContain(`href="${VERIFY_URL}"`);
        expect(email.html).toContain('Hola, Laura:');
        expect(email.html).toContain('Confirmar mi correo');
        expect(email.html).toContain('El enlace vence en <strong>24 horas</strong>');
        expect(email.text).toContain(`Confirmar mi correo:\n${VERIFY_URL}`);
        expect(email.attachments[0].cid).toBe('parkea-logo');
    });

    test('a failure of the provider reaches the caller', async () => {
        // Arrange
        sendMail.mockRejectedValue(new Error('550 domain not verified'));
        const { enviarCorreoVerificacion } = loadMailer({});

        // Act
        const sending = enviarCorreoVerificacion('laura@correo.test', VERIFY_URL, 'Laura');

        // Assert
        await expect(sending).rejects.toThrow('550 domain not verified');
    });
});
