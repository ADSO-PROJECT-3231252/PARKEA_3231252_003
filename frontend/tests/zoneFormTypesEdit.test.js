import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditZone from '../src/pages/EditZone';
import { getAllZones, getZone, updateZone } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    createZone: jest.fn(),
    updateZone: jest.fn(),
    toggleZone: jest.fn(),
}));

// HU-31 AC-04 and AC-05: the vehicle types of a zone in "Editar zona": the
// ones turned off, the minimum of each type, and the question before a type
// stops taking reservations.

const checkbox = (name) => screen.getByRole('checkbox', { name });
const slotsOf = (plural) => screen.getByLabelText(new RegExp(`^Cupos de ${plural}`));
const rateOf = (plural) => screen.getByLabelText(new RegExp(`^Tarifa por hora de ${plural}`));
const save = (name) => screen.getByRole('button', { name });

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

async function renderEdit({ zone = ZONE, adminTypes = ADMIN_TYPES } = {}) {
    getZone.mockResolvedValue({ data: { zone } });
    if (adminTypes) getAllZones.mockResolvedValue({ data: { zones: [{ ...zone, activeReservations: 4, vehicleTypes: adminTypes }] } });
    else getAllZones.mockRejectedValue(new Error('Network Error'));
    updateZone.mockResolvedValue({ data: { zone } });
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={['/admin/zones/zone-1/edit']}>
            <Routes>
                <Route path="/admin/zones/:id/edit" element={<EditZone />} />
                <Route path="/admin/zones" element={<p>Lista de zonas</p>} />
            </Routes>
        </MemoryRouter>,
    );
    await screen.findByLabelText(/Nombre de la zona/);
    return user;
}

beforeEach(() => {
    jest.clearAllMocks();
});

describe('"Editar zona" with its vehicle types (HU-31 AC-04, AC-05)', () => {
    test('it shows every type: the ones the zone takes checked, and a type turned off with its spots and rate', async () => {
        // Arrange
        const user = await renderEdit();

        // Assert
        expect(checkbox('Carro')).toBeChecked();
        expect(checkbox('Moto')).toBeChecked();
        expect(checkbox('Camión')).not.toBeChecked();
        expect(screen.getByText('No recibe camiones. Si marcas este tipo, vuelve con 4 cupos y $ 5.000 por hora.')).toBeInTheDocument();
        expect(slotsOf('motos')).toHaveAccessibleDescription('Mínimo 2: hay 2 cupos con reservas pendientes o activas.');

        // Act: checking it again brings them back
        await user.click(checkbox('Camión'));

        // Assert
        expect(slotsOf('camiones')).toHaveValue('4');
        expect(rateOf('camiones')).toHaveValue('5000');
    });

    test('a new rate says that only the new reservations of that type pay it', async () => {
        // Arrange
        const user = await renderEdit();

        // Act
        await user.clear(rateOf('motos'));
        await user.type(rateOf('motos'), '1500');

        // Assert
        expect(rateOf('motos')).toHaveAccessibleDescription(
            'Las reservas nuevas de motos pagarán $\u00a01.500 por hora. Las que ya existen mantienen $\u00a01.000.',
        );
    });

    test('unchecking a type asks first, with its open reservations, and saving without it turns it off', async () => {
        // Arrange
        const user = await renderEdit();

        // Act
        await user.click(checkbox('Moto'));
        expect(screen.getByText('Al guardar, la zona dejará de recibir reservas nuevas de motos. Las que ya tiene seguirán válidas.')).toBeInTheDocument();
        await user.click(save('Guardar cambios'));

        // Assert
        const dialog = await screen.findByRole('alertdialog', { name: 'Dejar de recibir motos' });
        expect(dialog).toHaveAccessibleDescription(
            'La zona Centro no aceptará reservas nuevas de motos. Tiene 3 reservas de motos pendientes o activas, que seguirán válidas hasta que terminen. ' +
            'Sus cupos y su tarifa se conservan si lo vuelves a marcar.',
        );
        expect(updateZone).not.toHaveBeenCalled();

        // Act
        await user.click(within(dialog).getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(updateZone.mock.calls[0][1].vehicleTypes).toEqual([{ vehicleType: 'car', totalSlots: 30, hourlyRate: 2000 }]);
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
    });

    test('cancelling the question saves nothing and keeps what was typed', async () => {
        // Arrange
        const user = await renderEdit();
        await user.click(checkbox('Carro'));
        await user.click(save('Guardar cambios'));

        // Act
        await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));

        // Assert
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(checkbox('Carro')).not.toBeChecked();
        expect(updateZone).not.toHaveBeenCalled();
    });

    test('without the counts of the admin list, the question says the reservations stay valid', async () => {
        // Arrange
        const user = await renderEdit({ adminTypes: null });

        // Act
        await user.click(checkbox('Moto'));
        await user.click(save('Guardar cambios'));

        // Assert
        expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
            'La zona Centro no aceptará reservas nuevas de motos. Si tiene reservas pendientes o activas de ese tipo, seguirán válidas hasta que terminen. ' +
            'Sus cupos y su tarifa se conservan si lo vuelves a marcar.',
        );
    });

    test('the question counts the reservations of now, not the ones when the form was opened', async () => {
        // Arrange: no reservation of motorcycles when the form opens, 3 when it is saved
        const user = await renderEdit({ adminTypes: ADMIN_TYPES.map((type) => ({ ...type, openReservations: 0 })) });
        getAllZones.mockResolvedValue({ data: { zones: [{ ...ZONE, activeReservations: 4, vehicleTypes: ADMIN_TYPES }] } });

        // Act
        await user.click(checkbox('Moto'));
        await user.click(save('Guardar cambios'));

        // Assert
        expect(await screen.findByRole('alertdialog', { name: 'Dejar de recibir motos' })).toHaveAccessibleDescription(
            'La zona Centro no aceptará reservas nuevas de motos. Tiene 3 reservas de motos pendientes o activas, que seguirán válidas hasta que terminen. ' +
            'Sus cupos y su tarifa se conservan si lo vuelves a marcar.',
        );
    });

    test('a type with no open reservations is turned off with the plain question', async () => {
        // Arrange: no reservation of cars
        const user = await renderEdit({ adminTypes: ADMIN_TYPES.map((type) => ({ ...type, spotsInUse: 0, openReservations: 0 })) });

        // Act
        await user.click(checkbox('Carro'));
        await user.click(save('Guardar cambios'));

        // Assert
        expect(await screen.findByRole('alertdialog', { name: 'Dejar de recibir carros' })).toHaveAccessibleDescription(
            'La zona Centro no aceptará reservas nuevas de carros. Sus cupos y su tarifa se conservan si lo vuelves a marcar.',
        );
    });

    test('the last checked type cannot be unchecked: to close the zone, it is deactivated', async () => {
        // Arrange: only cars
        const user = await renderEdit({ adminTypes: [ADMIN_TYPES[0]], zone: { ...ZONE, vehicleTypes: [ZONE.vehicleTypes[0]] } });
        const car = checkbox('Carro');
        expect(car).toHaveAttribute('aria-disabled', 'true');
        expect(car).toHaveAccessibleDescription('Es el único tipo que recibe la zona. Para cerrarla, desactiva la zona.');

        // Act
        await user.click(car);

        // Assert
        expect(car).toBeChecked();
    });

    test('once another type is checked, the first one can be unchecked', async () => {
        // Arrange
        const user = await renderEdit({ adminTypes: [ADMIN_TYPES[0]], zone: { ...ZONE, vehicleTypes: [ZONE.vehicleTypes[0]] } });

        // Act
        await user.click(checkbox('Moto'));
        await user.click(checkbox('Carro'));

        // Assert
        expect(checkbox('Carro')).not.toBeChecked();
        expect(rateOf('motos')).toHaveValue('2000');
        // Now the motorcycles are the last checked type
        expect(checkbox('Moto')).toHaveAttribute('aria-disabled', 'true');
    });
});

