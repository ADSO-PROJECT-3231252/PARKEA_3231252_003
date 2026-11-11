import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../src/pages/Login';
import { AuthProvider } from '../src/context/AuthContext';
import { login, resendVerification } from '../src/services/authService';

// The screen does not call the real API: login() is replaced by a fake one
jest.mock('../src/services/authService', () => ({ login: jest.fn(), resendVerification: jest.fn() }));

const renderLogin = () => render(
    <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
            <Login />
        </AuthProvider>
    </MemoryRouter>,
);

describe('Login screen', () => {
    beforeEach(() => {
        login.mockReset();
        localStorage.clear();
    });

    test('shows "Correo o contraseña incorrectos" when the API answers INVALID_CREDENTIALS', async () => {
        // Arrange
        login.mockRejectedValue({ response: { status: 401, data: { code: 'INVALID_CREDENTIALS' } } });
        const user = userEvent.setup();
        renderLogin();
        // Act
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
        // Assert
        expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
        expect(login).toHaveBeenCalledWith({ email: 'laura@correo.com', password: 'Clave#123' });
        expect(localStorage.getItem('token')).toBeNull();
    });

    test('does not call the API when the fields are empty', async () => {
        const user = userEvent.setup();
        renderLogin();
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
        expect(await screen.findByText('El correo es obligatorio.')).toBeInTheDocument();
        expect(screen.getByText('La contraseña es obligatoria.')).toBeInTheDocument();
        expect(login).not.toHaveBeenCalled();
    });

    test('an account that is not verified shows the message and "Reenviar correo" (HU-30, AC-04)', async () => {
        // Arrange
        login.mockRejectedValue({ response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } });
        resendVerification.mockResolvedValue({ data: {} });
        const user = userEvent.setup();
        renderLogin();
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
        expect(await screen.findByText('Confirma tu correo antes de iniciar sesión. Revisa tu bandeja de entrada')).toBeInTheDocument();

        // Act
        await user.click(screen.getByRole('button', { name: 'Reenviar correo' }));

        // Assert
        expect(resendVerification).toHaveBeenCalledWith({ email: 'laura@correo.com' });
        expect(await screen.findByText(/te enviamos un nuevo enlace/i)).toBeInTheDocument();
        expect(localStorage.getItem('token')).toBeNull();
    });

    test('"Reenviar correo" goes away when the email changes', async () => {
        // Arrange
        login.mockRejectedValue({ response: { status: 403, data: { code: 'EMAIL_NOT_VERIFIED' } } });
        const user = userEvent.setup();
        renderLogin();
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
        expect(await screen.findByRole('button', { name: 'Reenviar correo' })).toBeInTheDocument();

        // Act
        await user.type(screen.getByLabelText(/correo/i), 'x');

        // Assert
        expect(screen.queryByRole('button', { name: 'Reenviar correo' })).not.toBeInTheDocument();
    });

    test('a wrong password does not offer "Reenviar correo"', async () => {
        login.mockRejectedValue({ response: { status: 401, data: { code: 'INVALID_CREDENTIALS' } } });
        const user = userEvent.setup();
        renderLogin();
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
        await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
        expect(await screen.findByText('Correo o contraseña incorrectos')).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Reenviar correo' })).not.toBeInTheDocument();
    });
});
