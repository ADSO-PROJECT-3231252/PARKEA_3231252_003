import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import AdminZones from '../src/pages/AdminZones';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones, getAllZones } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZones: jest.fn(),
    getAllZones: jest.fn(),
    toggleZone: jest.fn(),
}));

const zone = (id, name, address) => ({
    id, name, address, availableSlots: 5, totalSlots: 10, hourlyRate: '3000.00', isActive: true, open24h: true, schedule: [],
});
const SIMON = zone('zone-simon', 'Av. Simón Bolívar', 'Carrera 7 # 18-20');
const CENTRO = zone('zone-centro', 'Parqueadero Centro', 'Calle Córdoba # 4-20');

// The admin screen draws a table and cards, so a name can appear twice
const shown = (name) => screen.queryAllByText(name).length > 0;

describe('Searching zones without accents (#182)', () => {
    beforeEach(() => {
        localStorage.clear();
        getZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
    });

    test.each(['simon', 'SIMON', 'Simón'])('the public list finds "Av. Simón Bolívar" with "%s"', async (text) => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><Zones /></AuthProvider></MemoryRouter>);
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), text);

        // Assert
        expect(await screen.findByText('Av. Simón Bolívar')).toBeInTheDocument();
        expect(shown('Parqueadero Centro')).toBe(false);
    });

    test.each(['simon', 'SIMON', 'Simón'])('zone management finds "Av. Simón Bolívar" with "%s"', async (text) => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
        await screen.findAllByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zona por nombre o dirección'), text);

        // Assert
        expect(shown('Av. Simón Bolívar')).toBe(true);
        expect(shown('Parqueadero Centro')).toBe(false);
    });

    test('zone management finds an address without its accents', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
        await screen.findAllByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zona por nombre o dirección'), 'cordoba');

        // Assert
        expect(shown('Parqueadero Centro')).toBe(true);
        expect(shown('Av. Simón Bolívar')).toBe(false);
    });
});
