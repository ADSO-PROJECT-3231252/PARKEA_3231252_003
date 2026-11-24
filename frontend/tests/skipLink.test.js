import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Layout from '../src/components/Layout';
import { AuthProvider } from '../src/context/AuthContext';

// #311 (WCAG 2.4.1): a link before the header that jumps to the content
const renderLayout = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Routes>
                <Route element={<Layout />}>
                    <Route index element={<h1>Contenido de la pagina</h1>} />
                </Route>
            </Routes>
        </AuthProvider>
    </MemoryRouter>,
);

describe('Skip link "Saltar al contenido" (#311)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test('it is the first thing the Tab key reaches, before the header', async () => {
        // Arrange
        renderLayout();

        // Act
        await userEvent.setup().tab();

        // Assert
        expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Saltar al contenido' }));
    });

    test('it is also the first one when the visitor is signed in', async () => {
        // Arrange
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gomez', role: 'user' }));
        renderLayout();

        // Act
        await userEvent.setup().tab();

        // Assert
        expect(document.activeElement).toBe(screen.getByRole('link', { name: 'Saltar al contenido' }));
    });

    test('it points to the main, which can take the focus', () => {
        // Act
        renderLayout();

        // Assert
        const link = screen.getByRole('link', { name: 'Saltar al contenido' });
        const main = screen.getByRole('main');
        expect(link).toHaveAttribute('href', `#${main.id}`);
        expect(main.id).not.toBe('');
        expect(main).toHaveAttribute('tabindex', '-1');
    });

    test('it is hidden until it has the focus, and then it is shown', () => {
        // Act
        renderLayout();

        // Assert
        const link = screen.getByRole('link', { name: 'Saltar al contenido' });
        expect(link).toHaveClass('sr-only', 'focus:not-sr-only');
    });
});
