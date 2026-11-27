import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import PayReservation from '../src/pages/PayReservation';
import { getReservation } from '../src/services/reservationService';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservation: jest.fn(), extendStay: jest.fn() }));
jest.mock('../src/services/paymentService', () => ({ payReservation: jest.fn(), payBalance: jest.fn() }));

// HU-31 AC-03: the spots are numbered per type, so the payment shows the spot
// with its type, as GET /reservations/:id sends it (spotVehicleType). A
// Pending reservation of tomorrow, with its 15 minutes to pay.
const ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const HOUR = 60 * 60 * 1000;
const at = (ms) => new Date(Date.now() + ms).toISOString();
const reservation = (values) => ({
    id: ID,
    status: 'Pending',
    spotNumber: 3,
    startTime: at(24 * HOUR),
    endTime: at(26 * HOUR),
    durationHours: 2,
    holdExpiresAt: at(HOUR / 4),
    openEnded: false,
    latestEndTime: null,
    zone: { id: 'zone-1', name: 'Centro', address: 'Calle 1 # 2-3' },
    vehicle: { id: 'vehicle-1', plate: 'ABC12D', brand: 'Yamaha', model: 'FZ', color: 'Negro' },
    paymentSummary: { zoneName: 'Centro', spotNumber: 3, hourlyRate: 1500, durationHours: 2, estimatedTotal: 3000, paidTotal: 0, extensions: 0 },
    ...values,
});

function renderPayment(values) {
    getReservation.mockResolvedValue({ data: { reservation: reservation(values) } });
    render(
        <MemoryRouter initialEntries={[`/reservations/${ID}/payment`]}>
            <Routes>
                <Route path="/reservations/:id/payment" element={<PayReservation />} />
            </Routes>
        </MemoryRouter>,
    );
}

// The value of a line of the summary, by its name
const valueOf = async (label) => (await screen.findByText(label)).nextElementSibling;

beforeEach(() => getReservation.mockReset());

describe('The spot on the payment screen (HU-31 AC-03)', () => {
    test('is shown with its type', async () => {
        // Act
        renderPayment({ spotVehicleType: 'motorcycle' });

        // Assert
        expect(await valueOf('Cupo asignado')).toHaveTextContent(/^3 · Moto$/);
    });

    test('without its type, only its number', async () => {
        // Act
        renderPayment({ spotVehicleType: null });

        // Assert
        expect(await valueOf('Cupo asignado')).toHaveTextContent(/^3$/);
    });
});
