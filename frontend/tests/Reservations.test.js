import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { Link, MemoryRouter, useLocation, useNavigationType } from 'react-router-dom';
import Reservations from '../src/pages/Reservations';
import { cancelReservation, getReservations } from '../src/services/reservationService';

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
        expect(screen.getAllByText('Pendiente de pago')).toHaveLength(2);

        // Act: the 15 minutes end
        await wait(1000 + 100);

        // Assert
        expect(buttons(PAY_PENDING)).toHaveLength(0);
        expect(buttons(CANCEL_PENDING)).toHaveLength(0);
        expect(buttons(DETAIL_PENDING)).toHaveLength(2);
        // It shows as expired, in the table and in the card
        const [inTable, inCard] = screen.getAllByText('Expirada');
        expect(inTable.closest('tr')).toHaveClass('border-l-neutral-400');
        expect(inCard.closest('li')).toHaveClass('border-l-neutral-400');
        expect(screen.getAllByText('Pago: Sin pago')).toHaveLength(2);
        expect(screen.queryAllByText('Pendiente de pago')).toHaveLength(0);
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

    test('an open stay waiting for payment shows like an expired one at 00:00, in the whole row', async () => {
        // Arrange: no exit time, the first hour to pay
        answer([{ ...pending, endTime: null, openEnded: true }]);
        renderList();
        expect(await screen.findAllByText('Tiempo indefinido')).toHaveLength(2);
        expect(screen.getAllByText('Primera hora')).toHaveLength(2);

        // Act: the 15 minutes end
        await wait(10 * MINUTE + 100);

        // Assert: like a reservation the job already marked Expired
        expect(screen.getAllByText('Expirada')).toHaveLength(2);
        expect(screen.queryAllByText('Tiempo indefinido')).toHaveLength(0);
        expect(screen.queryAllByText('Primera hora')).toHaveLength(0);
        expect(screen.getAllByText('Estimado')).toHaveLength(2);
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

describe('Keyboard focus when a pending reservation expires (#361)', () => {
    test.each([
        ['table', 'tr', PAY_PENDING],
        ['table', 'tr', CANCEL_PENDING],
        ['card', 'li', PAY_PENDING],
        ['card', 'li', CANCEL_PENDING],
    ])('keeps focus in the same %s (%s) when "%s" disappears', async (
        _view, containerSelector, actionName,
    ) => {
        // Arrange
        answer([paid, pending]);
        renderList();
        const actions = await screen.findAllByRole('button', { name: actionName });
        const action = actions.find((button) => button.closest(containerSelector));
        const container = action.closest(containerSelector);
        const detail = within(container).getByRole('button', { name: DETAIL_PENDING });
        action.focus();
        expect(action).toHaveFocus();

        // Act
        await wait(10 * MINUTE + 100);

        // Assert
        expect(action).not.toBeInTheDocument();
        expect(detail).toHaveFocus();
    });
});

// #307: the status filter lives in the URL. The address of the screen, and
// whether the last change replaced it (a filter is not a new page to go back to).
function CurrentAddress() {
    const { search, hash } = useLocation();
    const type = useNavigationType();
    return <output aria-label="Dirección">{`${type} ${search}${hash}`}</output>;
}

// The screen with a link like "Mis reservas" of the header, which opens the
// list without a filter
const renderAt = (path) => render(
    <MemoryRouter initialEntries={[path]}>
        <Link to="/reservations">Mis reservas</Link>
        <Reservations />
        <CurrentAddress />
    </MemoryRouter>,
);

const pressed = (name) => screen.getByRole('button', { name }).getAttribute('aria-pressed');

describe('The status filter in the URL (#307)', () => {
    test('loads the status from the URL and keeps the controls, the request and the URL in sync', async () => {
        // Arrange
        answer([]);
        renderAt('/reservations?source=home&status=Pending#lista');
        await act(async () => {});
        expect(pressed('Pendientes')).toBe('true');
        const select = screen.getByLabelText('Filtrar por estado');
        expect(select).toHaveValue('Pending');
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'Pending', page: 1, limit: 10 });

        // Act
        await act(async () => { fireEvent.change(select, { target: { value: 'Active' } }); });

        // Assert: the other values of the address stay
        expect(screen.getByLabelText('Dirección')).toHaveTextContent(/^REPLACE \?source=home&status=Active#lista$/);
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'Active', page: 1, limit: 10 });

        // Act: "Todas" takes the status out of the URL
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Todas' })); });

        // Assert
        expect(screen.getByLabelText('Dirección')).toHaveTextContent(/^REPLACE \?source=home#lista$/);
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'All', page: 1, limit: 10 });
    });

    test('an unknown status in the URL shows all of them', async () => {
        // Arrange
        answer([]);

        // Act
        renderAt('/reservations?status=Foo');
        await act(async () => {});

        // Assert
        expect(pressed('Todas')).toBe('true');
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'All', page: 1, limit: 10 });
    });

    test('after a list that could not load, another filter shows its list without the error', async () => {
        // Arrange
        getReservations.mockRejectedValueOnce(new Error('Network Error'));
        answer([pending]);
        renderAt('/reservations');
        await act(async () => {});
        expect(screen.getByText(/No pudimos cargar tu historial/)).toBeInTheDocument();

        // Act
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Pendientes' })); });

        // Assert
        expect(screen.queryByText(/No pudimos cargar tu historial/)).not.toBeInTheDocument();
        expect(buttons(PAY_PENDING)).toHaveLength(2);
    });

    test('a link that changes the filter starts again on page 1, with the loading state and without the last message', async () => {
        // Arrange: page 2 of the Pending ones, after cancelling one
        getReservations.mockResolvedValue({
            data: { reservations: [pending], pagination: { page: 1, limit: 10, total: 11, totalPages: 2 } },
        });
        cancelReservation.mockResolvedValue({});
        renderAt('/reservations?status=Pending');
        await act(async () => {});
        await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Siguiente' })); });
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'Pending', page: 2, limit: 10 });
        fireEvent.click(buttons(CANCEL_PENDING)[0]);
        await act(async () => {
            fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar reserva' }));
        });
        expect(screen.getByText(/^Reserva AAAAAAAA cancelada/)).toBeInTheDocument();
        // The next answer takes its time, so the screen shows what it does meanwhile
        getReservations.mockReturnValue(new Promise(() => {}));

        // Act
        await act(async () => { fireEvent.click(screen.getByRole('link', { name: 'Mis reservas' })); });

        // Assert
        expect(pressed('Todas')).toBe('true');
        expect(getReservations).toHaveBeenLastCalledWith({ status: 'All', page: 1, limit: 10 });
        expect(screen.getByText('Cargando reservas…')).toBeInTheDocument();
        expect(screen.queryByText(/^Reserva AAAAAAAA cancelada/)).not.toBeInTheDocument();
    });
});

describe('Keyboard focus when a paid stay reaches its exit time (#361)', () => {
    const endingStay = { ...paid, startTime: at(-30 * MINUTE), endTime: at(MINUTE) };
    const extendName = 'Ampliar la estadía de la reserva BBBBBBBB en Zona Pagada';
    const detailName = 'Ver detalle de la reserva BBBBBBBB en Zona Pagada';

    test.each(['tr', 'li'])('moves focus to the detail button in the same %s', async (selector) => {
        // Arrange
        answer([pending, endingStay]);
        renderList();
        const actions = await screen.findAllByRole('button', { name: extendName });
        const action = actions.find((button) => button.closest(selector));
        const container = action.closest(selector);
        action.focus();
        expect(action).toHaveFocus();

        // Act
        await wait(MINUTE + 100);

        // Assert
        expect(action).not.toBeInTheDocument();
        expect(within(container).getByRole('button', { name: detailName })).toHaveFocus();
    });

    test('keeps focus on another reservation when the extend button disappears', async () => {
        // Arrange
        answer([pending, endingStay]);
        renderList();
        expect(await screen.findAllByRole('button', { name: extendName })).toHaveLength(2);
        const otherAction = buttons(PAY_PENDING)[0];
        otherAction.focus();
        expect(otherAction).toHaveFocus();

        // Act
        await wait(MINUTE + 100);

        // Assert
        expect(buttons(extendName)).toHaveLength(0);
        expect(otherAction).toHaveFocus();
    });
});

test('keeps focus on the cancellation message after the refreshed list removes the opener (#361)', async () => {
    // Arrange
    answer([pending]);
    cancelReservation.mockResolvedValueOnce({});
    renderList();
    const [opener] = await screen.findAllByRole('button', { name: CANCEL_PENDING });
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('alertdialog');

    // Keep the refresh pending until the dialog has closed.
    let resolveRefresh;
    getReservations.mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
    }));

    // Act
    await act(async () => {
        fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar reserva' }));
    });
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    const message = screen.getByText(/^Reserva AAAAAAAA cancelada/);
    expect(message).toHaveFocus();

    await act(async () => {
        resolveRefresh({
            data: {
                reservations: [{ ...pending, status: 'Canceled' }],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            },
        });
    });

    // Assert
    expect(buttons(CANCEL_PENDING)).toHaveLength(0);
    expect(message).toHaveFocus();
});

test('focuses the same reservation details when its cancel action expires while the dialog is open (#361)', async () => {
    // Arrange
    answer([paid, pending]);
    renderList();
    const actions = await screen.findAllByRole('button', { name: CANCEL_PENDING });
    const opener = actions.find((button) => button.closest('tr'));
    const row = opener.closest('tr');
    opener.focus();
    fireEvent.click(opener);
    const dialog = screen.getByRole('alertdialog');
    const keep = within(dialog).getByRole('button', { name: 'Conservar reserva' });
    expect(keep).toHaveFocus();

    // Act
    await wait(10 * MINUTE + 100);
    expect(opener).not.toBeInTheDocument();
    expect(keep).toHaveFocus();
    fireEvent.click(keep);

    // Assert
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(within(row).getByRole('button', { name: DETAIL_PENDING })).toHaveFocus();
});

test('focuses the list heading when a refresh removes the reservation after a cancellation error (#361)', async () => {
    // Arrange
    answer([paid, pending]);
    cancelReservation.mockRejectedValueOnce({
        response: { status: 404, data: { code: 'RESERVATION_NOT_FOUND' } },
    });
    renderList();
    const [opener] = await screen.findAllByRole('button', { name: CANCEL_PENDING });
    opener.focus();
    fireEvent.click(opener);

    const dialog = screen.getByRole('alertdialog');
    const confirm = within(dialog).getByRole('button', { name: 'Cancelar reserva' });
    await act(async () => { fireEvent.click(confirm); });
    expect(within(dialog).getByRole('alert')).toBeInTheDocument();

    // The refresh finishes after the dialog closes.
    let resolveRefresh;
    getReservations.mockReturnValueOnce(new Promise((resolve) => {
        resolveRefresh = resolve;
    }));

    // Act
    fireEvent.click(within(dialog).getByRole('button', { name: 'Conservar reserva' }));
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(getReservations).toHaveBeenCalledTimes(2);
    await act(async () => {
        resolveRefresh({
            data: {
                reservations: [paid],
                pagination: { page: 1, limit: 10, total: 1, totalPages: 1 },
            },
        });
    });

    // Assert
    expect(buttons(DETAIL_PENDING)).toHaveLength(0);
    expect(buttons(CANCEL_PAID)).toHaveLength(2);
    expect(screen.getByRole('heading', { name: 'Mis reservas' })).toHaveFocus();
});
