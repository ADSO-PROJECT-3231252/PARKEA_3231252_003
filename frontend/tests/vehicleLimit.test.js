import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegisterVehicle from '../src/pages/RegisterVehicle';
import { createVehicle } from '../src/services/vehicleService';

// The screen does not call the real API
jest.mock('../src/services/vehicleService', () => ({ createVehicle: jest.fn() }));

const fill = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });

// #299: a user has at most 5 active vehicles, so the server rejects the sixth
describe('The limit of active vehicles (#299)', () => {
    test('a sixth vehicle shows the limit message in the banner and the form stays open', async () => {
        // Arrange
        const user = userEvent.setup();
        createVehicle.mockRejectedValue({ response: { status: 409, data: { code: 'VEHICLE_LIMIT_REACHED' } } });
        render(
            <MemoryRouter initialEntries={['/vehicles/new']}>
                <Routes>
                    <Route path="/vehicles/new" element={<RegisterVehicle />} />
                    <Route path="/vehicles" element={<p>Mis vehículos</p>} />
                </Routes>
            </MemoryRouter>,
        );
        fill('vehicleType', 'car');
        fill('plate', 'ABC123');
        fill('brand', 'Mazda');
        fill('model', '3');
        fill('color', 'Rojo');

        // Act
        await user.click(screen.getByRole('button', { name: 'Registrar vehículo' }));

        // Assert: in the banner, not on the plate field
        const message = await screen.findByText('Alcanzaste el máximo de 5 vehículos activos. Elimina uno antes de registrar otro');
        expect(message).toHaveAttribute('role', 'alert');
        expect(document.getElementById('plate-error')).toBeNull();
        expect(createVehicle).toHaveBeenCalledTimes(1);
        expect(screen.queryByText('Mis vehículos')).not.toBeInTheDocument();
    });
});
