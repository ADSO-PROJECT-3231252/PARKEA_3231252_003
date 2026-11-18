import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Login from '../src/pages/Login';
import AdminLogin from '../src/pages/AdminLogin';
import Register from '../src/pages/Register';
import ForgotPassword from '../src/pages/ForgotPassword';
import ResetPassword from '../src/pages/ResetPassword';
import ResendVerification from '../src/pages/ResendVerification';
import Profile from '../src/pages/Profile';
import { AuthProvider } from '../src/context/AuthContext';
import { getProfile } from '../src/services/userService';

// The screens do not call the real API
jest.mock('../src/services/authService');
jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
}));

const LAURA = { id: 'user-laura', fullName: 'Laura Gómez', email: 'laura@correo.test', phone: '3001234567', role: 'user' };

const renderAt = (screenElement, path = '/') =>
    render(<MemoryRouter initialEntries={[path]}><AuthProvider>{screenElement}</AuthProvider></MemoryRouter>);

// [id of the field, autocomplete, required]
const fieldsOf = (id) => {
    const field = document.getElementById(id);
    return [id, field.getAttribute('autocomplete'), field.getAttribute('aria-required')];
};

// #310 (WCAG 1.3.5 and 4.1.2): the password manager can fill the account forms
// and a screen reader says which fields are required
describe('Account forms: autocomplete and required fields (#310)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test.each([
        ['Login', <Login />, '/login', [['email', 'username', 'true'], ['password', 'current-password', 'true']]],
        ['AdminLogin', <AdminLogin />, '/admin/login', [['email', 'username', 'true'], ['password', 'current-password', 'true']]],
        ['Register', <Register />, '/register', [
            ['documentNumber', null, 'true'],
            ['fullName', 'name', 'true'],
            ['email', 'email', 'true'],
            ['password', 'new-password', 'true'],
            ['confirmPassword', 'new-password', 'true'],
            ['phone', 'tel', 'true'],
        ]],
        ['ForgotPassword', <ForgotPassword />, '/forgot-password', [['email', 'email', 'true']]],
        ['ResetPassword', <ResetPassword />, '/reset-password?token=abc', [['newPassword', 'new-password', 'true'], ['confirmNewPassword', 'new-password', 'true']]],
        ['ResendVerification', <ResendVerification />, '/verify-email/resend', [['email', 'email', 'true']]],
    ])('%s', (_name, screenElement, path, expected) => {
        // Act
        renderAt(screenElement, path);

        // Assert
        expect(expected.map(([id]) => fieldsOf(id))).toEqual(expected);
    });

    test('Mi perfil', async () => {
        // Arrange
        localStorage.setItem('token', 'token');
        localStorage.setItem('user', JSON.stringify(LAURA));
        getProfile.mockResolvedValue({ data: { user: LAURA } });

        // Act
        renderAt(<Profile />, '/profile');
        await screen.findByDisplayValue('Laura Gómez');

        // Assert: the password fields are only needed to change the password
        expect(['fullName', 'phone', 'currentPassword', 'newPassword', 'confirmNewPassword'].map(fieldsOf)).toEqual([
            ['fullName', 'name', 'true'],
            ['phone', 'tel', 'true'],
            ['currentPassword', 'current-password', null],
            ['newPassword', 'new-password', null],
            ['confirmNewPassword', 'new-password', null],
        ]);
    });
});
