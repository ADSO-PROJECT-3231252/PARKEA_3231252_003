import { StrictMode } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import VerifyEmail from '../src/pages/VerifyEmail';
import CheckEmail from '../src/pages/CheckEmail';
import ResendVerification from '../src/pages/ResendVerification';
import { verifyEmail, resendVerification } from '../src/services/authService';

// The screens do not call the real API
jest.mock('../src/services/authService', () => ({
    register: jest.fn(),
    verifyEmail: jest.fn(),
    resendVerification: jest.fn(),
}));

const TOKEN = 'a'.repeat(64);

function renderAt(entry, element) {
    return render(
        <StrictMode>
            <MemoryRouter initialEntries={[entry]}>
                <Routes>
                    <Route path="*" element={element} />
                </Routes>
            </MemoryRouter>
        </StrictMode>,
    );
}

beforeEach(() => {
    verifyEmail.mockReset();
    resendVerification.mockReset();
});

describe('Opening the link of the email (HU-30, AC-02 and AC-03)', () => {
    test('a valid link confirms the email and offers to sign in', async () => {
        // Arrange
        verifyEmail.mockResolvedValue({ data: {} });

        // Act
        renderAt(`/verify-email?token=${TOKEN}`, <VerifyEmail />);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Correo confirmado' })).toBeInTheDocument();
        expect(screen.getByRole('status')).toHaveTextContent('Tu cuenta de PARKEA ya está activa');
        expect(screen.getByRole('link', { name: 'Iniciar sesión' })).toHaveAttribute('href', '/login');
    });

    test('sends the token only once, even with StrictMode running the effect twice', async () => {
        // Arrange
        verifyEmail.mockResolvedValue({ data: {} });

        // Act
        renderAt(`/verify-email?token=${TOKEN}`, <VerifyEmail />);
        await screen.findByRole('heading', { name: 'Correo confirmado' });

        // Assert
        expect(verifyEmail).toHaveBeenCalledTimes(1);
        expect(verifyEmail).toHaveBeenCalledWith({ token: TOKEN });
    });

    test('a link that is no longer valid explains it and offers a new one', async () => {
        // Arrange
        verifyEmail.mockRejectedValue({ response: { status: 400, data: { code: 'VERIFICATION_TOKEN_INVALID' } } });

        // Act
        renderAt(`/verify-email?token=${TOKEN}`, <VerifyEmail />);

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Este enlace de confirmación ya no es válido. Pide uno nuevo');
        expect(screen.getByRole('link', { name: 'Pedir un nuevo enlace' })).toHaveAttribute('href', '/verify-email/resend');
        expect(screen.getByRole('link', { name: 'Ir a iniciar sesión' })).toHaveAttribute('href', '/login');
    });

    test('without a token it shows the invalid link and calls nothing', () => {
        // Act
        renderAt('/verify-email', <VerifyEmail />);

        // Assert
        expect(screen.getByRole('heading', { name: 'Enlace no válido' })).toBeInTheDocument();
        expect(verifyEmail).not.toHaveBeenCalled();
    });

    test('if the server does not answer, it can try again', async () => {
        // Arrange
        verifyEmail.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ data: {} });
        const user = userEvent.setup();
        renderAt(`/verify-email?token=${TOKEN}`, <VerifyEmail />);

        // Act
        await user.click(await screen.findByRole('button', { name: 'Intentar de nuevo' }));

        // Assert
        expect(await screen.findByRole('heading', { name: 'Correo confirmado' })).toBeInTheDocument();
        expect(verifyEmail).toHaveBeenCalledTimes(2);
    });
});

describe('After signing up (HU-30, AC-01 and AC-05)', () => {
    test('says the email was sent to that address and resends it', async () => {
        // Arrange
        resendVerification.mockResolvedValue({ data: {} });
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[{ pathname: '/verify-email/sent', state: { email: 'laura@correo.test' } }]}>
                <CheckEmail />
            </MemoryRouter>,
        );
        expect(screen.getByText('laura@correo.test')).toBeInTheDocument();

        // Act
        await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

        // Assert
        expect(resendVerification).toHaveBeenCalledWith({ email: 'laura@correo.test' });
        expect(await screen.findByText(/te enviamos un nuevo enlace/i)).toBeInTheDocument();
    });

    test('too many requests shows the limit message', async () => {
        // Arrange
        resendVerification.mockRejectedValue({ response: { status: 429, data: { code: 'TOO_MANY_REQUESTS' } } });
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[{ pathname: '/verify-email/sent', state: { email: 'laura@correo.test' } }]}>
                <CheckEmail />
            </MemoryRouter>,
        );

        // Act
        await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Hiciste demasiados intentos');
    });

    test('without the email (page opened directly) it links to ask for a new link', () => {
        // Act
        render(
            <MemoryRouter initialEntries={['/verify-email/sent']}>
                <CheckEmail />
            </MemoryRouter>,
        );

        // Assert
        expect(screen.queryByRole('button', { name: 'Reenviar correo' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Pedir un nuevo enlace' })).toHaveAttribute('href', '/verify-email/resend');
    });
});

describe('Asking for a new link (HU-30, AC-05)', () => {
    test('sends the email and shows the same answer whether or not the account exists', async () => {
        // Arrange
        resendVerification.mockResolvedValue({ data: {} });
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <ResendVerification />
            </MemoryRouter>,
        );

        // Act
        await user.type(screen.getByLabelText('Correo electrónico'), 'laura@correo.test');
        await user.click(screen.getByRole('button', { name: 'Enviar nuevo enlace' }));

        // Assert
        expect(resendVerification).toHaveBeenCalledWith({ email: 'laura@correo.test' });
        expect(await screen.findByRole('status')).toHaveTextContent('Si la cuenta aún no está confirmada');
    });

    test('an invalid email is not sent', async () => {
        // Arrange
        const user = userEvent.setup();
        render(
            <MemoryRouter>
                <ResendVerification />
            </MemoryRouter>,
        );

        // Act
        await user.type(screen.getByLabelText('Correo electrónico'), 'laura@');
        await user.click(screen.getByRole('button', { name: 'Enviar nuevo enlace' }));

        // Assert
        expect(await screen.findByText('Ingresa un correo válido.')).toBeInTheDocument();
        expect(resendVerification).not.toHaveBeenCalled();
    });
});

describe('Signing up goes to "Revisa tu correo" (HU-30, AC-01)', () => {
    test('after the account is created it shows the screen with the email', async () => {
        // Arrange
        const { register } = jest.requireMock('../src/services/authService');
        register.mockResolvedValue({ data: {} });
        const Register = jest.requireActual('../src/pages/Register').default;
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/register']}>
                <Routes>
                    <Route path="/register" element={<Register />} />
                    <Route path="/verify-email/sent" element={<CheckEmail />} />
                </Routes>
            </MemoryRouter>,
        );

        // Act
        await user.type(document.getElementById('documentNumber'), '1001');
        await user.type(document.getElementById('fullName'), 'Laura Gómez');
        await user.type(document.getElementById('email'), 'laura@correo.test');
        await user.type(document.getElementById('password'), 'Clave123*');
        await user.type(document.getElementById('confirmPassword'), 'Clave123*');
        await user.type(document.getElementById('phone'), '3001234567');
        await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

        // Assert
        expect(await screen.findByRole('heading', { name: 'Revisa tu correo' })).toBeInTheDocument();
        expect(screen.getByText('laura@correo.test')).toBeInTheDocument();
    });

    test('an email that is already registered links to ask for a new link', async () => {
        // Arrange
        const { register } = jest.requireMock('../src/services/authService');
        register.mockRejectedValue({ response: { status: 409, data: { code: 'EMAIL_ALREADY_REGISTERED' } } });
        const Register = jest.requireActual('../src/pages/Register').default;
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={['/register']}>
                <Register />
            </MemoryRouter>,
        );

        // Act
        await user.type(document.getElementById('documentNumber'), '1001');
        await user.type(document.getElementById('fullName'), 'Laura Gómez');
        await user.type(document.getElementById('email'), 'laura@correo.test');
        await user.type(document.getElementById('password'), 'Clave123*');
        await user.type(document.getElementById('confirmPassword'), 'Clave123*');
        await user.type(document.getElementById('phone'), '3001234567');
        await user.click(screen.getByRole('button', { name: /crear cuenta/i }));

        // Assert
        expect(await screen.findByText('Este correo ya está registrado')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Pide un nuevo enlace' })).toHaveAttribute('href', '/verify-email/resend');

        // The link goes away when the email changes
        await user.type(document.getElementById('email'), 'x');
        expect(screen.queryByRole('link', { name: 'Pide un nuevo enlace' })).not.toBeInTheDocument();
    });
});
