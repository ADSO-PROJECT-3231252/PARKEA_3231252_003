import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route, Link, useNavigate } from 'react-router-dom';
import App from '../src/App';
import ErrorBoundary from '../src/components/ErrorBoundary';
import { AuthProvider } from '../src/context/AuthContext';

// For the test of the whole app: the zones list fails while it renders, and
// the home page is replaced by its name
jest.mock('../src/pages/Zones', () => ({
    __esModule: true,
    default: () => {
        throw new Error('The zones list got data with a shape it does not expect');
    },
}));
jest.mock('../src/pages/Home', () => ({ __esModule: true, default: () => 'Page Home' }));

// #315: a page that fails while it renders shows "Algo salió mal" instead of
// a blank page, and the next page renders normally.
let homeFails;

function BrokenPage() {
    throw new Error('The page got data with a shape it does not expect');
}

function HomePage() {
    if (homeFails) throw new Error('The home page failed');
    return <p>Página de inicio</p>;
}

// Outside the boundary, like the back button of the browser and a link of
// another page
function Navigation() {
    const navigate = useNavigate();
    return (
        <>
            <button type="button" onClick={() => navigate(-1)}>
                Atrás del navegador
            </button>
            <Link to="/broken">Abrir la página que falla</Link>
        </>
    );
}

// entries: the addresses visited, the last one is the current one
function renderAt(entries, role) {
    localStorage.clear();
    if (role) {
        localStorage.setItem('token', 'a-token');
        localStorage.setItem('user', JSON.stringify({ id: 'account-1', fullName: 'Cuenta de prueba', role }));
    }
    render(
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <AuthProvider>
                <Navigation />
                <ErrorBoundary>
                    <Routes>
                        <Route path="/" element={<HomePage />} />
                        <Route path="/admin/dashboard" element={<p>Inicio del administrador</p>} />
                        <Route path="/zones" element={<p>Lista de zonas</p>} />
                        <Route path="/broken" element={<BrokenPage />} />
                    </Routes>
                </ErrorBoundary>
            </AuthProvider>
        </MemoryRouter>,
    );
}

const errorHeading = () => screen.queryByRole('heading', { name: 'Algo salió mal' });

beforeEach(() => {
    homeFails = false;
    // React writes every error it catches in the console
    jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('The error screen (#315)', () => {
    test('a page that fails while it renders shows the error screen instead of a blank page', async () => {
        // Act
        renderAt(['/broken']);

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Algo salió mal');
        expect(screen.getByRole('main')).toContainElement(screen.getByRole('alert'));
        expect(screen.getByRole('button', { name: 'Recargar' })).toHaveAttribute('type', 'button');
        expect(screen.getByRole('link', { name: 'Volver al inicio' })).toHaveAttribute('href', '/');
        expect(document.title).toBe('Algo salió mal | PARKEA');
        expect(console.error).toHaveBeenCalled();
    });

    test('"Volver al inicio" opens the home page, which renders normally', async () => {
        // Arrange
        const user = userEvent.setup();
        renderAt(['/broken']);

        // Act
        await user.click(await screen.findByRole('link', { name: 'Volver al inicio' }));

        // Assert
        expect(await screen.findByText('Página de inicio')).toBeInTheDocument();
        expect(errorHeading()).not.toBeInTheDocument();
    });

    test('it also goes away when the page that failed was the home page itself', async () => {
        // Arrange: the home page fails once, and works the next time
        const user = userEvent.setup();
        homeFails = true;
        renderAt(['/']);
        await screen.findByRole('heading', { name: 'Algo salió mal' });
        homeFails = false;

        // Act
        await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));

        // Assert
        expect(await screen.findByText('Página de inicio')).toBeInTheDocument();
        expect(errorHeading()).not.toBeInTheDocument();
    });

    test('the back button of the browser leaves the error screen', async () => {
        // Arrange
        const user = userEvent.setup();
        renderAt(['/zones', '/broken']);
        await screen.findByRole('heading', { name: 'Algo salió mal' });

        // Act
        await user.click(screen.getByRole('button', { name: 'Atrás del navegador' }));

        // Assert
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
        expect(errorHeading()).not.toBeInTheDocument();
    });

    test('an administrator goes back to its own home page', async () => {
        // Arrange
        const user = userEvent.setup();
        renderAt(['/broken'], 'admin');
        const link = await screen.findByRole('link', { name: 'Volver al inicio' });

        // Act
        await user.click(link);

        // Assert
        expect(link).toHaveAttribute('href', '/admin/dashboard');
        expect(await screen.findByText('Inicio del administrador')).toBeInTheDocument();
    });

    test('a page opened from another one fails only once: the screen does not render it again by itself', async () => {
        // Arrange
        const user = userEvent.setup();
        renderAt(['/zones']);
        await screen.findByText('Lista de zonas');

        // Act
        await user.click(screen.getByRole('link', { name: 'Abrir la página que falla' }));

        // Assert: React writes each error it catches once
        expect(await screen.findByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
        expect(console.error).toHaveBeenCalledTimes(1);
    });

    test('a page that works is shown as it is', async () => {
        // Act
        renderAt(['/zones']);

        // Assert
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
        expect(errorHeading()).not.toBeInTheDocument();
        expect(console.error).not.toHaveBeenCalled();
    });
});

describe('The error screen in the app (#315)', () => {
    afterEach(() => {
        window.history.pushState({}, '', '/');
    });

    test('a page of the app that fails shows the screen, without the Header, and "Volver al inicio" works', async () => {
        // Arrange
        const user = userEvent.setup();
        localStorage.clear();
        window.history.pushState({}, '', '/zones');
        render(<App />);

        // Act
        expect(await screen.findByRole('heading', { name: 'Algo salió mal' })).toBeInTheDocument();
        expect(screen.queryByRole('banner')).not.toBeInTheDocument();
        await user.click(screen.getByRole('link', { name: 'Volver al inicio' }));

        // Assert
        expect(await screen.findByText('Page Home')).toBeInTheDocument();
        expect(window.location.pathname).toBe('/');
        expect(errorHeading()).not.toBeInTheDocument();
    });
});
