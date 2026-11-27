import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditZone from '../src/pages/EditZone';
import { getAllZones, getZone, updateZone } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    updateZone: jest.fn(),
    toggleZone: jest.fn(),
}));

// #373: a spot keeps several reservations at different hours, so the spots in
// use are not the reservations. HU-31: they are counted for each vehicle
// type. A zone of 2 car spots, as GET /zones/:id sends it.
const ZONE = {
    id: 'zone-1',
    name: 'Centro',
    address: 'Calle 1 # 2-3',
    totalSlots: 2,
    availableSlots: 1,
    vehicleTypes: [{ vehicleType: 'car', totalSlots: 2, availableSlots: 1, hourlyRate: 3000 }],
    latitude: '4.8100000',
    longitude: '-75.6900000',
    isActive: true,
    open24h: true,
    schedule: [],
};

// The zone in the admin list (GET /zones/all), with the counts of its car type
const carType = ({ totalSlots = 2, spotsInUse, openReservations }) => ({
    vehicleType: 'car', totalSlots, availableSlots: 1, hourlyRate: 3000, isAccepting: true, spotsInUse, openReservations,
});

async function renderForm(listed) {
    getZone.mockResolvedValue({ data: { zone: ZONE } });
    getAllZones.mockResolvedValue({ data: { zones: [{ ...ZONE, ...listed }] } });
    updateZone.mockResolvedValue({ data: { zone: { ...ZONE, name: 'Centro Norte' } } });
    render(
        <MemoryRouter initialEntries={['/admin/zones/zone-1/edit']}>
            <Routes>
                <Route path="/admin/zones/:id/edit" element={<EditZone />} />
                <Route path="/admin/zones" element={<p>Lista de zonas</p>} />
            </Routes>
        </MemoryRouter>,
    );
    return screen.findByLabelText(/Nombre de la zona/);
}

const capacity = () => screen.getByLabelText(/^Cupos de carros/);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('"Editar zona" counts the spots in use of each type, not the reservations (#375, HU-31)', () => {
    test('a zone of 2 spots with 4 reservations on 1 of them can be saved', async () => {
        // Arrange
        const user = userEvent.setup();
        const name = await renderForm({ spotsInUse: 1, activeReservations: 4, vehicleTypes: [carType({ spotsInUse: 1, openReservations: 4 })] });
        expect(capacity()).toHaveAccessibleDescription('Mínimo 1: hay 1 cupo con reservas pendientes o activas.');

        // Act: only the name changes
        await user.clear(name);
        await user.type(name, 'Centro Norte');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert: the zone is saved, and the form goes back to the list
        expect(updateZone).toHaveBeenCalledTimes(1);
        expect(updateZone.mock.calls[0][1]).toMatchObject({ name: 'Centro Norte', vehicleTypes: [{ vehicleType: 'car', totalSlots: 2, hourlyRate: 3000 }] });
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
    });

    test('the spots of a type can go down to its spots in use, not below', async () => {
        // Arrange: 3 car spots in use, by 6 reservations
        const user = userEvent.setup();
        await renderForm({ totalSlots: 5, spotsInUse: 3, activeReservations: 6, vehicleTypes: [carType({ totalSlots: 5, spotsInUse: 3, openReservations: 6 })] });

        // Act
        await user.clear(capacity());
        await user.type(capacity(), '2');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Mínimo 3: hay 3 cupos de carros con reservas pendientes o activas.')).toBeInTheDocument();
        expect(capacity()).toHaveFocus();
        expect(updateZone).not.toHaveBeenCalled();
    });

    test('when the admin list does not answer, the form opens with the types of the zone and no minimum', async () => {
        // Arrange
        getZone.mockResolvedValue({ data: { zone: ZONE } });
        getAllZones.mockRejectedValue(new Error('Network Error'));
        render(
            <MemoryRouter initialEntries={['/admin/zones/zone-1/edit']}>
                <Routes>
                    <Route path="/admin/zones/:id/edit" element={<EditZone />} />
                </Routes>
            </MemoryRouter>,
        );

        // Assert: the backend still checks the spots in use
        await screen.findByLabelText(/Nombre de la zona/);
        expect(screen.getByRole('checkbox', { name: 'Carro' })).toBeChecked();
        expect(capacity()).toHaveValue('2');
        expect(capacity()).toHaveAccessibleDescription('Entre 1 y 500.');
    });

    test('a type with no spot in use only says the limits', async () => {
        await renderForm({ spotsInUse: 0, activeReservations: 0, vehicleTypes: [carType({ spotsInUse: 0, openReservations: 0 })] });
        expect(capacity()).toHaveAccessibleDescription('Entre 1 y 500.');
    });

    test('lowering the spots says how many stay free', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderForm({ totalSlots: 5, vehicleTypes: [carType({ totalSlots: 5, spotsInUse: 3, openReservations: 6 })] });

        // Act
        await user.clear(capacity());
        await user.type(capacity(), '4');

        // Assert
        expect(capacity()).toHaveAccessibleDescription('Mínimo 3: hay 3 cupos con reservas pendientes o activas. Con 4 cupos quedará 1 disponible.');
    });

    test('when someone reserves meanwhile, the answer of the API moves the minimum of that type', async () => {
        // Arrange: the form knows 1 spot in use, the API finds 2
        const user = userEvent.setup();
        await renderForm({ vehicleTypes: [carType({ spotsInUse: 1, openReservations: 1 })] });
        updateZone.mockRejectedValue({ response: { status: 400, data: { code: 'CAPACITY_BELOW_IN_USE', vehicleType: 'car', spotsInUse: 2 } } });
        await user.clear(capacity());
        await user.type(capacity(), '1');

        // Act
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Mínimo 2: hay 2 cupos de carros con reservas pendientes o activas.')).toBeInTheDocument();
        expect(capacity()).toHaveFocus();
        await user.type(capacity(), '0');
        expect(capacity()).toHaveAccessibleDescription('Mínimo 2: hay 2 cupos con reservas pendientes o activas. Con 10 cupos quedarán 8 disponibles.');
    });

    test('the warning before deactivating it still counts the reservations', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderForm({ spotsInUse: 1, activeReservations: 4, vehicleTypes: [carType({ spotsInUse: 1, openReservations: 4 })] });

        // Act
        await user.click(screen.getByRole('button', { name: 'Desactivar zona' }));

        // Assert
        expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
            'Vas a desactivar la zona Centro. Dejará de aparecer en la lista pública y no aceptará reservas nuevas. ' +
            'Tiene 4 reservas pendientes o activas, que seguirán válidas hasta que terminen.',
        );
    });
});
