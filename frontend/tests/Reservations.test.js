import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reservations from '../src/pages/Reservations';
import { getReservations } from '../src/services/reservationService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservations: jest.fn(), cancelReservation: jest.fn() }));

// #347: "Mis reservas" hides "Pagar" and "Cancelar" of a Pending reservation
// when its 15 minutes to pay end, without reloading the page. "Now" is
// Monday 2026-11-16 at 8:00 a. m. in Colombia (UTC-5).
const NOW = new Date('2026-11-16T08:00:00-05:00').getTime();
const MINUTE = 60 * 1000;
const at = (ms) => new Date(NOW + ms).toISOString();

// A reservation of the list, as GET /reservations sends it. The list shows
// each one twice (the table from lg up and the cards below), so every
// button is found twice.
const row = (id, zoneName, values) => ({
    id,
    spotNumber: 4,
    startTime: at(2 * 60 * MINUTE),
    endTime: at(4 * 60 * MINUTE),
    openEnded: false,
    openStay: null,
    zone: { id: 'zone-1', name: zoneName, address: 'Calle 1 # 2-3' },
    vehicle: { id: 'vehicle-1', plate: 'ABC123', brand: 'Mazda', model: '2', color: 'Gris' },
    amount: 4000,
    amountType: 'estimated',
    extensions: 0,
    appliedHourlyRate: 2000,
    paymentStatus: 'Pending',
    holdExpiresAt: null,
    ...values,
});

// Pending, made at 7:55 a. m.: its 15 minutes to pay end at 8:10 a. m.
const pending = row('aaaaaaaa-1111-4111-8111-111111111111', 'Zona Pendiente', {
    status: 'Pending',
    holdExpiresAt: at(10 * MINUTE),
});
// Paid, from 10:00 a. m.: it can be cancelled until then
const paid = row('bbbbbbbb-2222-4222-8222-222222222222', 'Zona Pagada', {
    status: 'Active',
    amountType: 'paid',
    paymentStatus: 'Paid',
});

const answer = (reservations) => {
    getReservations.mockResolvedValue({
        data: { reservations, pagination: { page: 1, limit: 10, total: reservations.length, totalPages: 1 } },
    });
};

const renderList = () => render(
    <MemoryRouter>
        <Reservations />
    </MemoryRouter>,
);

const buttons = (name) => screen.queryAllByRole('button', { name });
const PAY_PENDING = 'Pagar la reserva AAAAAAAA en Zona Pendiente';
const CANCEL_PENDING = 'Cancelar la reserva AAAAAAAA en Zona Pendiente';
const DETAIL_PENDING = 'Ver detalle de la reserva AAAAAAAA en Zona Pendiente';
const CANCEL_PAID = 'Cancelar la reserva BBBBBBBB en Zona Pagada';

// Moves the clock, runs the timers that were due and lets the answers they
// asked for arrive
const wait = (ms) => act(async () => {
    jest.advanceTimersByTime(ms);
});

beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    getReservations.mockReset();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('"Mis reservas" when the 15 minutes to pay end (#347)', () => {
    test('"Pagar" and "Cancelar" are shown while they last and disappear at 00:00, without reloading', async () => {
        // Arrange
        answer([pending, paid]);
        renderList();
        expect(await screen.findAllByRole('button', { name: PAY_PENDING })).toHaveLength(2);
        expect(buttons(CANCEL_PENDING)).toHaveLength(2);

        // Act: one second before the end, they are still there
        await wait(10 * MINUTE - 1000);
        expect(buttons(PAY_PENDING)).toHaveLength(2);
        expect(buttons(CANCEL_PENDING)).toHaveLength(2);

        // Act: the 15 minutes end
        await wait(1000 + 100);

        // Assert
        expect(buttons(PAY_PENDING)).toHaveLength(0);
        expect(buttons(CANCEL_PENDING)).toHaveLength(0);
        expect(buttons(DETAIL_PENDING)).toHaveLength(2);
        // The paid reservation does not change: it starts at 10:00 a. m.
        expect(buttons(CANCEL_PAID)).toHaveLength(2);
        // The list was not asked again
        expect(getReservations).toHaveBeenCalledTimes(1);
    });

    test('a Pending reservation whose 15 minutes already ended shows neither of them when the list loads', async () => {
        // Arrange: the job has not marked it Expired yet
        answer([{ ...pending, holdExpiresAt: at(-MINUTE) }]);

        // Act
        renderList();

        // Assert
        expect(await screen.findAllByRole('button', { name: DETAIL_PENDING })).toHaveLength(2);
        expect(buttons(PAY_PENDING)).toHaveLength(0);
        expect(buttons(CANCEL_PENDING)).toHaveLength(0);
    });

    test('at that very moment they are no longer shown, like the backend answers', async () => {
        // Arrange
        answer([{ ...pending, holdExpiresAt: at(0) }]);

        // Act
        renderList();

        // Assert
        expect(await screen.findAllByRole('button', { name: DETAIL_PENDING })).toHaveLength(2);
        expect(buttons(PAY_PENDING)).toHaveLength(0);
        expect(buttons(CANCEL_PENDING)).toHaveLength(0);
    });

    test('without holdExpiresAt (a backend before #347) the buttons stay: the backend decides', async () => {
        // Arrange
        answer([{ ...pending, holdExpiresAt: undefined }]);

        // Act
        renderList();

        // Assert
        expect(await screen.findAllByRole('button', { name: PAY_PENDING })).toHaveLength(2);
        expect(buttons(CANCEL_PENDING)).toHaveLength(2);
    });
});
