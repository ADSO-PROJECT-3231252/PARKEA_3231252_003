import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';
import { formatDate, formatTime } from '../src/utils/format';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// #357: the "Reservas" card and the "Historial" list of the home say the day
// of the exit when a stay ends on another day. The stays are built in the
// local time of the computer, the time the screen shows, `days` from today.
function localAt(days, hours, minutes = 0) {
    const today = new Date();
    return new Date(today.getFullYear(), today.getMonth(), today.getDate() + days, hours, minutes).toISOString();
}

const reservation = (id, zoneName, status, startTime, endTime) => ({
    id,
    status,
    startTime,
    endTime,
    spotNumber: 4,
    amount: '6000.00',
    zone: { name: zoneName, address: 'Calle 1 # 2-3' },
});

// Like the API: the latest start first, filtered by `status` and cut to `limit`
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

// The card of a heading ("Reservas" or "Historial"), so each check looks only inside it
const card = async (title) => (await screen.findByRole('heading', { name: title })).parentElement.parentElement;

// The text as a person reads it (the matchers turn the non-breaking spaces into spaces)
const time = (iso) => formatTime(iso);
// The day of a time, with the year only when the other end of the stay is in
// another year (a test that runs on December 31 or on January 1)
const dayOf = (iso, other) => (new Date(iso).getFullYear() === new Date(other).getFullYear()
    ? formatDate(iso).replace(/ de \d{4}$/, '')
    : formatDate(iso));

beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
    getReservations.mockReset();
    getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
});

describe('The dates of a stay that ends on another day, on the home (#357)', () => {
    test('the card of a stay that crosses midnight says the day of the exit', async () => {
        // Arrange: tomorrow from 10:00 p. m. to 1:30 a. m. of the next day
        const start = localAt(1, 22);
        const end = localAt(2, 1, 30);
        answerLikeTheApi([reservation('night', 'Zona Noche', 'Active', start, end)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert: the day of the entry stays on top, and the exit says its own day
        expect(await within(reservas).findByText('Zona Noche')).toBeInTheDocument();
        expect(within(reservas).getByText(formatDate(start))).toBeInTheDocument();
        expect(within(reservas).getByText(`${time(start)} – ${dayOf(end, start)}, ${time(end)}`)).toBeInTheDocument();
    });

    test('the card of a stay on one day looks as before', async () => {
        // Arrange: tomorrow from 10:00 a. m. to 12:00 p. m.
        const start = localAt(1, 10);
        const end = localAt(1, 12);
        answerLikeTheApi([reservation('day', 'Zona Día', 'Active', start, end)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert
        expect(await within(reservas).findByText('Zona Día')).toBeInTheDocument();
        expect(within(reservas).getByText(formatDate(start))).toBeInTheDocument();
        expect(within(reservas).getByText(`${time(start)} – ${time(end)}`)).toBeInTheDocument();
    });

    test('an open stay with no exit time yet still says so', async () => {
        // Arrange: it started one hour ago
        const start = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        answerLikeTheApi([reservation('open', 'Zona Abierta', 'Active', start, null)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert
        expect(await within(reservas).findByText(`${time(start)} · Sin hora de salida`)).toBeInTheDocument();
    });

    test('the history gives each time its day when a stay crossed midnight, and keeps the others as before', async () => {
        // Arrange: two days ago from 10:00 p. m. to 2:15 a. m., and three days ago from 9:00 to 11:00 a. m.
        const nightStart = localAt(-2, 22);
        const nightEnd = localAt(-1, 2, 15);
        const dayStart = localAt(-3, 9);
        const dayEnd = localAt(-3, 11);
        answerLikeTheApi([
            reservation('night', 'Zona Noche', 'Finished', nightStart, nightEnd),
            reservation('day', 'Zona Día', 'Finished', dayStart, dayEnd),
        ]);

        // Act
        renderHome();
        const historial = await card('Historial');

        // Assert
        expect(await within(historial).findByText('Zona Noche')).toBeInTheDocument();
        expect(within(historial).getByText(
            `${dayOf(nightStart, nightEnd)}, ${time(nightStart)} – ${dayOf(nightEnd, nightStart)}, ${time(nightEnd)}`,
        )).toBeInTheDocument();
        expect(within(historial).getByText(`${formatDate(dayStart)} · ${time(dayStart)} – ${time(dayEnd)}`)).toBeInTheDocument();
    });
});
