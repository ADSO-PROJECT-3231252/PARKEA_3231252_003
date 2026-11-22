import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import AppRoutes from '../src/routes/AppRoutes';

jest.mock('../src/pages/Login', () => ({ __esModule: true, default: () => 'Page Login' }));
jest.mock('../src/pages/Register', () => ({ __esModule: true, default: () => 'Page Register' }));
jest.mock('../src/pages/AdminLogin', () => ({ __esModule: true, default: () => 'Page AdminLogin' }));
jest.mock('../src/pages/ForgotPassword', () => ({ __esModule: true, default: () => 'Page ForgotPassword' }));
jest.mock('../src/pages/Home', () => ({ __esModule: true, default: () => 'Page Home' }));

jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(() => Promise.resolve({ data: { user: { role: 'admin' } } })),
}));

const guestRoutes = [
    ['/login', 'Page Login'],
    ['/register', 'Page Register'],
    ['/admin/login', 'Page AdminLogin'],
    ['/forgot-password', 'Page ForgotPassword'],
];

function CurrentPath() {
    const { pathname } = useLocation();
    return <output aria-label="Ruta actual">{pathname}</output>;
}

function renderAt(path, role) {
    if (role) {
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'account-1', role, fullName: 'Cuenta de prueba' }));
    }

    render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <AppRoutes />
                <CurrentPath />
            </AuthProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    localStorage.clear();
});

describe.each(guestRoutes)('guest route %s', (path, page) => {
    test('a visitor can open the form', async () => {
        renderAt(path);

        expect(await screen.findByText(page)).toBeInTheDocument();
        expect(screen.getByLabelText('Ruta actual').textContent).toBe(path);
    });

    test.each([
        ['user', '/'],
        ['admin', '/admin/dashboard'],
    ])('a signed-in %s is redirected to %s', async (role, destination) => {
        renderAt(path, role);

        expect(await screen.findByText('Page Home')).toBeInTheDocument();
        expect(screen.getByLabelText('Ruta actual').textContent).toBe(destination);
        expect(screen.queryByText(page)).not.toBeInTheDocument();
    });
});
