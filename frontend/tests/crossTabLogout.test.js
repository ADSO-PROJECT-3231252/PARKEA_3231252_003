import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { AuthProvider } from '../src/context/AuthContext';
import ProtectedRoute from '../src/routes/ProtectedRoute';

afterEach(() => {
    localStorage.clear();
});

test('redirects an open protected page to login when another tab signs out', async () => {
    const token = 'test-token';
    const user = JSON.stringify({ id: 'user-1', role: 'user' });
    localStorage.setItem('token', token);
    localStorage.setItem('user', user);

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

    expect(await screen.findByRole('heading', { name: 'Mis vehículos' })).toBeInTheDocument();

    act(() => {
        // The other tab removes both entries before this tab receives the events.
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        for (const [key, oldValue] of [['token', token], ['user', user]]) {
            window.dispatchEvent(new StorageEvent('storage', {
                key,
                oldValue,
                newValue: null,
                storageArea: localStorage,
            }));
        }
    });

    expect(await screen.findByRole('heading', { name: 'Iniciar sesión' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Mis vehículos' })).not.toBeInTheDocument();
});
