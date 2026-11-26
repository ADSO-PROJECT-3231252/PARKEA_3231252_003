import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReserveSpot from '../src/pages/ReserveSpot';
import { getZone, getAvailabilityForHours } from '../src/services/zoneService';
import { getVehicles } from '../src/services/vehicleService';
import { createReservation, hasPendingBalance } from '../src/services/reservationService';
import { SPOTS_WAIT_MS } from '../src/hooks/useSpotsForHours';
import { dayName } from '../src/utils/zoneHours';

// The screen does not call the real API
// #375: the free spots for the chosen hours never answer here
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn(), getAvailabilityForHours: jest.fn(() => new Promise(() => {})) }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn() }));
jest.mock('../src/services/reservationService', () => ({
    createReservation: jest.fn(),
    hasPendingBalance: jest.fn(),
}));

// HU-29: the reserve screen checks the hours of the zone before sending.
// The dates are "tomorrow" in Colombia (UTC-5), so they are always in the
// future and less than 48 hours ahead. The fields take the local date and
// time of the browser, so the tests type those, whatever its time zone.
// Testing Library reads the non-breaking spaces of "6:00 a. m." as spaces.
const HOUR = 60 * 60 * 1000;
const OFFSET = 5 * HOUR;
function colombiaTomorrow() {
    const local = new Date(Date.now() + 24 * HOUR - OFFSET);
    const weekDay = local.getUTCDay();
    return {
        day: weekDay === 0 ? 7 : weekDay,
        midnight: Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + OFFSET,
    };
}
const TOMORROW = colombiaTomorrow();
const OTHER_DAY = (TOMORROW.day % 7) + 1;
const at = (time) => {
    const [h, m] = time.split(':').map(Number);
    return new Date(TOMORROW.midnight + (h * 60 + m) * 60 * 1000);
};
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const zoneWith = (schedule, open24h = false) => ({
    id: 'z1',
    name: 'Centro',
    address: 'Calle 1',
    totalSlots: 10,
    availableSlots: 10,
    hourlyRate: '2000.00',
    isActive: true,
    open24h,
    schedule,
});
// Open tomorrow from 6:00 a. m. to 8:00 p. m.; closed the other days
const OPEN_TOMORROW = zoneWith([{ day: TOMORROW.day, opensAt: '06:00', closesAt: '20:00' }]);

async function renderScreen(zone) {
    getZone.mockResolvedValue({ data: { zone } });
    getVehicles.mockResolvedValue({ data: { vehicles: [{ id: 'v1', plate: 'ABC123', brand: 'Kia', model: 'Rio', color: 'Rojo', isDefault: true }] } });
    render(
        <MemoryRouter initialEntries={['/reserve/z1']}>
            <Routes>
                <Route path="/reserve/:zoneId" element={<ReserveSpot />} />
                <Route path="/reservations/:id" element={<p>Confirmación</p>} />
            </Routes>
        </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Reservar cupo' });
}

function typeEntry(time) {
    fireEvent.change(document.getElementById('startDate'), { target: { value: localDate(at(time)) } });
    fireEvent.change(document.getElementById('startTime'), { target: { value: localTime(at(time)) } });
}
function typeExit(time) {
    fireEvent.change(document.getElementById('endDate'), { target: { value: localDate(at(time)) } });
    fireEvent.change(document.getElementById('endTime'), { target: { value: localTime(at(time)) } });
}

beforeEach(() => {
    createReservation.mockReset();
    hasPendingBalance.mockReset().mockResolvedValue(false);
});

describe('The reserve screen and the hours of the zone (HU-29)', () => {
    test('AC-06: shows the hours of the week', async () => {
        // Act
        await renderScreen(OPEN_TOMORROW);

        // Assert
        const hours = screen.getByRole('region', { name: 'Horario de la zona' });
        const name = dayName(TOMORROW.day);
        expect(within(hours).getByText(name.charAt(0).toUpperCase() + name.slice(1)).nextSibling).toHaveTextContent('6:00 a. m. – 8:00 p. m.');
        expect(within(hours).getAllByText('Cerrada')).toHaveLength(6);
    });

    test('AC-06: a zone open 24 hours says so', async () => {
        await renderScreen(zoneWith([], true));
        expect(screen.getByText('Abierta 24 horas, todos los días.')).toBeInTheDocument();
    });

    test('AC-03: an entry before the opening time is shown before sending, and nothing is sent', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderScreen(OPEN_TOMORROW);

        // Act
        typeEntry('05:30');
        typeExit('07:00');

        // Assert: the warning is there before clicking
        expect(document.getElementById('start-error')).toHaveTextContent('La entrada puede ser hasta las 7:30 p. m.');
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('AC-03: an exit after the closing time is shown under the exit', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderScreen(OPEN_TOMORROW);

        // Act
        typeEntry('19:00');
        typeExit('20:30');
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        expect(document.getElementById('end-error')).toHaveTextContent('esta zona cierra a las 8:00 p. m. La salida debe ser hasta esa hora.');
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('AC-03: a closed day says the zone does not open that day', async () => {
        // Arrange
        await renderScreen(zoneWith([{ day: OTHER_DAY, opensAt: '06:00', closesAt: '20:00' }]));

        // Act
        typeEntry('10:00');

        // Assert
        expect(document.getElementById('start-error')).toHaveTextContent(/^Esta zona no abre los /);
    });

    test('a reservation inside the hours is sent, from the opening to the closing time', async () => {
        // Arrange
        const user = userEvent.setup();
        createReservation.mockResolvedValue({ data: { reservation: { id: 'r1' } } });
        await renderScreen(OPEN_TOMORROW);

        // Act
        typeEntry('06:00');
        typeExit('20:00');
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({
            startTime: at('06:00').toISOString(),
            endTime: at('20:00').toISOString(),
        }));
    });

    test('AC-04: an open stay says it ends at the closing time at the latest', async () => {
        // Arrange
        const user = userEvent.setup();
        await renderScreen(OPEN_TOMORROW);

        // Act
        typeEntry('18:00');
        await user.click(screen.getByRole('checkbox', { name: 'Tiempo indefinido' }));

        // Assert
        expect(screen.getByText('Hasta las 8:00 p. m. como máximo')).toBeInTheDocument();
        expect(screen.getByRole('checkbox', { name: 'Tiempo indefinido' })).toHaveAccessibleDescription(
            /por cada hora empezada\. Termina a más tardar a las 8:00\sp\.\sm\., cuando cierra la zona\.$/,
        );
    });

    test('the hours given by the API go under the entry (the hours may have changed)', async () => {
        // Arrange
        const user = userEvent.setup();
        createReservation.mockRejectedValue({
            response: { status: 400, data: { code: 'OUTSIDE_ZONE_HOURS', hours: { day: 2, opensAt: '07:00', closesAt: '18:00' } } },
        });
        await renderScreen(zoneWith([], true));

        // Act
        typeEntry('10:00');
        typeExit('12:00');
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        expect(await screen.findByText('El martes esta zona abre de 7:00 a. m. a 6:00 p. m. La reserva debe quedar dentro de ese horario, con la entrada al menos 30 minutos antes del cierre.')).toBeInTheDocument();
    });
});

// HU-27 AC-11 and #299: a balance to pay and the reservations waiting for
// payment are both paid from the list of reservations, so their banner links
// there. Any other error shows only its message.
describe('The link of the banner to my reservations (HU-27 AC-11, #299)', () => {
    async function reserveAndGet(code) {
        const user = userEvent.setup();
        createReservation.mockRejectedValue({ response: { status: 409, data: { code } } });
        await renderScreen(zoneWith([], true));
        typeEntry('10:00');
        typeExit('12:00');
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));
    }

    test.each([
        ['TOO_MANY_PENDING_RESERVATIONS', 'Ya tienes 2 reservas pendientes de pago. Paga o cancela una antes de hacer otra'],
        ['PENDING_BALANCE', 'Tienes un saldo pendiente de una estadía anterior. Págalo antes de hacer una nueva reserva'],
    ])('%s shows its message and the link to my reservations', async (code, shown) => {
        // Act
        await reserveAndGet(code);

        // Assert
        const message = await screen.findByText(shown);
        const link = within(message.closest('[role="alert"]')).getByRole('link', { name: 'Ver mis reservas' });
        expect(link).toHaveAttribute('href', '/reservations');
    });

    test('another error shows its message without the link', async () => {
        // Act
        await reserveAndGet('NO_SPOTS_AVAILABLE');

        // Assert
        expect(await screen.findByText('Este cupo ya no está disponible. Elige otra zona u horario')).toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Ver mis reservas' })).not.toBeInTheDocument();
    });
});

describe('Reservation notices before submitting (#305)', () => {
    test('an inactive zone with free spots shows a warning and disables booking', async () => {
        await renderScreen({ ...zoneWith([], true), isActive: false });

        const notice = screen.getByText('Esta zona ya no acepta reservas');
        expect(notice).toHaveAttribute('role', 'alert');
        expect(screen.getByText('No disponible')).toBeInTheDocument();
        const button = screen.getByRole('button', { name: 'Reservar cupo' });
        expect(button).toBeEnabled();
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(button).toHaveAccessibleDescription(notice.textContent);
        expect(screen.queryByText('cupos libres ahora')).not.toBeInTheDocument();
        expect(screen.queryByText(/No hay cupos en este momento/i)).not.toBeInTheDocument();

        getAvailabilityForHours.mockClear();
        typeEntry('10:00');
        typeExit('12:00');
        await new Promise((resolve) => setTimeout(resolve, SPOTS_WAIT_MS + 50));
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
        fireEvent.submit(button.closest('form'));
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('an active zone with no free spots now still allows booking for other hours', async () => {
        await renderScreen({ ...zoneWith([], true), availableSlots: 0 });

        expect(screen.getByText(/No hay cupos en este momento/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reservar cupo' })).toBeEnabled();
    });

    test('a pending balance shows the reservations link before the user submits', async () => {
        hasPendingBalance.mockResolvedValue(true);
        await renderScreen(zoneWith([], true));

        const message = await screen.findByText(
            'Tienes un saldo pendiente de una estadía anterior. Págalo antes de hacer una nueva reserva',
        );
        const link = within(message.closest('[role="alert"]')).getByRole('link', { name: 'Ver mis reservas' });
        expect(link).toHaveAttribute('href', '/reservations');
        expect(createReservation).not.toHaveBeenCalled();
    });

    test('an inactive-zone response reloads the zone and prevents another submission', async () => {
        const active = zoneWith([], true);
        await renderScreen(active);
        const reads = getZone.mock.calls.length;
        getZone.mockResolvedValueOnce({ data: { zone: { ...active, isActive: false } } });
        createReservation.mockRejectedValueOnce({ response: { data: { code: 'ZONE_INACTIVE' } } });

        typeEntry('10:00');
        typeExit('12:00');
        const button = screen.getByRole('button', { name: 'Reservar cupo' });
        fireEvent.submit(button.closest('form'));

        await screen.findByText('No disponible');
        expect(getZone).toHaveBeenCalledTimes(reads + 1);
        expect(button).toHaveAttribute('aria-disabled', 'true');
        expect(screen.getAllByText('Esta zona ya no acepta reservas')).toHaveLength(1);
    });

    test('a balance reported again on submit shows a single message and link', async () => {
        hasPendingBalance.mockResolvedValue(true);
        createReservation.mockRejectedValueOnce({ response: { data: { code: 'PENDING_BALANCE' } } });
        await renderScreen(zoneWith([], true));
        const initialLink = await screen.findByRole('link', { name: 'Ver mis reservas' });

        typeEntry('10:00');
        typeExit('12:00');
        await userEvent.setup().click(screen.getByRole('button', { name: 'Reservar cupo' }));

        expect(createReservation).toHaveBeenCalledTimes(1);
        expect(initialLink).not.toBeInTheDocument();
        expect(screen.getAllByText(/Tienes un saldo pendiente de una estadía anterior/)).toHaveLength(1);
        expect(screen.getAllByRole('link', { name: 'Ver mis reservas' })).toHaveLength(1);
    });

    test('a failed balance check leaves the form usable', async () => {
        hasPendingBalance.mockRejectedValueOnce(new Error('Network Error'));
        createReservation.mockResolvedValueOnce({ data: { reservation: { id: 'r1' } } });
        await renderScreen(zoneWith([], true));
        expect(hasPendingBalance).toHaveBeenCalled();
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
        expect(screen.queryByRole('link', { name: 'Ver mis reservas' })).not.toBeInTheDocument();

        typeEntry('10:00');
        typeExit('12:00');
        await userEvent.setup().click(screen.getByRole('button', { name: 'Reservar cupo' }));
        expect(await screen.findByText('Confirmación')).toBeInTheDocument();
    });

    test('an active zone without debt keeps its available badge and booking button', async () => {
        await renderScreen(zoneWith([], true));

        expect(screen.getByText('Disponible')).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Reservar cupo' })).toBeEnabled();
        expect(screen.queryByRole('link', { name: 'Ver mis reservas' })).not.toBeInTheDocument();
    });
});
