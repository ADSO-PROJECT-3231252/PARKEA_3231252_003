import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import VehicleList from '../src/pages/VehicleList';
import {
    deleteVehicle,
    getVehicles,
    setDefaultVehicle,
} from '../src/services/vehicleService';

jest.mock('../src/services/vehicleService', () => ({
    getVehicles: jest.fn(),
    setDefaultVehicle: jest.fn(),
    deleteVehicle: jest.fn(),
}));

const vehicle = {
    id: 7,
    plate: 'ABC123',
    brand: 'Renault',
    model: 'Logan',
    color: 'Blanco',
    vehicleType: 'car',
    isDefault: false,
};

const notFoundError = {
    response: { status: 404, data: { code: 'VEHICLE_NOT_FOUND' } },
};

function renderVehicleList() {
    return render(
        <MemoryRouter initialEntries={['/vehicles']}>
            <VehicleList />
        </MemoryRouter>,
    );
}

beforeEach(() => {
    jest.resetAllMocks();

    // Another device removes the vehicle after the first list request.
    getVehicles
        .mockResolvedValueOnce({ data: { vehicles: [vehicle] } })
        .mockResolvedValue({ data: { vehicles: [] } });
});

test('refreshes the list when the vehicle selected as default no longer exists', async () => {
    const user = userEvent.setup();
    setDefaultVehicle.mockRejectedValueOnce(notFoundError);
    renderVehicleList();

    const button = await screen.findByRole('button', {
        name: /marcar .*ABC123 como vehículo predeterminado/i,
    });
    await user.click(button);

    expect(setDefaultVehicle).toHaveBeenCalledWith(vehicle.id);
    expect(await screen.findByText('Vehículo no encontrado')).toBeInTheDocument();
    await waitFor(() => expect(getVehicles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aún no tienes vehículos registrados.')).toBeInTheDocument();
    expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument();
});

test('refreshes the list when the vehicle selected for deletion no longer exists', async () => {
    const user = userEvent.setup();
    deleteVehicle.mockRejectedValueOnce(notFoundError);
    renderVehicleList();

    const deleteButton = await screen.findByRole('button', {
        name: /eliminar .*ABC123/i,
    });
    await user.click(deleteButton);

    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));

    expect(deleteVehicle).toHaveBeenCalledWith(vehicle.id);
    expect(await screen.findByText('Vehículo no encontrado')).toBeInTheDocument();
    await waitFor(() => expect(getVehicles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aún no tienes vehículos registrados.')).toBeInTheDocument();
    expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument();
});
