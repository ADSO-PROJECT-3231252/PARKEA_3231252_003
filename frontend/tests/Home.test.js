import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

const HOUR = 60 * 60 * 1000;
const at = (hours) => new Date(Date.now() + hours * HOUR).toISOString();

const reservation = (id, zoneName, status, startHours, endHours) => ({
    id,
    status,
    startTime: at(startHours),
    endTime: endHours === null ? null : at(endHours),
    spotNumber: 4,
    amount: '6000.00',
    zone: { name: zoneName, address: 'Calle 1 # 2-3' },
});

// The fake list answers like the API does: the latest start first, filtered by
// `status` and cut to `limit`. So a screen that asks for the wrong list shows
// the wrong reservation, and the tests below fail.
const answerLikeTheApi = (all) => {
    getReservations.mockImplementation(({ status, limit = 10 } = {}) => {
        const rows = all
            .filter((r) => !status || r.status === status)
            .sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
        return Promise.resolve({ data: { reservations: rows.slice(0, limit) } });
    });
};

const renderHome = () => render(
    <MemoryRouter>
        <AuthProvider>
            <Home />
        </AuthProvider>
    </MemoryRouter>,
);

// The history card also lists finished stays, so the checks look only inside this card
const reservationsCard = async () => (await screen.findByText('Tus reservas')).parentElement;

describe('Reservation card of the home (#306)', () => {
    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
        getReservations.mockReset();
        getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
    });

    test('with a stay running now and another one tomorrow, the card shows the one running', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Mañana', 'Active', 24, 26),
            reservation('running', 'Zona Corriendo', 'Active', -1, 2),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Corriendo')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Mañana')).not.toBeInTheDocument();
    });

    test('an open stay with no exit time yet is shown as the one running', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('tomorrow', 'Zona Mañana', 'Active', 24, 26),
            reservation('open', 'Zona Abierta', 'Active', -3, null),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Abierta')).toBeInTheDocument();
        expect(within(card).getByText(/Sin hora de salida/)).toBeInTheDocument();
        expect(within(card).queryByText('Zona Mañana')).not.toBeInTheDocument();
    });

    test('a new pending reservation and an old finished one: the card shows the pending one', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('old', 'Zona Vieja', 'Finished', -40, -38),
            reservation('pending', 'Zona Pendiente', 'Pending', 2, 4),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).getByText('Pendiente de pago')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Vieja')).not.toBeInTheDocument();
    });

    test('a pending reservation whose start time already passed is still shown (it can be paid until it expires)', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('old', 'Zona Vieja', 'Finished', -40, -38),
            reservation('pending', 'Zona Pendiente', 'Pending', -0.1, 1),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Pendiente')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Vieja')).not.toBeInTheDocument();
    });

    test('with nothing running or coming, the card shows the last finished one, not a newer cancelled one', async () => {
        // Arrange
        answerLikeTheApi([
            reservation('finished', 'Zona Finalizada', 'Finished', -40, -38),
            reservation('cancelled', 'Zona Cancelada', 'Cancelled', -5, -3),
        ]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Zona Finalizada')).toBeInTheDocument();
        expect(within(card).queryByText('Zona Cancelada')).not.toBeInTheDocument();
    });

    test('with no reservations, the card says so', async () => {
        // Arrange
        answerLikeTheApi([]);
        // Act
        renderHome();
        const card = await reservationsCard();
        // Assert
        expect(await within(card).findByText('Aún no tienes reservas registradas.')).toBeInTheDocument();
    });
});
