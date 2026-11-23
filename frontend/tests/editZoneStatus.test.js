import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import EditZone from '../src/pages/EditZone';
import { getZone, getAllZones, toggleZone } from '../src/services/zoneService';

jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    toggleZone: jest.fn(),
}));

describe('Setting the zone state from the edit screen (#304)', () => {
    test.each([
        [true, 'Desactivar zona', false],
        [false, 'Activar zona', true],
    ])('when isActive is %s, confirming "%s" sends %s', async (initialState, action, desiredState) => {
        const user = userEvent.setup();
        const zone = {
            id: 'zone-centro',
            name: 'Centro',
            address: 'Calle 1',
            latitude: 4.8133,
            longitude: -75.6961,
            totalSlots: 10,
            availableSlots: 10,
            activeReservations: 0,
            hourlyRate: '3000.00',
            isActive: initialState,
            open24h: true,
            schedule: [],
        };

        getZone.mockResolvedValue({ data: { zone } });
        getAllZones.mockResolvedValue({ data: { zones: [zone] } });
        toggleZone.mockReset().mockResolvedValue({
            data: { zone: { ...zone, isActive: desiredState } },
        });

        render(
            <MemoryRouter initialEntries={[`/admin/zones/${zone.id}/edit`]}>
                <Routes>
                    <Route path="/admin/zones/:id/edit" element={<EditZone />} />
                </Routes>
            </MemoryRouter>,
        );

        await user.click(await screen.findByRole('button', { name: action }));
        const dialog = await screen.findByRole('alertdialog');
        expect(toggleZone).not.toHaveBeenCalled();

        await user.click(within(dialog).getByRole('button', { name: action }));
        expect(toggleZone).toHaveBeenCalledTimes(1);
        expect(toggleZone).toHaveBeenCalledWith(zone.id, desiredState);
    });
});
