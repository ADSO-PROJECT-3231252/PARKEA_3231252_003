import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminLogin from '../src/pages/AdminLogin';
import Register from '../src/pages/Register';
import ResetPassword from '../src/pages/ResetPassword';
import { AuthProvider } from '../src/context/AuthContext';
import { loginAdmin, register, resetPassword } from '../src/services/authService';

// The screens do not call the real API
jest.mock('../src/services/authService', () => ({
    loginAdmin: jest.fn(),
    register: jest.fn(),
    resetPassword: jest.fn(),
}));

const field = (id) => document.getElementById(id);
const apiError = (status, code) => ({ response: { status, data: { code } } });

// A request that fails when the test says so, to look at the button while it waits
function failLater(mock, error) {
    let fail;
    mock.mockReturnValue(new Promise((resolve, reject) => {
        fail = () => reject(error);
    }));
    return () => act(async () => fail());
}

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
});

// #311: when the API answers with an error, the focus is not lost: the submit
// button is aria-disabled while it waits (not disabled), so it keeps the focus,
// and a form that is replaced by a message sends the focus to that message
describe('The focus stays when a form gets an error from the API (#311)', () => {
    test('admin sign-in with a wrong password: the button keeps the focus', async () => {
        // Arrange
        const answer = failLater(loginAdmin, apiError(401, 'INVALID_CREDENTIALS'));
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><AdminLogin /></AuthProvider></MemoryRouter>);
        await user.type(field('email'), 'admin@example.com');
        await user.type(field('password'), 'Clave123*');
        const button = screen.getByRole('button', { name: 'Iniciar sesión' });
        button.focus();

        // Act: send it, and press Enter again while it waits
        await user.keyboard('{Enter}');
        await user.keyboard('{Enter}');

        // Assert: it waits aria-disabled, never disabled
        expect(loginAdmin).toHaveBeenCalledTimes(1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();

        // Act
        await answer();

        // Assert
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).toHaveFocus();
    });

    test('sign-up with an email already used: the button keeps the focus', async () => {
        // Arrange
        const answer = failLater(register, apiError(409, 'EMAIL_ALREADY_REGISTERED'));
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><Register /></AuthProvider></MemoryRouter>);
        await user.type(field('documentNumber'), '1012345678');
        await user.type(field('fullName'), 'Ana María Pérez');
        await user.type(field('email'), 'ana@correo.test');
        await user.type(field('password'), 'Clave123*');
        await user.type(field('confirmPassword'), 'Clave123*');
        await user.type(field('phone'), '3001234567');
        const button = screen.getByRole('button', { name: 'Crear cuenta' });
        button.focus();

        // Act: send it, and press Enter again while it waits
        await user.keyboard('{Enter}');
        await user.keyboard('{Enter}');

        // Assert: it waits aria-disabled, never disabled
        expect(register).toHaveBeenCalledTimes(1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();

        // Act
        await answer();

        // Assert
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).toHaveFocus();
    });

    test('password reset when the server fails: the button keeps the focus', async () => {
        // Arrange
        const answer = failLater(resetPassword, apiError(500, 'INTERNAL_ERROR'));
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[`/reset-password?token=${'a'.repeat(64)}`]}>
                <ResetPassword />
            </MemoryRouter>,
        );
        await user.type(field('newPassword'), 'Clave123*');
        await user.type(field('confirmNewPassword'), 'Clave123*');
        const button = screen.getByRole('button', { name: 'Guardar nueva contraseña' });
        button.focus();

        // Act: send it, and press Enter again while it waits
        await user.keyboard('{Enter}');
        await user.keyboard('{Enter}');

        // Assert: it waits aria-disabled, never disabled
        expect(resetPassword).toHaveBeenCalledTimes(1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();

        // Act
        await answer();

        // Assert
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).toHaveFocus();
    });

    test('password reset with a link that is no longer valid: the focus goes to the message', async () => {
        // Arrange
        resetPassword.mockRejectedValue(apiError(400, 'RESET_TOKEN_INVALID'));
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[`/reset-password?token=${'a'.repeat(64)}`]}>
                <ResetPassword />
            </MemoryRouter>,
        );
        await user.type(field('newPassword'), 'Clave123*');
        await user.type(field('confirmNewPassword'), 'Clave123*');

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

        // Assert
        expect(await screen.findByRole('alert')).toHaveFocus();
    });
});
