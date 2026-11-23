import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Login from '../src/pages/Login';
import ForgotPassword from '../src/pages/ForgotPassword';
import { AuthProvider } from '../src/context/AuthContext';
import { login, forgotPassword } from '../src/services/authService';

// The screens do not call the real API
jest.mock('../src/services/authService', () => ({
    login: jest.fn(),
    resendVerification: jest.fn(),
    forgotPassword: jest.fn(),
}));

const renderPage = (page) => render(
    <MemoryRouter><AuthProvider>{page}</AuthProvider></MemoryRouter>,
);

// #311: a button that waits for the API is aria-disabled, not disabled, so it
// keeps the focus and a second Enter does not send the form again
describe('The focus stays when a form is waiting for the API (#311)', () => {
    beforeEach(() => {
        login.mockReset();
        forgotPassword.mockReset();
        localStorage.clear();
    });

    test('login: the button keeps the focus and a second Enter sends nothing', async () => {
        // Arrange
        login.mockReturnValue(new Promise(() => {}));
        const user = userEvent.setup();
        renderPage(<Login />);
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
        const button = screen.getByRole('button', { name: /iniciar sesión|ingresando|iniciando/i });
        button.focus();

        // Act
        await user.keyboard('{Enter}');
        await user.keyboard('{Enter}');

        // Assert
        expect(login).toHaveBeenCalledTimes(1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();
        expect(button).toHaveFocus();
    });

    test('forgot password: the button keeps the focus and a second Enter sends nothing', async () => {
        // Arrange
        forgotPassword.mockReturnValue(new Promise(() => {}));
        const user = userEvent.setup();
        renderPage(<ForgotPassword />);
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');
        const button = screen.getByRole('button', { name: /enviar/i });
        button.focus();

        // Act
        await user.keyboard('{Enter}');
        await user.keyboard('{Enter}');

        // Assert
        expect(forgotPassword).toHaveBeenCalledTimes(1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveFocus();
    });

    test('forgot password: when the message appears the focus goes to it', async () => {
        // Arrange
        forgotPassword.mockResolvedValue({ data: {} });
        const user = userEvent.setup();
        renderPage(<ForgotPassword />);
        await user.type(screen.getByLabelText(/correo/i), 'laura@correo.com');

        // Act
        await user.click(screen.getByRole('button', { name: /enviar/i }));

        // Assert
        const message = await screen.findByRole('status');
        expect(message).toHaveFocus();
    });
});
