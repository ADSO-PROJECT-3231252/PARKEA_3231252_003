import { act, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReservationConfirmation from '../src/pages/ReservationConfirmation';
import { getReservation } from '../src/services/reservationService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservation: jest.fn(), cancelReservation: jest.fn() }));

// #347: at 00:00 the reservation screen hides "Ir al pago" and "Cancelar
// reserva". "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (UTC-5).
const NOW = new Date('2026-11-16T08:00:00-05:00').getTime();
const MINUTE = 60 * 1000;
const at = (ms) => new Date(NOW + ms).toISOString();
const ID = 'aaaaaaaa-1111-4111-8111-111111111111';

// A reservation as GET /reservations/:id sends it: Pending, from 10:00 a. m.
// to 12:00 p. m., made at 7:55 a. m., so its 15 minutes to pay end at 8:10 a. m.
const reservation = (values = {}) => ({
    id: ID,
    status: 'Pending',
    spotNumber: 4,
    startTime: at(2 * 60 * MINUTE),
    endTime: at(4 * 60 * MINUTE),
    durationHours: 2,
    holdExpiresAt: at(10 * MINUTE),
    openEnded: false,
    latestEndTime: at(4 * 60 * MINUTE),
    openStay: null,
    zone: { id: 'zone-1', name: 'Centro', address: 'Calle 1 # 2-3', hourlyRate: '2000.00', latitude: 4.81, longitude: -75.69 },
    vehicle: { id: 'vehicle-1', plate: 'ABC123', brand: 'Mazda', model: '2', color: 'Gris' },
    paymentSummary: {
        zoneName: 'Centro',
        spotNumber: 4,
        hourlyRate: 2000,
        durationHours: 2,
        estimatedTotal: 4000,
        paidTotal: 0,
        extensions: 0,
    },
    ...values,
});

const answer = (values) => getReservation.mockResolvedValue({ data: { reservation: reservation(values) } });

const renderScreen = () => render(
    <MemoryRouter initialEntries={[`/reservations/${ID}`]}>
        <Routes>
            <Route path="/reservations/:id" element={<ReservationConfirmation />} />
        </Routes>
    </MemoryRouter>,
);

const payLink = () => screen.queryByRole('link', { name: 'Ir al pago' });
const cancelButton = () => screen.queryByRole('button', { name: 'Cancelar reserva' });

// Moves the clock, runs the timers that were due and lets the answers they
// asked for arrive
const wait = (ms) => act(async () => {
    jest.advanceTimersByTime(ms);
});

beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    getReservation.mockReset();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('The reservation screen when the 15 minutes to pay end (#347)', () => {
    test('"Ir al pago" and "Cancelar reserva" are shown while they last and disappear at 00:00', async () => {
        // Arrange
        answer();
        renderScreen();
        expect(await screen.findByRole('link', { name: 'Ir al pago' })).toBeInTheDocument();
        expect(cancelButton()).toBeInTheDocument();

        // Act: one second before the end, they are still there
        await wait(10 * MINUTE - 1000);
        expect(payLink()).toBeInTheDocument();
        expect(cancelButton()).toBeInTheDocument();
        expect(screen.getByText('Pendiente de pago')).toBeInTheDocument();
        expect(screen.getByText('Total a pagar')).toBeInTheDocument();

        // Act: the counter reaches 00:00
        await wait(1000);

        // Assert
        expect(screen.getByText('Tiempo agotado')).toBeInTheDocument();
        expect(payLink()).not.toBeInTheDocument();
        expect(cancelButton()).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver mis reservas' })).toBeInTheDocument();
        // It already shows as expired, like in "Mis reservas"
        expect(screen.getByText('Expirada')).toBeInTheDocument();
        expect(screen.queryByText('Pendiente de pago')).not.toBeInTheDocument();
        expect(screen.getByText('Total de la reserva')).toBeInTheDocument();
        expect(screen.queryByText('Total a pagar')).not.toBeInTheDocument();
    });

    test('an open stay waiting for payment shows like an expired one at 00:00', async () => {
        // Arrange: no exit time, the first hour to pay, at the latest until midnight
        answer({ endTime: null, openEnded: true, latestEndTime: at(16 * 60 * MINUTE) });
        renderScreen();
        expect(await screen.findByText('Primera hora a pagar')).toBeInTheDocument();
        expect(screen.getAllByText('Tiempo indefinido')).toHaveLength(2);
        expect(screen.getByText(/^Termina a más tardar/)).toBeInTheDocument();
        expect(screen.getByText(/^Se cobra/)).toBeInTheDocument();

        // Act: the counter reaches 00:00
        await wait(10 * MINUTE);

        // Assert: like a reservation the job already marked Expired
        expect(screen.getByText('Expirada')).toBeInTheDocument();
        expect(screen.getByText('Total de la reserva')).toBeInTheDocument();
        expect(screen.queryByText('Primera hora a pagar')).not.toBeInTheDocument();
        expect(screen.queryAllByText('Tiempo indefinido')).toHaveLength(0);
        expect(screen.queryByText(/^Termina a más tardar/)).not.toBeInTheDocument();
        expect(screen.queryByText(/^Se cobra/)).not.toBeInTheDocument();
    });

    test('while the job has not marked it Expired, the buttons stay hidden', async () => {
        // Arrange: the backend keeps answering Pending for a while
        answer({ holdExpiresAt: at(-MINUTE) });
        renderScreen();
        expect(await screen.findByText('Tiempo agotado')).toBeInTheDocument();

        // Act: the screen asks again every few seconds
        await wait(12 * 1000);

        // Assert
        expect(getReservation.mock.calls.length).toBeGreaterThan(1);
        expect(payLink()).not.toBeInTheDocument();
        expect(cancelButton()).not.toBeInTheDocument();
    });

    test('once the job marks it Expired, the screen shows it, still without the buttons', async () => {
        // Arrange
        answer({ holdExpiresAt: at(-MINUTE) });
        renderScreen();
        expect(await screen.findByText('Tiempo agotado')).toBeInTheDocument();

        // Act
        answer({ status: 'Expired', holdExpiresAt: at(-MINUTE) });
        await wait(6 * 1000);

        // Assert
        expect(await screen.findByText('Expirada')).toBeInTheDocument();
        expect(payLink()).not.toBeInTheDocument();
        expect(cancelButton()).not.toBeInTheDocument();
    });
});

describe('Keyboard focus when the reservation countdown ends (#361)', () => {
    test.each([
        ['link', 'Ir al pago'],
        ['button', 'Cancelar reserva'],
    ])('focuses the expired status when the focused %s "%s" disappears', async (role, name) => {
        // Arrange
        answer();
        renderScreen();
        const action = await screen.findByRole(role, { name });
        await wait(10 * MINUTE - 1000);
        action.focus();
        expect(action).toHaveFocus();

        // Act
        await wait(1000);

        // Assert
        expect(action).not.toBeInTheDocument();
        expect(screen.getByText('Expirada')).toHaveFocus();
    });
});
