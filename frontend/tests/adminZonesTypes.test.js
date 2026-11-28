import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import AdminZones from '../src/pages/AdminZones';
import { getAllZones } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    createZone: jest.fn(),
    updateZone: jest.fn(),
    toggleZone: jest.fn(),
}));

// HU-31 AC-07: "Gestión de zonas" shows the vehicle types of each zone.

// A zone of cars and motorcycles that had trucks, as the two requests of
// "Editar zona" send it: GET /zones/:id has the types it takes, and GET
// /zones/all every type, with its counts
const ZONE = {
    id: 'zone-1',
    name: 'Centro',
    address: 'Calle 1 # 2-3',
    latitude: '4.8100000',
    longitude: '-75.6900000',
    isActive: true,
    open24h: true,
    schedule: [],
    totalSlots: 42,
    availableSlots: 40,
    vehicleTypes: [
        { vehicleType: 'car', totalSlots: 30, availableSlots: 29, hourlyRate: 2000 },
        { vehicleType: 'motorcycle', totalSlots: 12, availableSlots: 11, hourlyRate: 1000 },
    ],
};
const ADMIN_TYPES = [
    { vehicleType: 'car', totalSlots: 30, availableSlots: 29, hourlyRate: 2000, isAccepting: true, spotsInUse: 1, openReservations: 1 },
    { vehicleType: 'motorcycle', totalSlots: 12, availableSlots: 11, hourlyRate: 1000, isAccepting: true, spotsInUse: 2, openReservations: 3 },
    { vehicleType: 'truck', totalSlots: 4, availableSlots: 4, hourlyRate: 5000, isAccepting: false, spotsInUse: 0, openReservations: 0 },
];

describe('"Gestión de zonas" shows the types of each zone (HU-31 AC-07)', () => {
    test('with their spots and rates, and the types turned off say so', async () => {
        // Arrange
        getAllZones.mockResolvedValue({ data: { zones: [{ ...ZONE, activeReservations: 0, vehicleTypes: ADMIN_TYPES }] } });

        // Act
        render(<MemoryRouter><AdminZones /></MemoryRouter>);

        // Assert: the table on computers and the card on phones
        const rows = await screen.findAllByText('Carro');
        expect(rows).toHaveLength(2);
        const types = rows[0].closest('ul');
        expect([...types.querySelectorAll('li')].map((li) => li.textContent)).toEqual([
            'Carro, 30 cupos, $\u00a02.000/h',
            'Moto, 12 cupos, $\u00a01.000/h',
            'Camión, 4 cupos, $\u00a05.000/hNo recibe reservas nuevas',
        ]);
    });
});
