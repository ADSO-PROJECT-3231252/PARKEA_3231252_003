import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import VehicleList from '../src/pages/VehicleList';
import AdminZones from '../src/pages/AdminZones';
import AdminUsers from '../src/pages/AdminUsers';
import Reservations from '../src/pages/Reservations';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones, getAllZones } from '../src/services/zoneService';
import { getVehicles } from '../src/services/vehicleService';
import { getUsers, getUserLogs } from '../src/services/adminService';
import { getReservations } from '../src/services/reservationService';

// The lists do not call the real API
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn(), getAllZones: jest.fn(), toggleZone: jest.fn() }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn(), setDefaultVehicle: jest.fn(), deleteVehicle: jest.fn() }));
jest.mock('../src/services/adminService', () => ({
    getUsers: jest.fn(),
    getUserLogs: jest.fn(),
    changeUserRole: jest.fn(),
    changeUserStatus: jest.fn(),
}));
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn(), cancelReservation: jest.fn() }));

class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

const HOUR = 60 * 60 * 1000;
const range = (count, make) => Array.from({ length: count }, (_, i) => make(i + 1));

const zone = (n) => ({
    id: `zone-${n}`,
    name: `Zona ${String(n).padStart(2, '0')}`,
    address: `Calle ${n} # 1-2`,
    availableSlots: 5,
    totalSlots: 10,
    activeReservations: 0,
    hourlyRate: '3000.00',
    isActive: true,
    open24h: true,
    schedule: [],
});

const vehicle = (n) => ({
    id: n,
    plate: `ABC${String(100 + n)}`,
    brand: 'Mazda',
    model: '3',
    color: 'Gris',
    vehicleType: 'car',
    isDefault: n === 1,
});

const account = (n) => ({
    id: `user-${n}`,
    fullName: `Usuario ${n}`,
    email: `usuario${n}@example.com`,
    role: 'user',
    isActive: true,
    documentNumber: `10000000${n}`,
    reservationCount: 0,
    createdAt: '2026-11-01T12:00:00.000Z',
});

const reservation = (n) => ({
    id: `reservation-${n}`,
    status: 'Active',
    spotNumber: 4,
    startTime: new Date(Date.now() + 2 * HOUR).toISOString(),
    endTime: new Date(Date.now() + 4 * HOUR).toISOString(),
    openEnded: false,
    openStay: null,
    zone: { id: 'zone-1', name: `Zona ${n}`, address: 'Calle 1 # 2-3' },
    vehicle: { id: 'vehicle-1', plate: 'ABC123', brand: 'Mazda', model: '2', color: 'Gris' },
    amount: 4000,
    amountType: 'paid',
    extensions: 0,
    appliedHourlyRate: 2000,
    paymentStatus: 'Paid',
    holdExpiresAt: null,
});

// Two pages of 10: the API answers the page that was asked
const twoPages = (make) => ({ page }) => Promise.resolve({
    data: {
        users: range(10, (n) => make(n + (page - 1) * 10)),
        reservations: range(10, (n) => make(n + (page - 1) * 10)),
        pagination: { page, limit: 10, total: 20, totalPages: 2 },
        summary: { total: 20, active: 20, inactive: 0, admins: 0 },
    },
});

beforeAll(() => {
    globalThis.ResizeObserver = FakeResizeObserver;
});

afterAll(() => {
    delete globalThis.ResizeObserver;
});

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
});

// #311: "Anterior" and "Siguiente" are aria-disabled, not disabled, on the
// first and the last page, so pressing Enter on them never loses the focus
describe.each([
    ['Zonas', () => {
        getZones.mockResolvedValue({ data: { zones: range(10, zone) } });
        render(<MemoryRouter><AuthProvider><Zones /></AuthProvider></MemoryRouter>);
    }, 'Zona 01', /siguiente/i, /anterior/i],
    ['Mis vehículos', () => {
        getVehicles.mockResolvedValue({ data: { vehicles: range(10, vehicle) } });
        render(<MemoryRouter><VehicleList /></MemoryRouter>);
    }, 'ABC101', /siguiente/i, /anterior/i],
    ['Gestión de zonas', () => {
        getAllZones.mockResolvedValue({ data: { zones: range(11, zone) } });
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
    }, 'Zona 01', 'Siguiente', 'Anterior'],
])('The pages of "%s" keep the focus (#311)', (screenName, renderList, firstItem, next, previous) => {
    test('Siguiente on the last page and Anterior on the first one keep the focus', async () => {
        // Arrange
        const user = userEvent.setup();
        renderList();
        await screen.findAllByText(firstItem);
        const nextButton = screen.getByRole('button', { name: next });
        const previousButton = screen.getByRole('button', { name: previous });
        expect(previousButton).toHaveAttribute('aria-disabled', 'true');

        // Act: to the last page and back to the first one, with Enter
        nextButton.focus();
        await user.keyboard('{Enter}');

        // Assert
        expect(nextButton).toHaveAttribute('aria-disabled', 'true');
        expect(nextButton).toHaveFocus();

        // Act
        previousButton.focus();
        await user.keyboard('{Enter}');

        // Assert
        expect(previousButton).toHaveAttribute('aria-disabled', 'true');
        expect(previousButton).not.toBeDisabled();
        expect(previousButton).toHaveFocus();
        expect(screen.getAllByText(firstItem).length).toBeGreaterThan(0);

        // Act: Enter again, now on the first page
        await user.keyboard('{Enter}');

        // Assert: the first page stays, with the focus on Anterior
        expect(screen.getAllByText(firstItem).length).toBeGreaterThan(0);
        expect(previousButton).toHaveFocus();
    });
});

// #311: the lists that load each page from the API send the focus to
// "Mostrando…", so the reader hears the new range once
describe('The focus goes to "Mostrando…" after a page change (#311)', () => {
    test('Gestión de usuarios', async () => {
        // Arrange
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }));
        getUsers.mockImplementation(twoPages(account));
        getUserLogs.mockResolvedValue({ data: { logs: [] } });
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>);
        await screen.findByText('Mostrando 1 a 10 de 20 usuarios');

        // Act
        await user.click(screen.getByRole('button', { name: 'Página siguiente' }));

        // Assert
        expect(await screen.findByText('Mostrando 11 a 20 de 20 usuarios')).toHaveFocus();

        // Act: "Limpiar filtros" has nothing to clear, so it asks for nothing
        const callsOnSecondPage = getUsers.mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Limpiar filtros' }));

        // Assert: still the second page
        expect(getUsers).toHaveBeenCalledTimes(callsOnSecondPage);

        // Act
        await user.click(screen.getByRole('button', { name: 'Página anterior' }));

        // Assert
        expect(await screen.findByText('Mostrando 1 a 10 de 20 usuarios')).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Página anterior' })).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getByRole('button', { name: 'Primera página' })).toHaveAttribute('aria-disabled', 'true');

        // Act: Anterior and Primera página again, now on the first page
        const callsOnFirstPage = getUsers.mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Página anterior' }));
        await user.click(screen.getByRole('button', { name: 'Primera página' }));

        // Assert: no other page is asked for
        expect(getUsers).toHaveBeenCalledTimes(callsOnFirstPage);
    });

    test('Mis reservas, whose "Mostrando…" is not a live region, so it is read once', async () => {
        // Arrange
        getReservations.mockImplementation(twoPages(reservation));
        const user = userEvent.setup();
        render(<MemoryRouter><Reservations /></MemoryRouter>);
        await screen.findByText('Mostrando 1–10 de 20 reservas');

        // Act
        await user.click(screen.getByRole('button', { name: 'Siguiente' }));

        // Assert
        const shown = await screen.findByText('Mostrando 11–20 de 20 reservas');
        expect(shown).toHaveFocus();
        expect(shown).not.toHaveAttribute('aria-live');
        expect(screen.getByRole('button', { name: 'Siguiente' })).toHaveAttribute('aria-disabled', 'true');

        // Act
        await user.click(screen.getByRole('button', { name: 'Anterior' }));

        // Assert
        expect(await screen.findByText('Mostrando 1–10 de 20 reservas')).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Anterior' })).toHaveAttribute('aria-disabled', 'true');

        // Act: Anterior again, now on the first page
        const callsOnFirstPage = getReservations.mock.calls.length;
        await user.click(screen.getByRole('button', { name: 'Anterior' }));

        // Assert: no other page is asked for
        expect(getReservations).toHaveBeenCalledTimes(callsOnFirstPage);
    });
});
