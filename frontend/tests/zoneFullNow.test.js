import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// #373: availableSlots is the room now (the spots free for the next 30
// minutes). A zone with none now can still be reserved for other hours.
const zone = (id, name, availableSlots, latitude) => ({
    id,
    name,
    address: 'Calle 1 # 2-3',
    availableSlots,
    totalSlots: 10,
    hourlyRate: '3000.00',
    isActive: true,
    open24h: true,
    schedule: [],
    // where the map puts the pin (MySQL DECIMAL columns arrive as strings)
    latitude,
    longitude: '-75.6900000',
});
const FULL = zone('zone-full', 'Parqueadero Centro', 0, '4.8100000');
const FREE = zone('zone-free', 'Av. Simón Bolívar', 5, '4.8200000');
const NOTE = 'No hay cupos en este momento, pero puedes reservar para otro horario.';

function renderList(search = '') {
    getZones.mockResolvedValue({ data: { zones: [FULL, FREE] } });
    render(
        <MemoryRouter initialEntries={[`/zones${search}`]}>
            <AuthProvider>
                <Routes>
                    <Route path="/zones" element={<Zones />} />
                    <Route path="/login" element={<p>Pantalla de inicio de sesión</p>} />
                    <Route path="/reserve/:zoneId" element={<p>Pantalla de reserva</p>} />
                </Routes>
            </AuthProvider>
        </MemoryRouter>,
    );
}

beforeEach(() => {
    localStorage.clear();
    getZones.mockReset();
});

describe('A zone with no room now can still be reserved from the list (#375)', () => {
    test('its "Reservar" button is enabled and says why there is no room now', async () => {
        // Arrange + Act
        renderList();
        const button = await screen.findByRole('button', { name: 'Reservar en Parqueadero Centro' });

        // Assert: the "Llena" badge stays, the count is the room now, and
        // the note is read with the button
        expect(screen.getByText('Llena')).toBeInTheDocument();
        expect(screen.getAllByText('cupos libres ahora')).toHaveLength(2);
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).toHaveTextContent('Reservar');
        expect(button).toHaveAccessibleDescription(NOTE);
        expect(screen.queryByText('Sin cupos disponibles')).not.toBeInTheDocument();
    });

    test('a zone with room has no note', async () => {
        renderList();
        const button = await screen.findByRole('button', { name: 'Reservar en Av. Simón Bolívar' });
        expect(button).not.toHaveAccessibleDescription();
        expect(screen.getAllByText(NOTE)).toHaveLength(1);
    });

    test('clicking it opens the reserve screen of the zone', async () => {
        // Arrange: a signed-in user
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'account-1', role: 'user', fullName: 'Cuenta de prueba' }));
        const user = userEvent.setup();
        renderList();

        // Act
        await user.click(await screen.findByRole('button', { name: 'Reservar en Parqueadero Centro' }));

        // Assert
        expect(screen.getByText('Pantalla de reserva')).toBeInTheDocument();
    });

    test('a visitor goes to the login first, like with any zone', async () => {
        // Arrange
        const user = userEvent.setup();
        renderList();

        // Act
        await user.click(await screen.findByRole('button', { name: 'Reservar en Parqueadero Centro' }));

        // Assert
        expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument();
    });
});
