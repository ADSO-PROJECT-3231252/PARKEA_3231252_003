import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditVehicle from '../src/pages/EditVehicle';
import { getVehicle, updateVehicle } from '../src/services/vehicleService';

// The screen does not call the real API
jest.mock('../src/services/vehicleService', () => ({ getVehicle: jest.fn(), updateVehicle: jest.fn() }));

// HU-31 AC-13: the type of a vehicle cannot change while it has a Pending or
// Active reservation: PUT /vehicles/:id answers 409
// VEHICLE_HAS_ACTIVE_RESERVATION and saves nothing. Cars and trucks share
// the format of their plate, so a car can be changed to a truck.
const VEHICLE = { id: 'veh-1', plate: 'ABC123', vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo', visualDescription: '' };
const HAS_RESERVATION = { response: { status: 409, data: { code: 'VEHICLE_HAS_ACTIVE_RESERVATION', message: 'x' } } };
const MESSAGE = 'Este vehículo tiene una reserva pendiente o activa, así que no puedes cambiar su tipo. Deja "Carro" para guardar los demás cambios.';

async function openEdit(vehicle = VEHICLE) {
    getVehicle.mockResolvedValue({ data: { vehicle } });
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={['/vehicles/veh-1/edit']}>
            <Routes>
                <Route path="/vehicles/:id/edit" element={<EditVehicle />} />
                <Route path="/vehicles" element={<p>Mis vehículos</p>} />
            </Routes>
        </MemoryRouter>,
    );
    await screen.findByRole('button', { name: 'Guardar cambios' });
    return user;
}

const typeField = () => screen.getByLabelText(/^Tipo de vehículo/);
const save = (user) => user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

beforeEach(() => {
    getVehicle.mockReset();
    updateVehicle.mockReset();
});

describe('Changing the type of a vehicle with a reservation (HU-31 AC-13)', () => {
    test('says it on the type, with how to save the other changes, and moves the focus there', async () => {
        // Arrange
        updateVehicle.mockRejectedValue(HAS_RESERVATION);
        const user = await openEdit();
        await user.selectOptions(typeField(), 'truck');
        await user.clear(screen.getByLabelText(/^Color/));
        await user.type(screen.getByLabelText(/^Color/), 'Azul');

        // Act
        await save(user);

        // Assert: the screen stays, with the message on the type
        expect(updateVehicle).toHaveBeenCalledWith('veh-1', expect.objectContaining({ vehicleType: 'truck', color: 'Azul' }));
        expect(await screen.findByRole('alert')).toHaveTextContent(MESSAGE);
        expect(typeField()).toHaveAttribute('aria-invalid', 'true');
        expect(typeField()).toHaveAccessibleDescription(MESSAGE);
        expect(typeField()).toHaveFocus();
        expect(screen.queryByText('Mis vehículos')).not.toBeInTheDocument();
        // Not the message of deleting it
        expect(screen.queryByText(/Cancélala antes de eliminarlo/)).not.toBeInTheDocument();
    });

    test('putting the type back takes the message away, and the other changes are saved', async () => {
        // Arrange
        updateVehicle.mockRejectedValueOnce(HAS_RESERVATION).mockResolvedValueOnce({ data: {} });
        const user = await openEdit();
        await user.selectOptions(typeField(), 'truck');
        await user.clear(screen.getByLabelText(/^Color/));
        await user.type(screen.getByLabelText(/^Color/), 'Azul');
        await save(user);
        await screen.findByRole('alert');

        // Act
        await user.selectOptions(typeField(), 'car');

        // Assert
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(typeField()).toHaveAttribute('aria-invalid', 'false');
        await save(user);
        expect(updateVehicle).toHaveBeenLastCalledWith('veh-1', expect.objectContaining({ vehicleType: 'car', color: 'Azul' }));
        expect(await screen.findByText('Mis vehículos')).toBeInTheDocument();
    });

    test('a truck says "Camión" as the type to keep', async () => {
        // Arrange
        updateVehicle.mockRejectedValue(HAS_RESERVATION);
        const user = await openEdit({ ...VEHICLE, vehicleType: 'truck' });
        await user.selectOptions(typeField(), 'car');

        // Act
        await save(user);

        // Assert
        expect(await screen.findByRole('alert')).toHaveTextContent('Deja "Camión" para guardar los demás cambios.');
    });
});
