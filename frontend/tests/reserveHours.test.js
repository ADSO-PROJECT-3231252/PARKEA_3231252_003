import { render, screen, fireEvent, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReserveSpot from '../src/pages/ReserveSpot';
import { getZone } from '../src/services/zoneService';
import { getVehicles } from '../src/services/vehicleService';
import { createReservation } from '../src/services/reservationService';
import { dayName } from '../src/utils/zoneHours';

// The screen does not call the real API
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn() }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn() }));
jest.mock('../src/services/reservationService', () => ({ createReservation: jest.fn() }));

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
