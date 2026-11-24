import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import ProtectedRoute from '../src/routes/ProtectedRoute';
import GuestRoute from '../src/routes/GuestRoute';
import { useAuth } from '../src/hooks/useAuth';

const TOKEN = 'test-token';
const USER = JSON.stringify({ id: 'user-1', role: 'user' });

function renderVehicles() {
    localStorage.setItem('token', TOKEN);
    localStorage.setItem('user', USER);
    render(
        <MemoryRouter initialEntries={['/vehicles']}>
            <AuthProvider>
                <Routes>
                    <Route
                        path="/vehicles"
                        element={
                            <ProtectedRoute role="user">
                                <h1>Mis vehículos</h1>
                            </ProtectedRoute>
                        }
                    />
                    <Route path="/login" element={<h1>Iniciar sesión</h1>} />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );
}

// What the browser sends to this tab when another tab changes the storage
function storageEvent(key, oldValue, newValue) {
    window.dispatchEvent(new StorageEvent('storage', { key, oldValue, newValue, storageArea: localStorage }));
}

afterEach(() => {
    localStorage.clear();
});

test('redirects an open protected page to login when another tab signs out', async () => {
    renderVehicles();
    expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();

    act(() => {
        // The other tab removes both entries before this tab receives the events.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        storageEvent('token', TOKEN, null);
        storageEvent('user', USER, null);
    });

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis vehículos' })).not.toBeInTheDocument();
});

test('redirects to login when another tab clears the whole storage', async () => {
    renderVehicles();
    expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();

    act(() => {
        // localStorage.clear() sends one event with no key
        localStorage.clear();
        storageEvent(null, null, null);
    });

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
});

test('keeps the page when the events arrive after another tab already signed in again', async () => {
    renderVehicles();
    expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();

    act(() => {
        // The other tab signed out and in again before this tab read the events
        localStorage.setItem('token', 'new-token');
        storageEvent('token', TOKEN, null);
        storageEvent('token', null, 'new-token');
    });

    expect(screen.getByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Iniciar sesión' })).not.toBeInTheDocument();
});

function WhoIsSignedIn() {
    const { user } = useAuth();
    return <p>{user?.fullName}</p>;
}

test('a tab that shows the login follows a session started in another tab, without clearing it halfway', async () => {
    // Arrange
    render(
        <MemoryRouter initialEntries={['/login']}>
            <AuthProvider>
                <Routes>
                    <Route element={<GuestRoute />}>
                        <Route path="/login" element={<h1>Iniciar sesión</h1>} />
                    </Route>
                    <Route path="/" element={<h1>Inicio</h1>} />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );
    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();

    // Act: the other tab saves the token first and the user after it
    act(() => {
        localStorage.setItem('token', 'token-pedro');
        storageEvent('token', null, 'token-pedro');
    });

    // Assert: half a session is not cleared, because the other tab is still saving it
    expect(localStorage.getItem('token')).toBe('token-pedro');

    // Act
    act(() => {
        const pedro = JSON.stringify({ id: 'user-2', role: 'user', fullName: 'Pedro Ruiz' });
        localStorage.setItem('user', pedro);
        storageEvent('user', null, pedro);
    });

    // Assert
    expect(await screen.findByRole('heading', { name: 'Inicio' })).toBeInTheDocument();
});

test('a signed-in tab follows the account signed in by another tab, so it never shows one account with the token of another', async () => {
    // Arrange
    localStorage.setItem('token', 'token-laura');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1', role: 'user', fullName: 'Laura Gómez' }));
    render(
        <MemoryRouter initialEntries={['/vehicles']}>
            <AuthProvider>
                <Routes>
                    <Route
                        path="/vehicles"
                        element={
                            <ProtectedRoute role="user">
                                <WhoIsSignedIn />
                            </ProtectedRoute>
                        }
                    />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );
    expect(await screen.findByText('Laura Gómez')).toBeInTheDocument();

    // Act
    act(() => {
        const pedro = JSON.stringify({ id: 'user-2', role: 'user', fullName: 'Pedro Ruiz' });
        localStorage.setItem('token', 'token-pedro');
        storageEvent('token', 'token-laura', 'token-pedro');
        localStorage.setItem('user', pedro);
        storageEvent('user', null, pedro);
    });

    // Assert
    expect(await screen.findByText('Pedro Ruiz')).toBeInTheDocument();
    expect(screen.queryByText('Laura Gómez')).not.toBeInTheDocument();
});
