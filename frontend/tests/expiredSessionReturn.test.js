import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import GuestRoute from '../src/routes/GuestRoute';
import ProtectedRoute from '../src/routes/ProtectedRoute';
import Login from '../src/pages/Login';
import AdminLogin from '../src/pages/AdminLogin';
import { login, loginAdmin } from '../src/services/authService';
import { saveExpiredSessionReturn, takeExpiredSessionReturn } from '../src/utils/expiredSessionReturn';

jest.mock('../src/services/authService', () => ({
    login: jest.fn(),
    loginAdmin: jest.fn(),
    resendVerification: jest.fn(),
}));
jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(() => Promise.resolve({ data: { user: { role: 'admin' } } })),
}));

const USER = { id: 'user-1', fullName: 'Cuenta de prueba', role: 'user' };
const OTHER_USER = { id: 'user-2', fullName: 'Otra cuenta', role: 'user' };
const ADMIN = { id: 'admin-1', fullName: 'Administrador', role: 'admin' };

function CurrentPath() {
    const { pathname, search } = useLocation();
    return <output aria-label="Ruta actual">{pathname + search}</output>;
}

// The routes as AppRoutes.jsx has them: /login inside GuestRoute
function renderAt(path) {
    render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <Routes>
                    <Route element={<GuestRoute />}>
                        <Route path="/login" element={<Login />} />
                        <Route path="/admin/login" element={<AdminLogin />} />
                    </Route>
                    <Route path="/" element={<h1>Inicio</h1>} />
                    <Route path="/vehicles" element={<ProtectedRoute role="user"><h1>Mis vehículos</h1></ProtectedRoute>} />
                    <Route path="/reservations" element={<ProtectedRoute role="user"><h1>Mis reservas</h1></ProtectedRoute>} />
                    <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><h1>Panel</h1></ProtectedRoute>} />
                    <Route path="/admin/zones" element={<ProtectedRoute role="admin"><h1>Gestión de zonas</h1></ProtectedRoute>} />
                </Routes>
                <CurrentPath />
            </AuthProvider>
        </MemoryRouter>,
    );
}

async function signInAs(account, service = login) {
    const user = userEvent.setup();
    service.mockResolvedValue({ data: { token: 'new-token', user: account } });
    await user.type(await screen.findByLabelText(/correo/i), 'cuenta@example.com');
    await user.type(screen.getByLabelText(/contraseña/i, { selector: 'input' }), 'Clave#123');
    await user.click(screen.getByRole('button', { name: /iniciar sesión/i }));
}

const saveReturn = (path, userId) => sessionStorage.setItem('expiredSessionReturnTo', JSON.stringify({ path, userId }));

afterEach(() => {
    localStorage.clear();
    sessionStorage.clear();
    jest.clearAllMocks();
});

describe('After signing in, the person goes back to the screen it was on (#307)', () => {
    test('a visitor sent to the login from a protected screen returns to it', async () => {
        // Arrange
        renderAt('/vehicles');
        expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();

        // Act
        await signInAs(USER);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();
        expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/vehicles$/);
    });

    test('after "Tu sesión expiró", the same account returns to the screen, with its filters', async () => {
        // Arrange
        saveReturn('/reservations?status=Pending', USER.id);
        renderAt('/login?expired=1');

        // Act
        await signInAs(USER);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Mis reservas' })).toBeInTheDocument();
        expect(screen.getByLabelText('Ruta actual')).toHaveTextContent(/^\/reservations\?status=Pending$/);
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });

    test('an administrator whose session expired returns to its admin screen', async () => {
        // Arrange
        saveReturn('/admin/zones', ADMIN.id);
        renderAt('/login?expired=1');

        // Act
        await signInAs(ADMIN);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Gestión de zonas' })).toBeInTheDocument();
    });

    test.each([
        [ADMIN.id, '/admin/zones', 'Gestión de zonas'],
        ['other-admin', '/admin/zones', 'Panel'],
        [ADMIN.id, '/vehicles', 'Panel'],
    ])('uses the admin form after expiry for %s returning from %s', async (owner, path, heading) => {
        saveReturn(path, owner);
        renderAt('/login?expired=1');
        await userEvent.click(await screen.findByRole('link', { name: /iniciar sesión como administrador/i }));
        await signInAs(ADMIN, loginAdmin);
        expect(await screen.findByRole('heading', { name: heading })).toBeInTheDocument();
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });

    test('another account that signs in on that tab starts on its home', async () => {
        // Arrange
        saveReturn('/reservations?status=Pending', USER.id);
        renderAt('/login?expired=1');

        // Act
        await signInAs(OTHER_USER);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });

    test('a sign-in that does not come from an expired session ignores an old saved screen', async () => {
        // Arrange
        saveReturn('/vehicles', USER.id);
        renderAt('/login');

        // Act
        await signInAs(USER);

        // Assert
        expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });
});

describe('The saved screen', () => {
    afterEach(() => {
        window.history.replaceState(null, '', '/');
    });

    test('keeps the path, the filters and the hash of the screen, with its account', () => {
        // Arrange
        window.history.replaceState(null, '', '/reservations?status=Pending&page=2#lista');

        // Act
        saveExpiredSessionReturn(USER.id);

        // Assert
        expect(takeExpiredSessionReturn(USER.id)).toBe('/reservations?status=Pending&page=2#lista');
        expect(takeExpiredSessionReturn(USER.id)).toBeNull();
    });

    test.each([
        ['another site', 'https://example.com/vehicles'],
        ['a path that starts with two slashes', '//example.com/vehicles'],
        ['a backslash that the browser reads as a slash', '/\\example.com/vehicles'],
        ['no path', ''],
    ])('%s is never used', (_label, path) => {
        // Arrange
        saveReturn(path, USER.id);

        // Act and assert
        expect(takeExpiredSessionReturn(USER.id)).toBeNull();
    });

    test('a value that is not what this tab saved is ignored', () => {
        // Arrange
        sessionStorage.setItem('expiredSessionReturnTo', '/vehicles');

        // Act and assert
        expect(takeExpiredSessionReturn(USER.id)).toBeNull();
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });
});

// api.js saves the screen when a request answers that the session expired
describe('Ending the session', () => {
    let endSession;

    beforeEach(async () => {
        // A new copy of api.js for each test: it redirects only once per page
        await jest.isolateModulesAsync(async () => {
            ({ endSession } = await import('../src/services/api'));
        });
        localStorage.setItem('token', 'old-token');
        localStorage.setItem('user', JSON.stringify(USER));
        window.history.replaceState(null, '', '/reservations?status=Pending');
        // jsdom cannot open another page: the redirect is only written in the console
        jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        console.error.mockRestore();
        window.history.replaceState(null, '', '/');
    });

    test('an expired session saves the screen with the account it belonged to, and clears the session', () => {
        // Act
        endSession('expired');

        // Assert
        expect(JSON.parse(sessionStorage.getItem('expiredSessionReturnTo'))).toEqual({ path: '/reservations?status=Pending', userId: USER.id });
        expect(localStorage.getItem('token')).toBeNull();
        expect(localStorage.getItem('user')).toBeNull();
    });

    test.each(['deactivated', 'roleChanged'])('a session ended because the account was %s saves no screen', (reason) => {
        // Act
        endSession(reason);

        // Assert
        expect(sessionStorage.getItem('expiredSessionReturnTo')).toBeNull();
    });
});

