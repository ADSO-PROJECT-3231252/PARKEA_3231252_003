import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// HU-31 AC-08: the zones of the home show their types, each one with its free
// spots now and its rate, as GET /zones sends them
const zone = (id, name, vehicleTypes) => ({
    id,
    name,
    totalSlots: vehicleTypes.reduce((sum, t) => sum + t.totalSlots, 0),
    availableSlots: vehicleTypes.reduce((sum, t) => sum + t.availableSlots, 0),
    vehicleTypes,
});
const ZONES = [
    zone('z1', 'Centro', [
        { vehicleType: 'car', totalSlots: 20, availableSlots: 12, hourlyRate: 3000 },
        { vehicleType: 'motorcycle', totalSlots: 10, availableSlots: 5, hourlyRate: 1500 },
    ]),
    zone('z2', 'Estadio', [{ vehicleType: 'truck', totalSlots: 4, availableSlots: 0, hourlyRate: 6000 }]),
];

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
    getReservations.mockResolvedValue({ data: { reservations: [] } });
    getZones.mockResolvedValue({ data: { zones: ZONES } });
});

const renderHome = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Home />
        </AuthProvider>
    </MemoryRouter>,
);

// The box of a zone in the card "Zonas disponibles"
const zoneBox = async (name) => (await screen.findByText(name)).closest('li');

describe('The zones of the home show their types (AC-08)', () => {
    test('each zone has its types with their free spots and rates', async () => {
        // Act
        renderHome();
        const centro = await zoneBox('Centro');

        // Assert
        const types = within(centro).getByRole('list', { name: 'Tipos de vehículo' });
        expect(within(types).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
            'Carro, 12 libres, $\u00a03.000/h por hora',
            'Moto, 5 libres, $\u00a01.500/h por hora',
        ]);
    });

    test('the state of the zone stays, by all its spots', async () => {
        // Act
        renderHome();

        // Assert
        expect(within(await zoneBox('Centro')).getByText('Disponible')).toBeInTheDocument();
        expect(within(await zoneBox('Estadio')).getByText('Llena')).toBeInTheDocument();
        expect(within(await zoneBox('Estadio')).getByRole('listitem')).toHaveTextContent('Camión, 0 libres, $ 6.000/h por hora');
    });

    test('the types use the small text of the card', async () => {
        // Act
        renderHome();

        // Assert
        expect(within(await zoneBox('Centro')).getByRole('list', { name: 'Tipos de vehículo' })).toHaveClass('text-caption');
    });
});
