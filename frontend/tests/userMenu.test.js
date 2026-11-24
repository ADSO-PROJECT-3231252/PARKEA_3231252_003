import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Header from '../src/components/Header';
import { AuthProvider } from '../src/context/AuthContext';

// #311 (WCAG 2.5.3, Label in Name): the accessible name of the user menu button
// contains the initials it shows, so a person using voice control can say them
const renderHeaderOf = (user) => {
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify(user));
    render(<MemoryRouter><AuthProvider><Header /></AuthProvider></MemoryRouter>);
    return screen.getByRole('button', { name: /abrir menú de usuario/i });
};

describe('Name of the user menu button (#311)', () => {
    beforeEach(() => {
        localStorage.clear();
    });

    test.each([
        ['a user with two names', { id: 'user-1', fullName: 'Laura Gomez', role: 'user' }, 'LG'],
        ['a user with four names', { id: 'user-2', fullName: 'Juan Carlos Perez Lopez', role: 'user' }, 'JC'],
        ['an administrator', { id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }, 'AP'],
    ])('the name of the button of %s contains the initials it shows (%s)', (_who, user, initials) => {
        // Act
        const button = renderHeaderOf(user);

        // Assert
        expect(button).toHaveTextContent(initials);
        expect(button).toHaveAccessibleName(`${initials}, abrir menú de usuario`);
        expect(button.getAttribute('aria-label')).toContain(button.textContent);
    });

    test('it still says that it opens the user menu', () => {
        // Act
        const button = renderHeaderOf({ id: 'user-1', fullName: 'Laura Gomez', role: 'user' });

        // Assert
        expect(button).toHaveAttribute('aria-haspopup', 'true');
        expect(button).toHaveAttribute('aria-expanded', 'false');
    });
});
