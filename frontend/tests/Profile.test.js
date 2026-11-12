import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Profile from '../src/pages/Profile';
import { AuthProvider } from '../src/context/AuthContext';
import { getProfile, updateProfile, changePassword } from '../src/services/userService';

// The screen does not call the real API
jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
}));

const LAURA = { id: 'user-laura', fullName: 'Laura Gómez', email: 'laura@correo.test', phone: '3001234567', role: 'user' };

const renderProfile = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Profile />
        </AuthProvider>
    </MemoryRouter>,
);

async function fillPasswords(user) {
    await user.type(document.getElementById('currentPassword'), 'Clave123*');
    await user.type(document.getElementById('newPassword'), 'Nueva123*');
    await user.type(document.getElementById('confirmNewPassword'), 'Nueva123*');
}

describe('Changing the password in the profile (#199)', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'old-token');
        localStorage.setItem('user', JSON.stringify(LAURA));
        getProfile.mockReset().mockResolvedValue({ data: { user: LAURA } });
        updateProfile.mockReset();
        changePassword.mockReset();
    });

    test('keeps the session with the new token of the answer', async () => {
        // Arrange
        changePassword.mockResolvedValue({ data: { message: 'Password updated successfully', token: 'new-token' } });
        const user = userEvent.setup();
        renderProfile();
        await screen.findByDisplayValue('Laura Gómez');

        // Act
        await fillPasswords(user);
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeInTheDocument();
        expect(localStorage.getItem('token')).toBe('new-token');
        // The rest of the saved session is not touched
        expect(JSON.parse(localStorage.getItem('user'))).toEqual(LAURA);
    });

    test('the profile saved in the same click already goes with the new token', async () => {
        // Arrange: the token in the browser at the moment the profile is saved
        changePassword.mockResolvedValue({ data: { token: 'new-token' } });
        let tokenWhenProfileWasSaved;
        updateProfile.mockImplementation(async () => {
            tokenWhenProfileWasSaved = localStorage.getItem('token');
            return { data: { user: { ...LAURA, fullName: 'Laura Gómez Ríos' } } };
        });
        const user = userEvent.setup();
        renderProfile();
        await user.type(await screen.findByDisplayValue('Laura Gómez'), ' Ríos');

        // Act
        await fillPasswords(user);
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Contraseña actualizada correctamente.')).toBeInTheDocument();
        expect(tokenWhenProfileWasSaved).toBe('new-token');
    });

    test('a wrong current password keeps the token it had', async () => {
        // Arrange
        changePassword.mockRejectedValue({ response: { status: 401, data: { code: 'CURRENT_PASSWORD_INCORRECT' } } });
        const user = userEvent.setup();
        renderProfile();
        await screen.findByDisplayValue('Laura Gómez');

        // Act
        await fillPasswords(user);
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('La contraseña actual es incorrecta')).toBeInTheDocument();
        expect(localStorage.getItem('token')).toBe('old-token');
    });
});
