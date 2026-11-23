import { act, render, screen, waitFor, within } from '@testing-library/react';
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
    // The button disappeared with its vehicle: the message keeps the focus
    expect(screen.getByText('Vehículo no encontrado')).toHaveFocus();
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
    expect(await screen.findByText('Vehículo no encontrado')).toHaveFocus();
    // There is nothing left to confirm, so the dialog closes
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    await waitFor(() => expect(getVehicles).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('Aún no tienes vehículos registrados.')).toBeInTheDocument();
    expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument();
});

const otherVehicle = {
    id: 8,
    plate: 'XYZ789',
    brand: 'Kia',
    model: 'Rio',
    color: 'Azul',
    vehicleType: 'car',
    isDefault: false,
};

async function confirmDeleteOf(user, plate) {
    await user.click(await screen.findByRole('button', { name: new RegExp(`eliminar .*${plate}`, 'i') }));
    const dialog = screen.getByRole('alertdialog');
    await user.click(within(dialog).getByRole('button', { name: 'Confirmar' }));
}

test('the message gets the focus again when a second vehicle no longer exists', async () => {
    const user = userEvent.setup();
    getVehicles
        .mockReset()
        .mockResolvedValueOnce({ data: { vehicles: [vehicle, otherVehicle] } })
        .mockResolvedValueOnce({ data: { vehicles: [otherVehicle] } })
        .mockResolvedValue({ data: { vehicles: [] } });
    deleteVehicle.mockRejectedValue(notFoundError);
    renderVehicleList();

    await confirmDeleteOf(user, vehicle.plate);
    expect(await screen.findByText('Vehículo no encontrado')).toHaveFocus();
    await waitFor(() => expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument());

    await confirmDeleteOf(user, otherVehicle.plate);

    expect(deleteVehicle).toHaveBeenLastCalledWith(otherVehicle.id);
    await waitFor(() => expect(screen.queryByText(otherVehicle.plate)).not.toBeInTheDocument());
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getAllByText('Vehículo no encontrado')).toHaveLength(1);
    expect(screen.getByText('Vehículo no encontrado')).toHaveFocus();
});

test('a vehicle deleted after the message takes the old message away', async () => {
    const user = userEvent.setup();
    getVehicles
        .mockReset()
        .mockResolvedValueOnce({ data: { vehicles: [vehicle, otherVehicle] } })
        .mockResolvedValueOnce({ data: { vehicles: [otherVehicle] } })
        .mockResolvedValue({ data: { vehicles: [] } });
    deleteVehicle.mockRejectedValueOnce(notFoundError).mockResolvedValueOnce({ data: {} });
    renderVehicleList();

    await confirmDeleteOf(user, vehicle.plate);
    expect(await screen.findByText('Vehículo no encontrado')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument());

    await confirmDeleteOf(user, otherVehicle.plate);

    expect(await screen.findByText('Vehículo eliminado correctamente.')).toBeInTheDocument();
    expect(screen.queryByText('Vehículo no encontrado')).not.toBeInTheDocument();
});

test('the message gets the focus again when a second vehicle selected as default no longer exists', async () => {
    const user = userEvent.setup();
    getVehicles
        .mockReset()
        .mockResolvedValueOnce({ data: { vehicles: [vehicle, otherVehicle] } })
        .mockResolvedValueOnce({ data: { vehicles: [otherVehicle] } })
        .mockResolvedValue({ data: { vehicles: [] } });
    setDefaultVehicle.mockRejectedValue(notFoundError);
    renderVehicleList();

    await user.click(await screen.findByRole('button', { name: /marcar .*ABC123 como vehículo predeterminado/i }));
    expect(await screen.findByText('Vehículo no encontrado')).toHaveFocus();
    await waitFor(() => expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /marcar .*XYZ789 como vehículo predeterminado/i }));

    expect(setDefaultVehicle).toHaveBeenLastCalledWith(otherVehicle.id);
    await waitFor(() => expect(screen.queryByText(otherVehicle.plate)).not.toBeInTheDocument());
    expect(screen.getByText('Vehículo no encontrado')).toHaveFocus();
});

test('focuses the vehicle list heading after deleting the last vehicle (#361)', async () => {
    // Arrange
    const user = userEvent.setup();
    deleteVehicle.mockResolvedValueOnce({ data: {} });
    renderVehicleList();

    // Act
    await confirmDeleteOf(user, vehicle.plate);

    // Assert
    expect(deleteVehicle).toHaveBeenCalledWith(vehicle.id);
    expect(await screen.findByText('Aún no tienes vehículos registrados.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis vehículos' })).toHaveFocus();
});

test('removes the deleted vehicle and focuses the heading before the list is loaded again (#361)', async () => {
    // Arrange: two vehicles, and the list that follows the deletion is slow
    const user = userEvent.setup();
    let resolveRefresh;
    getVehicles
        .mockReset()
        .mockResolvedValueOnce({ data: { vehicles: [vehicle, otherVehicle] } })
        .mockReturnValueOnce(new Promise((resolve) => {
            resolveRefresh = resolve;
        }));
    deleteVehicle.mockResolvedValueOnce({ data: {} });
    renderVehicleList();

    // Act
    await confirmDeleteOf(user, vehicle.plate);

    // Assert: while the list is loading again, the deleted vehicle is already
    // gone and the heading has the focus (its "Eliminar" button is gone too)
    await waitFor(() => expect(getVehicles).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument();
    expect(screen.getByText(otherVehicle.plate)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis vehículos' })).toHaveFocus();

    // And the list that arrives keeps it that way
    await act(async () => {
        resolveRefresh({ data: { vehicles: [otherVehicle] } });
    });
    expect(screen.queryByText(vehicle.plate)).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis vehículos' })).toHaveFocus();
});
