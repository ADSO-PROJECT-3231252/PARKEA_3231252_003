import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Home from '../src/pages/Home';
import { AuthProvider } from '../src/context/AuthContext';
import { getReservations } from '../src/services/reservationService';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn() }));
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// #357: the "Reservas" card and the "Historial" list of the home say the day
// of the exit when a stay ends on another day, in Colombia time (UTC-5),
// whatever the time zone of the computer. "Now" is Monday 2026-11-16 at
// 10:00 a. m. in Colombia (15:00 UTC), and the stays are fixed instants, so
// the texts are the same in any time zone.
const NOW = new Date('2026-11-16T15:00:00.000Z');

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

beforeEach(() => {
    // Only the date is fixed; the timers of the screen run as always
    jest.useFakeTimers({
        now: NOW,
        doNotFake: ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback', 'cancelIdleCallback', 'performance', 'hrtime'],
    });
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'user-1', fullName: 'Laura Gómez', role: 'user' }));
    getReservations.mockReset();
    getZones.mockReset().mockResolvedValue({ data: { zones: [] } });
});

afterEach(() => {
    jest.useRealTimers();
});

describe('The dates of a stay that ends on another day, on the home, in Colombia time (#357)', () => {
    test.each([
        // 04:30 to 05:30 UTC of the 17th: in UTC it does not cross midnight
        ['crosses midnight only in Colombia', '2026-11-17T04:30:00.000Z', '2026-11-17T05:30:00.000Z', '16 de nov de 2026', '11:30 p. m. – 17 de nov, 12:30 a. m.'],
        // 23:00 UTC of the 16th to 01:00 UTC of the 17th: only UTC crosses it
        ['crosses midnight only in UTC', '2026-11-16T23:00:00.000Z', '2026-11-17T01:00:00.000Z', '16 de nov de 2026', '06:00 p. m. – 08:00 p. m.'],
        ['ends in the next year', '2027-01-01T04:00:00.000Z', '2027-01-01T05:30:00.000Z', '31 de dic de 2026', '11:00 p. m. – 01 de ene de 2027, 12:30 a. m.'],
    ])('the card of a stay that %s shows the day of the entry and the hours in Colombia', async (_case, start, end, day, hours) => {
        // Arrange
        answerLikeTheApi([reservation('next', 'Zona Noche', 'Active', start, end)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert
        expect(await within(reservas).findByText('Zona Noche')).toBeInTheDocument();
        expect(within(reservas).getByText(day)).toBeInTheDocument();
        expect(within(reservas).getByText(hours)).toBeInTheDocument();
    });

    test('an open stay shows the day and the time of its entry in Colombia, with no exit time', async () => {
        // Arrange: it started at 4:30 a. m. in Colombia, 09:30 UTC
        answerLikeTheApi([reservation('open', 'Zona Abierta', 'Active', '2026-11-16T09:30:00.000Z', null)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert
        expect(await within(reservas).findByText('04:30 a. m. · Sin hora de salida')).toBeInTheDocument();
        expect(within(reservas).getByText('16 de nov de 2026')).toBeInTheDocument();
    });

    test('an open stay that started late at night in Colombia shows that day, not the one of UTC', async () => {
        // Arrange: 11:00 p. m. of the 15th in Colombia, 04:00 UTC of the 16th
        answerLikeTheApi([reservation('open', 'Zona Abierta', 'Active', '2026-11-16T04:00:00.000Z', null)]);

        // Act
        renderHome();
        const reservas = await card('Reservas');

        // Assert
        expect(await within(reservas).findByText('11:00 p. m. · Sin hora de salida')).toBeInTheDocument();
        expect(within(reservas).getByText('15 de nov de 2026')).toBeInTheDocument();
    });

    test('the history gives each time its day when a stay crossed midnight in Colombia, and keeps the others in one line', async () => {
        // Arrange: three finished stays
        answerLikeTheApi([
            // 11:30 p. m. of the 14th to 12:30 a. m. of the 15th in Colombia
            reservation('night', 'Zona Noche', 'Finished', '2026-11-15T04:30:00.000Z', '2026-11-15T05:30:00.000Z'),
            // 6:00 to 8:00 p. m. of the 14th in Colombia (midnight only in UTC)
            reservation('evening', 'Zona Tarde', 'Finished', '2026-11-14T23:00:00.000Z', '2026-11-15T01:00:00.000Z'),
            // 9:00 to 11:00 a. m. of the 14th in Colombia
            reservation('day', 'Zona Día', 'Finished', '2026-11-14T14:00:00.000Z', '2026-11-14T16:00:00.000Z'),
        ]);

        // Act
        renderHome();
        const historial = await card('Historial');

        // Assert
        expect(await within(historial).findByText('Zona Noche')).toBeInTheDocument();
        expect(within(historial).getByText('14 de nov, 11:30 p. m. – 15 de nov, 12:30 a. m.')).toBeInTheDocument();
        expect(within(historial).getByText('14 de nov de 2026 · 06:00 p. m. – 08:00 p. m.')).toBeInTheDocument();
        expect(within(historial).getByText('14 de nov de 2026 · 09:00 a. m. – 11:00 a. m.')).toBeInTheDocument();
    });
});
