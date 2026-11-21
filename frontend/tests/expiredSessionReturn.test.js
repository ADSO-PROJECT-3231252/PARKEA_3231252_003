import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import Login from '../src/pages/Login';
import { login } from '../src/services/authService';

jest.mock('../src/services/authService', () => ({
    login: jest.fn(),
    resendVerification: jest.fn(),
}));

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.resetAllMocks();
});

test('returns to the previous page after signing in again following session expiry', async () => {
    const user = userEvent.setup();
    sessionStorage.setItem('expiredSessionReturnTo', '/vehicles');
    login.mockResolvedValue({
        data: {
            token: 'new-token',
            user: { id: 'user-1', fullName: 'Cuenta de prueba', role: 'user' },
        },
    });

    render(
        <MemoryRouter initialEntries={['/login?expired=1']}>
            <AuthProvider>
                <Routes>
                    <Route path="/login" element={<Login />} />
                    <Route path="/" element={<h1>Inicio</h1>} />
                    <Route path="/vehicles" element={<h1>Mis vehículos</h1>} />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );

    await user.type(screen.getByLabelText(/correo/i), 'usuario@example.com');
    await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));

    expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();
    expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
});
