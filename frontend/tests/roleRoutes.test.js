import { render, screen } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import AppRoutes from '../src/routes/AppRoutes';
import { AuthProvider } from '../src/context/AuthContext';

// #316: the screens of users are not for administrators, and the screens of
// administrators are not for users. Each page is replaced by its name, so the
// test sees which one is shown and makes no request to the API.
jest.mock('../src/pages/Home', () => ({ __esModule: true, default: () => 'Page Home' }));
jest.mock('../src/pages/Zones', () => ({ __esModule: true, default: () => 'Page Zones' }));
jest.mock('../src/pages/Login', () => ({ __esModule: true, default: () => 'Page Login' }));
jest.mock('../src/pages/Profile', () => ({ __esModule: true, default: () => 'Page Profile' }));
jest.mock('../src/pages/VehicleList', () => ({ __esModule: true, default: () => 'Page VehicleList' }));
jest.mock('../src/pages/RegisterVehicle', () => ({ __esModule: true, default: () => 'Page RegisterVehicle' }));
jest.mock('../src/pages/EditVehicle', () => ({ __esModule: true, default: () => 'Page EditVehicle' }));
jest.mock('../src/pages/ReserveSpot', () => ({ __esModule: true, default: () => 'Page ReserveSpot' }));
jest.mock('../src/pages/Reservations', () => ({ __esModule: true, default: () => 'Page Reservations' }));
jest.mock('../src/pages/ReservationConfirmation', () => ({ __esModule: true, default: () => 'Page ReservationConfirmation' }));
jest.mock('../src/pages/PayReservation', () => ({ __esModule: true, default: () => 'Page PayReservation' }));
jest.mock('../src/pages/AdminZones', () => ({ __esModule: true, default: () => 'Page AdminZones' }));

// The admin screens ask the API for the current role (DEF-010)
jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(() => Promise.resolve({ data: { user: { role: 'admin' } } })),
}));

// Shows the address the router ended on
function CurrentPath() {
    const location = useLocation();
    return <output aria-label="Dirección">{location.pathname}</output>;
}

function renderAt(path, role) {
    localStorage.clear();
    if (role) {
        localStorage.setItem('token', 'a-token');
        localStorage.setItem('user', JSON.stringify({ id: 'account-1', fullName: 'Cuenta de prueba', role }));
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

const currentPath = () => screen.getByRole('status', { name: 'Dirección' });

const USER_SCREENS = [
    ['/vehicles', 'VehicleList'],
    ['/vehicles/new', 'RegisterVehicle'],
    ['/vehicles/v-1/edit', 'EditVehicle'],
    ['/reserve/z-1', 'ReserveSpot'],
    ['/reservations', 'Reservations'],
    ['/reservations/r-1', 'ReservationConfirmation'],
    ['/reservations/r-1/payment', 'PayReservation'],
];

describe('The screens of users (#316)', () => {
    test.each(USER_SCREENS)('an administrator on %s goes to its dashboard', async (path, page) => {
        // Act
        renderAt(path, 'admin');

        // Assert
        expect(await screen.findByText('Page Home')).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(/^\/admin\/dashboard$/);
        expect(screen.queryByText(`Page ${page}`)).not.toBeInTheDocument();
    });

    test.each(USER_SCREENS)('a user opens %s', async (path, page) => {
        // Act
        renderAt(path, 'user');

        // Assert
        expect(await screen.findByText(`Page ${page}`)).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(path);
    });

    test('a visitor on a screen of users goes to the sign-in', async () => {
        // Act
        renderAt('/reservations', null);

        // Assert
        expect(await screen.findByText('Page Login')).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(/^\/login$/);
    });

    test.each(['admin', 'user'])('the profile is open to an account with the role %s', async (role) => {
        // Act
        renderAt('/profile', role);

        // Assert
        expect(await screen.findByText('Page Profile')).toBeInTheDocument();
    });
});

describe('The zones list (#316)', () => {
    test('an administrator goes to its own list of zones', async () => {
        // Act
        renderAt('/zones', 'admin');

        // Assert
        expect(await screen.findByText('Page AdminZones')).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(/^\/admin\/zones$/);
        expect(screen.queryByText('Page Zones')).not.toBeInTheDocument();
    });

    test.each([['a visitor', null], ['a user', 'user']])('%s sees it', async (_label, role) => {
        // Act
        renderAt('/zones', role);

        // Assert
        expect(await screen.findByText('Page Zones')).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(/^\/zones$/);
    });
});

describe('The screens of administrators (#316)', () => {
    test('a user on an admin screen goes to the home page', async () => {
        // Act
        renderAt('/admin/zones', 'user');

        // Assert
        expect(await screen.findByText('Page Home')).toBeInTheDocument();
        expect(currentPath()).toHaveTextContent(/^\/$/);
        expect(screen.queryByText('Page AdminZones')).not.toBeInTheDocument();
    });
});
