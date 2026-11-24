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
// use are not the reservations. A zone of 2 spots with 4 reservations on one
// of them, as GET /zones/:id and GET /zones/all send it.
const ZONE = {
    id: 'zone-1',
    name: 'Centro',
    address: 'Calle 1 # 2-3',
    totalSlots: 2,
    availableSlots: 1,
    hourlyRate: '3000.00',
    latitude: '4.8100000',
    longitude: '-75.6900000',
    isActive: true,
    open24h: true,
    schedule: [],
};

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

const capacity = () => screen.getByLabelText(/Capacidad total/);

beforeEach(() => {
    jest.clearAllMocks();
});

describe('"Editar zona" counts the spots in use, not the reservations (#375)', () => {
    test('a zone of 2 spots with 4 reservations on 1 of them can be saved', async () => {
        // Arrange
        const user = userEvent.setup();
        const name = await renderForm({ spotsInUse: 1, activeReservations: 4 });
        expect(capacity()).toHaveAccessibleDescription(
            'Entre 1 y 500. Hay 1 cupo en uso por reservas pendientes o activas.',
        );

        // Act: only the name changes
        await user.clear(name);
        await user.type(name, 'Centro Norte');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert: the zone is saved, and the form goes back to the list
        expect(updateZone).toHaveBeenCalledTimes(1);
        expect(updateZone.mock.calls[0][1]).toMatchObject({ name: 'Centro Norte', totalSlots: 2 });
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
    });

    test('the capacity can go down to the spots in use, not below', async () => {
        // Arrange: 3 spots in use, by 6 reservations
        const user = userEvent.setup();
        await renderForm({ totalSlots: 5, spotsInUse: 3, activeReservations: 6 });

        // Act
        await user.clear(capacity());
        await user.type(capacity(), '2');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Hay 3 cupos en uso por reservas pendientes o activas. La capacidad no puede ser menor.')).toBeInTheDocument();
        expect(updateZone).not.toHaveBeenCalled();
    });

    test('when the API does not send spotsInUse yet, it uses the reservations as before', async () => {
        await renderForm({ activeReservations: 2 });
        expect(capacity()).toHaveAccessibleDescription(
            'Entre 2 y 500. Hay 2 cupos en uso por reservas pendientes o activas.',
        );
    });

    test('a zone with no spot in use only says the limits', async () => {
        await renderForm({ spotsInUse: 0, activeReservations: 0 });
        expect(capacity()).toHaveAccessibleDescription('Número total de cupos de la zona, entre 1 y 500.');
    });

    test('the warning before deactivating it still counts the reservations', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderForm({ spotsInUse: 1, activeReservations: 4 });

        // Act
        await user.click(screen.getByRole('button', { name: 'Desactivar zona' }));

        // Assert
        expect(await screen.findByRole('alertdialog')).toHaveAccessibleDescription(
            'Vas a desactivar la zona Centro. Dejará de aparecer en la lista pública y no aceptará reservas nuevas. ' +
            'Tiene 4 reservas pendientes o activas, que seguirán válidas hasta que terminen.',
        );
    });
});
