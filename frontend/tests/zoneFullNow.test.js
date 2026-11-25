import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import ReserveSpot from '../src/pages/ReserveSpot';
import { AuthProvider } from '../src/context/AuthContext';
import { getZone, getZones } from '../src/services/zoneService';
import { getVehicles } from '../src/services/vehicleService';

// The screens do not call the real API
// #375: the free spots for the chosen hours never answer here
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn(), getZones: jest.fn(), getAvailabilityForHours: jest.fn(() => new Promise(() => {})) }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn() }));
jest.mock('../src/services/reservationService', () => ({ createReservation: jest.fn() }));

// jsdom cannot draw the map: its pieces only render what they hold, so the
// summary of every pin is in the page, as if it were open
jest.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => children,
    TileLayer: () => null,
    ZoomControl: () => null,
    Marker: ({ children }) => children,
    Popup: ({ children }) => children,
    useMap: () => ({ closePopup: jest.fn() }),
}));

// #373: availableSlots is the room now (the spots free for the next 30
// minutes). A zone with none now can still be reserved for other hours.
const zone = (id, name, availableSlots, latitude) => ({
    id,
    name,
    address: 'Calle 1 # 2-3',
    availableSlots,
    totalSlots: 10,
    // HU-31: a zone for cars
    vehicleTypes: [{ vehicleType: 'car', totalSlots: 10, availableSlots, hourlyRate: 3000 }],
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
    getZone.mockReset();
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

describe('A zone with no room now can still be reserved from the map (#375)', () => {
    // The map is downloaded apart (lazy), so the summaries take a moment
    const summaryButton = (name) => screen.findByRole('button', { name }, { timeout: 3000 });

    test('its summary has "Reservar" enabled and says why there is no room now', async () => {
        // Arrange + Act
        renderList('?view=map');
        const button = await summaryButton('Reservar en Parqueadero Centro');

        // Assert
        expect(button).toBeEnabled();
        expect(button).not.toHaveAttribute('aria-disabled');
        expect(button).toHaveTextContent('Reservar');
        expect(button).toHaveAccessibleDescription(NOTE);
        // HU-31: the free spots now of each type
        expect(screen.getAllByText('Cupos libres ahora y tarifa por hora')).toHaveLength(2);
        expect(screen.getByText('Llena (sin cupos ahora)')).toBeInTheDocument();
        expect(screen.queryByText('Sin cupos disponibles')).not.toBeInTheDocument();
    });

    test('a zone with room has no note', async () => {
        renderList('?view=map');
        const button = await summaryButton('Reservar en Av. Simón Bolívar');
        expect(button).not.toHaveAccessibleDescription();
        expect(screen.getAllByText(NOTE)).toHaveLength(1);
    });

    test('clicking it opens the reserve flow', async () => {
        // Arrange
        const user = userEvent.setup();
        renderList('?view=map');

        // Act
        await user.click(await summaryButton('Reservar en Parqueadero Centro'));

        // Assert
        expect(screen.getByText('Pantalla de inicio de sesión')).toBeInTheDocument();
    });
});

describe('The reserve screen of a zone with no room now (#375)', () => {
    async function renderReserve(zoneValues) {
        getZone.mockResolvedValue({ data: { zone: zoneValues } });
        getVehicles.mockResolvedValue({ data: { vehicles: [{ id: 'v1', plate: 'ABC123', vehicleType: 'car', brand: 'Kia', model: 'Rio', color: 'Rojo', isDefault: true }] } });
        render(
            <MemoryRouter initialEntries={[`/reserve/${zoneValues.id}`]}>
                <Routes>
                    <Route path="/reserve/:zoneId" element={<ReserveSpot />} />
                </Routes>
            </MemoryRouter>,
        );
        await screen.findByRole('heading', { name: 'Reservar cupo' });
    }

    test('says that there is no room now and keeps the form to choose other hours', async () => {
        // Arrange + Act
        await renderReserve(FULL);

        // Assert
        expect(screen.getByText('Llena')).toBeInTheDocument();
        expect(screen.getByText('cupos libres ahora')).toBeInTheDocument();
        expect(screen.getByText(NOTE)).toBeInTheDocument();
        expect(document.getElementById('startDate')).toBeEnabled();
        expect(screen.getByRole('button', { name: 'Reservar cupo' })).toBeEnabled();
    });

    test('a zone with room has no note', async () => {
        await renderReserve(FREE);
        expect(screen.getByText('cupos libres ahora')).toBeInTheDocument();
        expect(screen.queryByText(NOTE)).not.toBeInTheDocument();
    });
});
