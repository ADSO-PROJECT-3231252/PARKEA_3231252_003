import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import PayReservation from '../src/pages/PayReservation';
import ExtendStayDialog from '../src/components/ExtendStayDialog';
import { extendStay, getReservation } from '../src/services/reservationService';
import { formatCurrency, formatDate, formatTime, keepTogether } from '../src/utils/format';

// The screen does not call the real API
jest.mock('../src/services/reservationService', () => ({ getReservation: jest.fn(), extendStay: jest.fn() }));
jest.mock('../src/services/paymentService', () => ({ payReservation: jest.fn(), payBalance: jest.fn() }));

// #373: a stay never changes spot. When the time added reaches another
// reservation of the spot, the API answers 409 SPOT_RESERVED_LATER with
// freeUntil, and charges nothing. "Now" is Monday 2026-11-16 at 11:00 a. m.
// in Colombia (UTC-5); the stay is from 10:00 a. m. to 12:00 p. m., and the
// next reservation of its spot starts at 4:00 p. m.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`).toISOString();
const NOW = new Date(colombia('11:00'));
const ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const FREE_UNTIL = colombia('15:50');
const PROCESSING_MS = 3000;

const RESERVATION = {
    id: ID,
    status: 'Active',
    spotNumber: 4,
    startTime: colombia('10:00'),
    endTime: colombia('12:00'),
    durationHours: 2,
    holdExpiresAt: null,
    openEnded: false,
    latestEndTime: null,
    zone: { id: 'zone-1', name: 'Centro', address: 'Calle 1 # 2-3', hourlyRate: '2000.00' },
    vehicle: { id: 'vehicle-1', plate: 'ABC123', brand: 'Mazda', model: '2', color: 'Gris' },
    paymentSummary: { zoneName: 'Centro', spotNumber: 4, hourlyRate: 2000, durationHours: 2, estimatedTotal: 4000, paidTotal: 4000, extensions: 0 },
};

// Spanish texts of the screen, built like the screen builds them, so the
// tests do not depend on the time zone of the computer. A time inside a
// sentence keeps its spaces together: the text matchers read them as spaces,
// the names of the buttons do not.
const time = (iso) => formatTime(iso).replace(/\s/g, ' ');
const timeInName = (iso) => keepTogether(formatTime(iso));
const payButton = (amount) => screen.getByRole('button', { name: `Confirmar pago ${formatCurrency(amount)}` });

function Where() {
    const location = useLocation();
    return <p data-testid="where">{location.pathname + location.search}</p>;
}

function renderPayment(extendTo) {
    getReservation.mockResolvedValue({ data: { reservation: RESERVATION } });
    const params = new URLSearchParams({ extendTo, from: RESERVATION.endTime });
    render(
        <MemoryRouter initialEntries={[`/reservations/${ID}/payment?${params}`]}>
            <Routes>
                <Route path="/reservations/:id/payment" element={<><PayReservation /><Where /></>} />
                <Route path="/reservations/:id" element={<p>Reserva</p>} />
            </Routes>
        </MemoryRouter>,
    );
}

// The payment takes PROCESSING_MS at least, so the clock is moved
async function pay(user, amount) {
    await user.click(payButton(amount));
    await act(async () => {
        await jest.advanceTimersByTimeAsync(PROCESSING_MS);
    });
}

const spotReservedLater = (freeUntil) => ({ response: { status: 409, data: { code: 'SPOT_RESERVED_LATER', message: '…', freeUntil } } });

beforeEach(() => {
    jest.useFakeTimers({ now: NOW });
    jest.clearAllMocks();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('Paying an extension that reaches the next reservation of the spot (#375)', () => {
    test('says until when the spot is free, and offers to extend until then', async () => {
        // Arrange: from 12:00 p. m. to 6:00 p. m.
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce(spotReservedLater(FREE_UNTIL));
        renderPayment(colombia('18:00'));
        await screen.findByText('Ampliar estadía');

        // Act
        await pay(user, 12000);

        // Assert: nothing charged, the time the spot is free, and the way on
        expect(screen.getByRole('alert')).toHaveTextContent(
            `Tu cupo tiene otra reserva más tarde. Puedes ampliar hasta las ${time(FREE_UNTIL)}`,
        );
        expect(payButton(12000)).toBeDisabled();
        expect(screen.getByRole('button', { name: 'Volver a la reserva' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: `Ampliar hasta las ${timeInName(FREE_UNTIL)}` })).toBeEnabled();
    });

    test('changing the payment method after it keeps the message and the way on', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce(spotReservedLater(FREE_UNTIL));
        renderPayment(colombia('18:00'));
        await screen.findByText('Ampliar estadía');
        await pay(user, 12000);

        // Act: the other payment method
        await user.click(screen.getByRole('radio', { name: /PSE/ }));

        // Assert: the payment button stays disabled, so its reason and the
        // way on stay too
        expect(payButton(12000)).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent(
            `Tu cupo tiene otra reserva más tarde. Puedes ampliar hasta las ${time(FREE_UNTIL)}`,
        );
        expect(screen.getByRole('button', { name: `Ampliar hasta las ${timeInName(FREE_UNTIL)}` })).toBeEnabled();
    });

    test('extending until then shows the new exit and amount, and pays them', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce(spotReservedLater(FREE_UNTIL)).mockResolvedValueOnce({ data: {} });
        renderPayment(colombia('18:00'));
        await screen.findByText('Ampliar estadía');
        await pay(user, 12000);

        // Act: until 3:50 p. m., 3 hours and 50 minutes, charged as 4
        await user.click(screen.getByRole('button', { name: `Ampliar hasta las ${timeInName(FREE_UNTIL)}` }));

        // Assert: the new exit time and amount, ready to pay
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.getByText(`${formatDate(FREE_UNTIL)}, ${formatTime(FREE_UNTIL)}`)).toBeInTheDocument();
        expect(payButton(8000)).toBeEnabled();
        expect(payButton(8000)).toHaveFocus();
        expect(screen.getByRole('button', { name: 'Cancelar pago' })).toBeInTheDocument();
        expect(screen.getByTestId('where')).toHaveTextContent(`extendTo=${encodeURIComponent(FREE_UNTIL)}`);

        // Act: pay
        await pay(user, 8000);

        // Assert
        expect(extendStay).toHaveBeenLastCalledWith(ID, expect.objectContaining({ fromEndTime: RESERVATION.endTime, newEndTime: FREE_UNTIL }));
        expect(screen.getByText('Pago aprobado. Estadía ampliada')).toBeInTheDocument();
    });

    test('when the spot is not free after the exit time, the stay cannot be extended', async () => {
        // Arrange: the next reservation starts at 12:05 p. m.
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce(spotReservedLater(colombia('11:55')));
        renderPayment(colombia('14:00'));
        await screen.findByText('Ampliar estadía');

        // Act
        await pay(user, 4000);

        // Assert
        expect(screen.getByRole('alert')).toHaveTextContent(
            'Tu cupo tiene otra reserva poco después de tu salida, así que esta estadía no se puede ampliar',
        );
        expect(payButton(4000)).toBeDisabled();
        expect(screen.queryByRole('button', { name: /^Ampliar hasta/ })).not.toBeInTheDocument();
    });

    test('without freeUntil it gives the general text and no way on', async () => {
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce(spotReservedLater(undefined));
        renderPayment(colombia('14:00'));
        await screen.findByText('Ampliar estadía');

        await pay(user, 4000);

        expect(screen.getByRole('alert')).toHaveTextContent(
            'Tu cupo tiene otra reserva más tarde, así que no se puede ampliar hasta esa hora. Elige una hora de salida más temprana',
        );
        expect(payButton(4000)).toBeDisabled();
        expect(screen.queryByRole('button', { name: /^Ampliar hasta/ })).not.toBeInTheDocument();
    });
});

describe('Switching to an open stay when the spot has a later reservation (#375)', () => {
    function renderDialog() {
        render(
            <MemoryRouter initialEntries={[`/reservations/${ID}`]}>
                <Routes>
                    <Route
                        path="/reservations/:id"
                        element={
                            <ExtendStayDialog
                                reservation={RESERVATION}
                                hourlyRate="2000.00"
                                paid={4000}
                                openedAt={NOW.getTime()}
                                onClose={jest.fn()}
                                onExtended={jest.fn()}
                            />
                        }
                    />
                    <Route path="/reservations/:id/payment" element={<Where />} />
                </Routes>
            </MemoryRouter>,
        );
    }

    const choice = () => screen.getByLabelText('Nueva hora de salida');
    const optionValues = () => [...choice().querySelectorAll('option')].map((option) => option.value);

    async function switchToOpenStay(user, freeUntil) {
        extendStay.mockRejectedValueOnce(spotReservedLater(freeUntil));
        await user.selectOptions(choice(), 'open');
        await user.click(screen.getByRole('button', { name: 'Cambiar a tiempo indefinido' }));
        return screen.findByRole('alert');
    }

    test('only the exit times before the next reservation are left, and no open stay', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDialog();
        expect(optionValues()).toContain('open');

        // Act
        const alert = await switchToOpenStay(user, FREE_UNTIL);

        // Assert: the reason, the times left (each hour and then 3:50 p. m.)
        // and what the dialog says now
        expect(alert).toHaveTextContent(
            'Tu cupo tiene otra reserva más tarde, así que esta reserva no puede quedar en tiempo indefinido. ' +
            `Puedes ampliarla hasta las ${time(FREE_UNTIL)}`,
        );
        expect(optionValues()).toEqual([colombia('13:00'), colombia('14:00'), colombia('15:00'), FREE_UNTIL]);
        expect(choice()).toHaveValue(colombia('13:00'));
        expect(screen.getByRole('alertdialog')).toHaveAccessibleDescription(
            new RegExp(`Puedes ampliarla hasta las ${timeInName(FREE_UNTIL)}, porque después tu cupo tiene otra reserva, y conservas el mismo cupo \\(4\\)\\.$`),
        );
        expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeEnabled();
    });

    test('the last time left goes to the payment of that extension', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDialog();
        await switchToOpenStay(user, FREE_UNTIL);

        // Act
        await user.selectOptions(choice(), FREE_UNTIL);
        await user.click(screen.getByRole('button', { name: 'Continuar al pago' }));

        // Assert
        const params = new URLSearchParams({ extendTo: FREE_UNTIL, from: RESERVATION.endTime });
        expect(screen.getByTestId('where')).toHaveTextContent(`/reservations/${ID}/payment?${params}`);
    });

    test('when the spot is not free after the exit time, nothing is left to choose', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        renderDialog();

        // Act
        const alert = await switchToOpenStay(user, colombia('11:55'));

        // Assert
        expect(alert).toHaveTextContent(
            'Tu cupo tiene otra reserva poco después de tu salida, así que esta estadía no se puede ampliar',
        );
        expect(screen.queryByLabelText('Nueva hora de salida')).not.toBeInTheDocument();
        expect(screen.getByRole('alertdialog')).not.toHaveAccessibleDescription(/Puedes ampliarla/);
        expect(screen.getByRole('button', { name: 'Continuar al pago' })).toBeDisabled();
    });
});

describe('Changing the payment method after the answer (#375)', () => {
    test('after another code that stops the extension, the message stays', async () => {
        // Arrange: the stay changed meanwhile, for example in another tab
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce({ response: { status: 409, data: { code: 'RESERVATION_CHANGED', message: '…' } } });
        renderPayment(colombia('14:00'));
        await screen.findByText('Ampliar estadía');
        await pay(user, 4000);

        // Act
        await user.click(screen.getByRole('radio', { name: /PSE/ }));

        // Assert
        expect(payButton(4000)).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('Esta reserva cambió mientras la ampliabas');
        expect(screen.getByRole('button', { name: 'Volver a la reserva' })).toBeInTheDocument();
    });

    test('after a declined payment, the message goes away to try again', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockRejectedValueOnce({ response: { status: 402, data: { code: 'PAYMENT_DECLINED', message: '…' } } });
        renderPayment(colombia('14:00'));
        await screen.findByText('Ampliar estadía');
        await pay(user, 4000);
        expect(screen.getByRole('alert')).toBeInTheDocument();

        // Act
        await user.click(screen.getByRole('radio', { name: /PSE/ }));

        // Assert
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(payButton(4000)).toBeEnabled();
    });

    test('after an approved payment, the message stays until the screen changes', async () => {
        // Arrange
        const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });
        extendStay.mockResolvedValueOnce({ data: {} });
        renderPayment(colombia('14:00'));
        await screen.findByText('Ampliar estadía');
        await pay(user, 4000);

        // Act
        await user.click(screen.getByRole('radio', { name: /PSE/ }));

        // Assert
        expect(screen.getByRole('status')).toHaveTextContent('Pago aprobado. Estadía ampliada');
    });
});
