import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AppRoutes from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/context/AuthContext';

// The file of these pages can't be downloaded: the connection dropped, or a
// new version was published and the old file is gone (#200)
jest.mock('../src/pages/Zones', () => {
    throw new Error('Failed to fetch dynamically imported module');
});
jest.mock('../src/pages/Login', () => {
    throw new Error('Failed to fetch dynamically imported module');
});

const renderAt = (path) =>
    render(
        <MemoryRouter initialEntries={[path]}>
            <AuthProvider>
                <AppRoutes />
            </AuthProvider>
        </MemoryRouter>,
    );

describe('A page whose file cannot be downloaded (#200)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('a page with the Header shows the message and keeps the Header', async () => {
        // Act
        renderAt('/zones');

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar esta página');
        expect(screen.getByRole('button', { name: 'Reintentar' })).toBeInTheDocument();
        expect(screen.getByRole('banner')).toBeInTheDocument();
    });

    test('a page without the Header shows the message inside its own main', async () => {
        // Act
        renderAt('/login');

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar esta página');
        expect(screen.getByRole('main')).toContainElement(screen.getByRole('alert'));
    });
});
