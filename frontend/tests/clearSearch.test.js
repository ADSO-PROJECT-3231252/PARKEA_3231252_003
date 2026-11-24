import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import AdminZones from '../src/pages/AdminZones';
import AdminUsers from '../src/pages/AdminUsers';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones, getAllZones } from '../src/services/zoneService';
import { getUsers, getUserLogs } from '../src/services/adminService';

// The lists do not call the real API
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn(), getAllZones: jest.fn(), toggleZone: jest.fn() }));
jest.mock('../src/services/adminService', () => ({
    getUsers: jest.fn(),
    getUserLogs: jest.fn(),
    changeUserRole: jest.fn(),
    changeUserStatus: jest.fn(),
}));

class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const CENTRO = {
    id: 'zone-centro', name: 'Parqueadero Centro', address: 'Calle 1 # 2-3', availableSlots: 5, totalSlots: 10,
    activeReservations: 0, hourlyRate: '3000.00', isActive: true, open24h: true, schedule: [],
};
const LAURA = {
    id: 'user-9', fullName: 'Laura Gomez', email: 'laura@example.com', role: 'user', isActive: true,
    documentNumber: '1000000001', reservationCount: 0, createdAt: '2026-11-01T12:00:00.000Z',
};

beforeAll(() => {
    globalThis.ResizeObserver = FakeResizeObserver;
});

afterAll(() => {
    delete globalThis.ResizeObserver;
});

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }));
    getZones.mockResolvedValue({ data: { zones: [CENTRO] } });
    getAllZones.mockResolvedValue({ data: { zones: [CENTRO] } });
    getUsers.mockResolvedValue({
        data: { users: [LAURA], pagination: { total: 1, totalPages: 1 }, summary: { total: 1, active: 1, inactive: 0, admins: 0 } },
    });
    getUserLogs.mockResolvedValue({ data: { logs: [] } });
});

// #311: the × that clears a search is a 24 px target, and as it disappears with
// the text, the focus goes back to the search box instead of being lost
describe.each([
    ['Zonas', () => render(<MemoryRouter><AuthProvider><Zones /></AuthProvider></MemoryRouter>), 'Buscar zonas por nombre', 'Parqueadero Centro'],
    ['Gestión de zonas', () => render(<MemoryRouter><AdminZones /></MemoryRouter>), 'Buscar zona por nombre o dirección', 'Parqueadero Centro'],
    ['Gestión de usuarios', () => render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>), 'Buscar por nombre, correo o documento', 'Laura Gomez'],
])('Clearing the search of "%s" (#311)', (screenName, renderList, searchLabel, item) => {
    test('the × is 24 px and sends the focus back to the search box', async () => {
        // Arrange
        const user = userEvent.setup();
        renderList();
        await screen.findAllByText(item);
        const search = screen.getByLabelText(searchLabel);
        await user.type(search, 'centro');
        const clear = screen.getByRole('button', { name: 'Limpiar búsqueda' });
        expect(clear).toHaveClass('size-6');

        // Act
        await user.click(clear);

        // Assert
        expect(search).toHaveValue('');
        expect(search).toHaveFocus();
    });
});

describe('"Limpiar filtros" of "Gestión de usuarios" (#311)', () => {
    test('keeps the focus once the filters are clear', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>);
        await screen.findAllByText('Laura Gomez');
        await user.type(screen.getByLabelText('Buscar por nombre, correo o documento'), 'laura');
        const button = screen.getByRole('button', { name: 'Limpiar filtros' });
        button.focus();

        // Act
        await user.keyboard('{Enter}');

        // Assert
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).not.toBeDisabled();
        expect(button).toHaveFocus();
    });
});
