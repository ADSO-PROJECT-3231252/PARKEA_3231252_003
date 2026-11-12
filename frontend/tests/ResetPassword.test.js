import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import ResetPassword from '../src/pages/ResetPassword';
import { resetPassword } from '../src/services/authService';

// The screen does not call the real API
jest.mock('../src/services/authService', () => ({ resetPassword: jest.fn() }));

const renderAt = () => render(
    <MemoryRouter initialEntries={[`/reset-password?token=${'a'.repeat(64)}`]}>
        <ResetPassword />
    </MemoryRouter>,
);

describe('Resetting the password with the link (#199)', () => {
    beforeEach(() => {
        resetPassword.mockReset();
    });

    test('the same password as the current one shows the error on the field and keeps the form', async () => {
        // Arrange
        resetPassword.mockRejectedValue({ response: { status: 400, data: { code: 'PASSWORD_UNCHANGED' } } });
        const user = userEvent.setup();
        renderAt();

        // Act
        await user.type(document.getElementById('newPassword'), 'Clave123*');
        await user.type(document.getElementById('confirmNewPassword'), 'Clave123*');
        await user.click(screen.getByRole('button', { name: 'Guardar nueva contraseña' }));

        // Assert
        const error = await screen.findByText('La nueva contraseña debe ser diferente a la actual');
        expect(error).toHaveAttribute('id', 'newPassword-error');
        expect(document.getElementById('newPassword')).toHaveAttribute('aria-invalid', 'true');
        // The link still works, so the form stays to try another password
        expect(screen.getByRole('button', { name: 'Guardar nueva contraseña' })).toBeInTheDocument();
    });
});
