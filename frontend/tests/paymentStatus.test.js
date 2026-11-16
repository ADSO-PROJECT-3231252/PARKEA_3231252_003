import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import Reservations from '../src/pages/Reservations';
import { getReservations } from '../src/services/reservationService';
import { paymentLabelOf } from '../src/utils/paymentStatus';

// HU-18 AC-02: the payment status shown for each reservation in "Mis reservas"
jest.mock('../src/services/reservationService', () => ({
    getReservations: jest.fn(),
}));

const reservation = (status, paymentStatus, values = {}) => ({ status, paymentStatus, ...values });

describe('paymentLabelOf (HU-18 AC-02, #349)', () => {
    test.each([
        ['Cancelled', 'Sin pago'],
        ['Expired', 'Sin pago'],
    ])('a reservation %s before it was paid has no payment: "%s"', (status, label) => {
        expect(paymentLabelOf(reservation(status, 'Pending'))).toBe(label);
    });

    test('a reservation that waits for its payment is "Pendiente"', () => {
        expect(paymentLabelOf(reservation('Pending', 'Pending'))).toBe('Pendiente');
    });

    test.each([
        ['Active', 'Paid', 'Pagado'],
        ['Finished', 'Paid', 'Pagado'],
        ['Cancelled', 'Refunded', 'Reembolsado'],
    ])('a reservation %s with its payment %s is "%s"', (status, paymentStatus, label) => {
        expect(paymentLabelOf(reservation(status, paymentStatus))).toBe(label);
    });

    test('an open stay that ended with a balance to pay is "Saldo pendiente" (HU-27)', () => {
        const stay = reservation('Finished', 'Paid', { openStay: { pendingBalance: 4000 } });
        expect(paymentLabelOf(stay)).toBe('Saldo pendiente');
    });

    test('an unknown payment status is shown as it comes', () => {
        expect(paymentLabelOf(reservation('Active', 'Other'))).toBe('Other');
    });
});

describe('"Mis reservas" (HU-18 AC-02, #349)', () => {
    test('a cancelled reservation that was never paid says "Pago: Sin pago", not "Pendiente"', async () => {
        // Arrange
        getReservations.mockResolvedValue({
            data: {
                reservations: [{
                    id: 'b51f1a36-5e94-401b-a1d3-0e790da96a4f',
                    status: 'Cancelled',
                    paymentStatus: 'Pending',
                    startTime: '2026-11-16T15:10:00.000Z',
                    endTime: '2026-11-16T17:10:00.000Z',
                    zone: { name: 'Centro' },
                    vehicle: { plate: 'LAU316', brand: 'Mazda', model: '3' },
                    amount: 4000,
                    amountType: 'estimated',
                    extensions: 0,
                    appliedHourlyRate: 2000,
                }],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            },
        });

        // Act
        render(<MemoryRouter><Reservations /></MemoryRouter>);

        // Assert: the table and the card of the reservation say the same
        expect(await screen.findAllByText('Pago: Sin pago')).toHaveLength(2);
        expect(screen.queryByText('Pago: Pendiente')).not.toBeInTheDocument();
    });
});
