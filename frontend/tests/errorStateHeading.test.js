import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReserveSpot from '../src/pages/ReserveSpot';
import EditVehicle from '../src/pages/EditVehicle';
import { getZone } from '../src/services/zoneService';
import { getVehicles, getVehicle, updateVehicle } from '../src/services/vehicleService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn() }));
jest.mock('../src/services/vehicleService', () => ({
    getVehicles: jest.fn(),
    getVehicle: jest.fn(),
    updateVehicle: jest.fn(),
}));
jest.mock('../src/services/reservationService', () => ({ createReservation: jest.fn() }));

// #311 (axe "page-has-heading-one"): a screen that cannot show its content
// still has its h1
describe('The h1 of the screens that fail to load (#311)', () => {
    test('/reserve/:id has its h1 when the zone does not load', async () => {
        // Arrange
        getZone.mockReset().mockRejectedValue({ response: { status: 404, data: { code: 'ZONE_NOT_FOUND' } } });
        getVehicles.mockReset().mockResolvedValue({ data: { vehicles: [] } });

        // Act
        render(<MemoryRouter initialEntries={['/reserve/zone-1']}><Routes><Route path="/reserve/:zoneId" element={<ReserveSpot />} /></Routes></MemoryRouter>);

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar esta zona.');
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Reservar cupo');
    });

    test.each([
        ['the vehicle does not exist', 'VEHICLE_NOT_FOUND', 'No encontramos este vehículo.'],
        ['the vehicle does not load', 'INTERNAL_ERROR', 'No pudimos cargar los datos del vehículo.'],
    ])('/vehicles/:id/edit has its h1 when %s', async (_case, code, message) => {
        // Arrange
        getVehicle.mockReset().mockRejectedValue({ response: { data: { code } } });
        updateVehicle.mockReset();

        // Act
        render(<MemoryRouter initialEntries={['/vehicles/veh-1/edit']}><Routes><Route path="/vehicles/:id/edit" element={<EditVehicle />} /></Routes></MemoryRouter>);

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent(message);
        expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
        expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Editar vehículo');
    });
});
