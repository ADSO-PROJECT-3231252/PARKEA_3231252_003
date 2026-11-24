import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ExtendStayDialog from '../src/components/ExtendStayDialog';
import Reservations from '../src/pages/Reservations';
import ReservationConfirmation from '../src/pages/ReservationConfirmation';
import { extendStay, getReservation, getReservations } from '../src/services/reservationService';
import { formatTime, keepTogether } from '../src/utils/format';

// The screens do not call the real API
jest.mock('../src/services/reservationService', () => ({
    getReservation: jest.fn(),
    getReservations: jest.fn(),
    extendStay: jest.fn(),
    cancelReservation: jest.fn(),
    finishStay: jest.fn(),
}));

// #375: the list and the detail of the reservations send spotFreeUntil:
// until when the spot of a stay is free after its exit time. The extend
// dialog offers only the exit times up to it from the start, instead of
// offering times that the API rejects with SPOT_RESERVED_LATER. "Now" is
// Monday 2026-11-16 at 11:00 a. m. in Colombia (UTC-5); the stay is from
// 10:00 a. m. to 12:00 p. m., and the next reservation of its spot starts at
// 4:00 p. m., so the spot is free until 3:50 p. m.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`).toISOString();
const NOW = new Date(colombia('11:00'));
const ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const FREE_UNTIL = colombia('15:50');

const STAY = {
    id: ID,
    status: 'Active',
    spotNumber: 4,
    startTime: colombia('10:00'),
    endTime: colombia('12:00'),
    durationHours: 2,
    holdExpiresAt: null,
    openEnded: false,
    openStay: null,
    latestEndTime: colombia('10:00').replace('16T', '17T'),
    spotFreeUntil: FREE_UNTIL,
    zone: { id: 'zone-1', name: 'Centro', address: 'Calle 1 # 2-3', hourlyRate: '2000.00', latitude: 4.81, longitude: -75.69 },
    vehicle: { id: 'vehicle-1', plate: 'ABC123', brand: 'Mazda', model: '2', color: 'Gris' },
    paymentSummary: { zoneName: 'Centro', spotNumber: 4, hourlyRate: 2000, durationHours: 2, estimatedTotal: 4000, paidTotal: 4000, extensions: 0 },
    // As the list sends it
    amount: 4000,
    amountType: 'paid',
    extensions: 0,
    appliedHourlyRate: 2000,
    paymentStatus: 'Paid',
};

// A time inside the name of the dialog keeps its spaces together
const timeInName = (iso) => keepTogether(formatTime(iso));

function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderDialog(reservation) {
    render(
        <MemoryRouter initialEntries={[`/reservations/${ID}`]}>
            <Routes>
                <Route
                    path="/reservations/:id"
                    element={(
                        <ExtendStayDialog
                            reservation={reservation}
                            hourlyRate="2000.00"
                            paid={4000}
                            openedAt={NOW.getTime()}
                            onClose={jest.fn()}
                            onExtended={jest.fn()}
                        />
                    )}
                />
                <Route path="/reservations/:id/payment" element={<Where />} />
            </Routes>
        </MemoryRouter>,
    );
}

const choice = () => screen.getByLabelText('Nueva hora de salida');
const optionValues = () => [...choice().querySelectorAll('option')].map((option) => option.value);

beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('The extend dialog with spotFreeUntil (#375)', () => {
    test('offers only the exit times until the spot is free, without an open stay, and says why', () => {
        // Act
        renderDialog(STAY);

        // Assert: each hour and then 3:50 p. m.
        expect(optionValues()).toEqual([colombia('13:00'), colombia('14:00'), colombia('15:00'), FREE_UNTIL]);
        expect(choice()).toHaveValue(colombia('13:00'));
        expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
            new RegExp(`Puedes ampliarla hasta las ${timeInName(FREE_UNTIL)}, porque después tu cupo tiene otra reserva, y conservas el mismo cupo \\(4\\)\\.$`),
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
    });

    test('the last time goes to the payment of that extension, and nothing is asked before', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDialog(STAY);

        // Act
        await user.selectOptions(choice(), FREE_UNTIL);
        await user.click(screen.getByRole('button', { name: 'Continuar al pago' }));

        // Assert
        const params = new URLSearchParams({ extendTo: FREE_UNTIL, from: STAY.endTime });
        expect(screen.getByTestId('where')).toHaveTextContent(`/reservations/${ID}/payment?${params}`);
        expect(extendStay).not.toHaveBeenCalled();
    });

    test('a spot taken right after the exit time leaves nothing to choose, and the dialog says why', () => {
        // Act: the next reservation starts 10 minutes after the exit
        renderDialog({ ...STAY, spotFreeUntil: STAY.endTime });

        // Assert: it is information, not an error
        expect(screen.queryByLabelText('Nueva hora de salida')).not.toBeInTheDocument();
        expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
            /\.\sTu cupo tiene otra reserva poco después de tu salida, así que esta estadía no se puede ampliar\.$/,
        );
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
    });

    test('without spotFreeUntil it offers up to 24 hours and the open stay, as before', () => {
        // Act
        renderDialog({ ...STAY, spotFreeUntil: null });

        // Assert: from 1:00 p. m. to 10:00 a. m. of Tuesday, and the open stay
        const values = optionValues();
        expect(values).toHaveLength(23);
        expect(values.at(0)).toBe(colombia('13:00'));
        expect(values.at(-2)).toBe(STAY.latestEndTime);
        expect(values.at(-1)).toBe('open');
        expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(/Puedes ampliarla hasta 24 horas desde la entrada y conservas el mismo cupo \(4\)\.$/);
    });

    test('a reservation sent without the field (an API from before #375) also works as before', () => {
        // Arrange
        const withoutField = { ...STAY };
        delete withoutField.spotFreeUntil;

        // Act
        renderDialog(withoutField);

        // Assert
        expect(optionValues()).toContain('open');
    });
});

describe('The dialog takes spotFreeUntil from the screen that opens it (#375)', () => {
    test('"Mis reservas"', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        getReservations.mockResolvedValue({ data: { reservations: [STAY], pagination: { page: 1, limit: 10, total: 1, totalPages: 1 } } });
        render(<MemoryRouter><Reservations /></MemoryRouter>);

        // Act: the list shows each reservation twice (the table and the cards)
        await user.click((await screen.findAllByRole('button', { name: /^Ampliar la estadía/ }))[0]);

        // Assert
        const dialog = screen.getByRole('alertdialog');
        expect([...within(dialog).getByLabelText('Nueva hora de salida').querySelectorAll('option')].map((o) => o.value))
            .toEqual([colombia('13:00'), colombia('14:00'), colombia('15:00'), FREE_UNTIL]);
    });

    test('the detail of the reservation', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        getReservation.mockResolvedValue({ data: { reservation: STAY } });
        render(
            <MemoryRouter initialEntries={[`/reservations/${ID}`]}>
                <Routes>
                    <Route path="/reservations/:id" element={<ReservationConfirmation />} />
                </Routes>
            </MemoryRouter>,
        );

        // Act
        await user.click(await screen.findByRole('button', { name: /Ampliar estadía/ }));

        // Assert
        const dialog = screen.getByRole('alertdialog');
        expect([...within(dialog).getByLabelText('Nueva hora de salida').querySelectorAll('option')].map((o) => o.value))
            .toEqual([colombia('13:00'), colombia('14:00'), colombia('15:00'), FREE_UNTIL]);
    });
});
