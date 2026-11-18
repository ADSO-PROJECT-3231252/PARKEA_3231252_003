import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// #309: the long zone names of the home are shown complete, on more lines,
// instead of being cut with "…". A zone name can have up to 100 characters.
const LONG_NAME = 'Parqueadero Público Municipal del Centro Comercial y Empresarial Gran Plaza de Dosquebradas Etapa 22';
const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

const reservation = (id, status, startHours) => ({
    id,
    status,
    startTime: at(startHours),
    endTime: at(startHours + 2),
    spotNumber: 4,
    amount: '6000.00',
    zone: { name: LONG_NAME, address: 'Calle 1 # 2-3' },
});

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
    // The card of the reservations gets the next one; the history, the finished ones
    getReservations.mockImplementation(({ status } = {}) => Promise.resolve({
        data: { reservations: status === 'Finished' ? [reservation('done', 'Finished', -30)] : [reservation('next', 'Active', 24)] },
    }));
    getZones.mockResolvedValue({ data: { zones: [{ id: 'zone-1', name: LONG_NAME, availableSlots: 4, totalSlots: 10 }] } });
});

const renderHome = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Home />
        </AuthProvider>
    </MemoryRouter>,
);

// The box of a card of the home, found by its title
const card = async (title) => (await screen.findByText(title)).parentElement;

describe('Long zone names on the home (#309)', () => {
    test.each([
        ['Tus reservas'],
        ['Zonas disponibles'],
        ['Últimas reservas'],
    ])('the card "%s" shows the complete name on more lines, not cut', async (title) => {
        // Act
        renderHome();
        const box = await card(title);

        // Assert
        const name = await within(box).findByText(LONG_NAME);
        expect(name).toHaveClass('break-words');
        expect(name).not.toHaveClass('truncate');
    });
});
