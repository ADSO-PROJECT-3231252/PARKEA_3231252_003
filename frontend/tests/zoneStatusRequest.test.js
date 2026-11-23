import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import api from '../src/services/api';
import AdminZones from '../src/pages/AdminZones';
import EditZone from '../src/pages/EditZone';
import { getZone, getAllZones, toggleZone } from '../src/services/zoneService';

// #304: activating or deactivating a zone sends the state the admin chose,
// { isActive: true | false }, and the API sets it instead of switching it

// The screens use a mock of the service; the service tests use the real one
// with a mock of the HTTP client, so no test calls the real API
jest.mock('../src/services/api', () => ({ __esModule: true, default: { patch: jest.fn() } }));
jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    toggleZone: jest.fn(),
}));
const realService = jest.requireActual('../src/services/zoneService');

const CENTRO = {
    id: 'zone-centro',
    name: 'Centro',
    address: 'Calle 1 # 2-3',
    latitude: 4.8133,
    longitude: -75.6961,
    totalSlots: 10,
    availableSlots: 10,
    activeReservations: 0,
    hourlyRate: '3000.00',
    isActive: true,
    open24h: true,
    schedule: [],
};

// [state of the zone, button of the action, state sent]
const ACTIONS = [
    [true, 'Desactivar zona', false],
    [false, 'Activar zona', true],
];

beforeEach(() => {
    jest.clearAllMocks();
});

describe('The request of the zone service (#304)', () => {
    test.each([true, false])('toggleZone sends { isActive: %s } to the toggle of the zone', async (isActive) => {
        // Arrange
        const answer = { data: { zone: { id: 'centro', isActive } } };
        api.patch.mockResolvedValue(answer);

        // Act
        const result = await realService.toggleZone('centro', isActive);

        // Assert
        expect(api.patch).toHaveBeenCalledTimes(1);
        expect(api.patch).toHaveBeenCalledWith('/zones/centro/toggle', { isActive });
        expect(result).toBe(answer);
    });
});

describe('Setting the zone state from "Gestión de zonas" (#304)', () => {
    const renderList = (zone) => {
        getAllZones.mockResolvedValue({ data: { zones: [zone] } });
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
    };
    // The screen draws a table and cards: the first switch is the one of the table
    const zoneSwitch = async () => (await screen.findAllByRole('switch', { name: 'Zona activa: Centro' }))[0];

    test.each(ACTIONS)('when isActive is %s, confirming "%s" sends %s and shows the new state', async (initialState, action, wanted) => {
        // Arrange
        const user = userEvent.setup();
        const zone = { ...CENTRO, isActive: initialState };
        toggleZone.mockResolvedValue({ data: { zone: { ...zone, isActive: wanted } } });
        renderList(zone);

        // Act: the switch opens the dialog, and nothing is sent before confirming
        await user.click(await zoneSwitch());
        const dialog = await screen.findByRole('alertdialog');
        expect(toggleZone).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole('button', { name: action }));

        // Assert
        expect(toggleZone).toHaveBeenCalledTimes(1);
        expect(toggleZone).toHaveBeenCalledWith(zone.id, wanted);
        expect(await zoneSwitch()).toHaveAttribute('aria-checked', String(wanted));
    });

    test('"Cancelar" closes the dialog and sends nothing', async () => {
        // Arrange
        const user = userEvent.setup();
        renderList(CENTRO);
        await user.click(await zoneSwitch());

        // Act
        await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));

        // Assert
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(toggleZone).not.toHaveBeenCalled();
        expect(await zoneSwitch()).toHaveAttribute('aria-checked', 'true');
    });
});

describe('Setting the zone state from "Editar zona" (#304)', () => {
    const renderEdit = (zone) => {
        getZone.mockResolvedValue({ data: { zone } });
        getAllZones.mockResolvedValue({ data: { zones: [zone] } });
        render(
            <MemoryRouter initialEntries={[`/admin/zones/${zone.id}/edit`]}>
                <Routes>
                    <Route path="/admin/zones/:id/edit" element={<EditZone />} />
                </Routes>
            </MemoryRouter>,
        );
    };

    test.each(ACTIONS)('when isActive is %s, confirming "%s" sends %s and shows the new state', async (initialState, action, wanted) => {
        // Arrange
        const user = userEvent.setup();
        const zone = { ...CENTRO, isActive: initialState };
        toggleZone.mockResolvedValue({ data: { zone: { ...zone, isActive: wanted } } });
        renderEdit(zone);

        // Act: the button opens the dialog, and nothing is sent before confirming
        await user.click(await screen.findByRole('button', { name: action }));
        const dialog = await screen.findByRole('alertdialog');
        expect(toggleZone).not.toHaveBeenCalled();
        await user.click(within(dialog).getByRole('button', { name: action }));

        // Assert: the button now offers the opposite action
        expect(toggleZone).toHaveBeenCalledTimes(1);
        expect(toggleZone).toHaveBeenCalledWith(zone.id, wanted);
        const opposite = ACTIONS.find(([state]) => state === wanted)[1];
        expect(await screen.findByRole('button', { name: opposite })).toBeInTheDocument();
    });

    test('"Cancelar" closes the dialog and sends nothing', async () => {
        // Arrange
        const user = userEvent.setup();
        renderEdit(CENTRO);
        await user.click(await screen.findByRole('button', { name: 'Desactivar zona' }));

        // Act
        await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }));

        // Assert
        expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
        expect(toggleZone).not.toHaveBeenCalled();
        expect(screen.getByRole('button', { name: 'Desactivar zona' })).toBeInTheDocument();
    });
});
