import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminZones from '../src/pages/AdminZones';
import AdminUsers from '../src/pages/AdminUsers';
import { AuthProvider } from '../src/context/AuthContext';
import { getAllZones } from '../src/services/zoneService';
import { getUsers, getUserLogs } from '../src/services/adminService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({ getAllZones: jest.fn(), toggleZone: jest.fn() }));
jest.mock('../src/services/adminService', () => ({
    getUsers: jest.fn(),
    getUserLogs: jest.fn(),
    changeUserRole: jest.fn(),
    changeUserStatus: jest.fn(),
}));

// #311 (WCAG 2.5.8, AUD-022): the on and off switches are at least 24 px high.
// In Tailwind h-6 is 1.5rem, 24 px; the old h-5 was 20 px.
const TOO_SMALL = ['h-5', 'h-4', 'h-3', 'h-2', 'h-1'];

// jsdom has no ResizeObserver, and "Gestión de usuarios" uses it
class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

describe('Size of the on and off switches (#311)', () => {
    beforeAll(() => {
        globalThis.ResizeObserver = FakeResizeObserver;
    });

    afterAll(() => {
        delete globalThis.ResizeObserver;
    });

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }));
    });

    test('the switch of each zone in "Gestión de zonas" is at least 24 px high', async () => {
        // Arrange
        const zone = { id: 'zone-1', name: 'Parqueadero Centro', address: 'Calle Cordoba # 4-20', availableSlots: 5, totalSlots: 10, hourlyRate: '3000.00', isActive: true, open24h: true, schedule: [] };
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [zone] } });

        // Act
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
        const switches = await screen.findAllByRole('switch', { name: 'Zona activa: Parqueadero Centro' });

        // Assert
        for (const control of switches) {
            expect(control).toHaveClass('h-6');
            for (const small of TOO_SMALL) expect(control).not.toHaveClass(small);
        }
    });

    test('the switch of each account in "Gestión de usuarios" is at least 24 px high', async () => {
        // Arrange
        const account = { id: 'user-9', fullName: 'Laura Gomez', email: 'laura@example.com', role: 'user', isActive: true, documentNumber: '1000000001' };
        getUsers.mockReset().mockResolvedValue({ data: { users: [account], pagination: { total: 1, totalPages: 1 }, summary: { total: 1, active: 1, inactive: 0, admins: 0 } } });
        getUserLogs.mockReset().mockResolvedValue({ data: { logs: [] } });

        // Act
        render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>);
        const switches = await screen.findAllByRole('switch', { name: 'Cuenta activa de Laura Gomez' });

        // Assert
        for (const control of switches) {
            expect(control).toHaveClass('h-6');
            for (const small of TOO_SMALL) expect(control).not.toHaveClass(small);
        }
    });
});
