import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import ReserveSpot from '../src/pages/ReserveSpot';
import { getAvailabilityForHours, getZone } from '../src/services/zoneService';
import { getVehicles } from '../src/services/vehicleService';
import { createReservation } from '../src/services/reservationService';
import { SPOTS_WAIT_MS } from '../src/hooks/useSpotsForHours';

// The screen does not call the real API
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn(), getAvailabilityForHours: jest.fn() }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn() }));
jest.mock('../src/services/reservationService', () => ({ createReservation: jest.fn() }));

// #375: the reserve screen says whether there is room for the chosen hours
// before sending (GET /zones/:id/availability). The fields take the local
// date and time of the browser, so the hours are built in local time.
const pad = (n) => String(n).padStart(2, '0');
function dayAt(days, hours, minutes = 0) {
    const d = new Date();
    d.setDate(d.getDate() + days);
    d.setHours(hours, minutes, 0, 0);
    return d;
}
const tomorrowAt = (hours, minutes) => dayAt(1, hours, minutes);
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

const ZONE = {
    id: 'z1',
    name: 'Centro',
    address: 'Calle 1',
    totalSlots: 10,
    availableSlots: 0,
    // HU-31: the zone accepts cars, and the free spots are of the type of
    // the chosen vehicle
    vehicleTypes: [{ vehicleType: 'car', totalSlots: 10, availableSlots: 0, hourlyRate: 2000 }],
    isActive: true,
    open24h: true,
    schedule: [],
};

const VEHICLES = [
    { id: 'v1', plate: 'ABC123', vehicleType: 'car', brand: 'Kia', model: 'Rio', color: 'Rojo', isDefault: true },
    { id: 'v2', plate: 'XYZ789', vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Gris', isDefault: false },
];

async function renderScreen(zone = ZONE) {
    getZone.mockResolvedValue({ data: { zone } });
    getVehicles.mockResolvedValue({ data: { vehicles: VEHICLES } });
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

const change = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
function typeEntry(date) {
    change('startDate', localDate(date));
    change('startTime', localTime(date));
}
function typeExit(date) {
    change('endDate', localDate(date));
    change('endTime', localTime(date));
}

// The pause after the last change, and the answer of the API
async function wait(ms = SPOTS_WAIT_MS) {
    await act(async () => {
        jest.advanceTimersByTime(ms);
    });
}

// The line under the hours; Testing Library reads it as the user hears it
const spotsLine = () => screen.getAllByRole('status').find((el) => el.textContent.includes('cupo') || el.textContent.includes('cupos'));
const answer = (availableSlots) => Promise.resolve({ data: { availableSlots } });
// A request that answers only when it is cancelled, with the error axios gives
const untilCancelled = (signal) => new Promise((resolve, reject) => {
    signal.addEventListener('abort', () => reject(Object.assign(new Error('canceled'), { code: 'ERR_CANCELED' })));
});

beforeEach(() => {
    jest.useFakeTimers();
    // Without an answer of its own, a request never answers
    getAvailabilityForHours.mockReset().mockReturnValue(new Promise(() => {}));
    createReservation.mockReset();
});

afterEach(() => {
    jest.useRealTimers();
});

describe('The free spots for the chosen hours on the reserve screen (#375)', () => {
    test('before the hours are complete it says what it will do, and asks nothing', async () => {
        // Arrange
        await renderScreen();

        // Act: only the entry
        typeEntry(tomorrowAt(10));
        await wait(5 * SPOTS_WAIT_MS);

        // Assert
        expect(spotsLine()).toHaveTextContent('Cuando la entrada y la salida sean válidas, te diremos si hay cupos para ese horario.');
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
    });

    test('with valid hours it asks once, half a second after the last change, with the values the reservation would send', async () => {
        // Arrange
        getAvailabilityForHours.mockReturnValue(answer(3));
        await renderScreen();

        // Act: the exit is typed in steps, each one before the pause ends
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(11));
        await wait(SPOTS_WAIT_MS - 100);
        change('endTime', localTime(tomorrowAt(12)));
        await wait(SPOTS_WAIT_MS - 100);
        change('endTime', localTime(tomorrowAt(12, 30)));
        await wait(SPOTS_WAIT_MS - 1);

        // Assert: nothing yet, and then one request for the last hours
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
        expect(spotsLine()).toHaveTextContent('Buscando cupos para ese horario…');
        await wait(1);
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(1);
        expect(getAvailabilityForHours).toHaveBeenCalledWith(
            'z1',
            { vehicleType: 'car', startTime: tomorrowAt(10).toISOString(), endTime: tomorrowAt(12, 30).toISOString() },
            { signal: expect.any(AbortSignal) },
        );
        expect(spotsLine()).toHaveTextContent('Hay 3 cupos de carros para ese horario.');
    });

    test.each([
        ['1 free spot', 'Hay 1 cupo de carros para ese horario.', 1],
        ['no free spot', 'No hay cupos de carros para ese horario. Prueba con otras horas.', 0],
    ])('with %s it says "%s", and the button stays enabled', async (_case, text, free) => {
        // Arrange
        getAvailabilityForHours.mockReturnValue(answer(free));
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();

        // Assert
        expect(spotsLine()).toHaveTextContent(text);
        expect(screen.getByRole('button', { name: 'Reservar cupo' })).toBeEnabled();
    });

    test('an open stay asks with openEnded, and with no room it suggests an exit time', async () => {
        // Arrange
        getAvailabilityForHours.mockReturnValue(answer(0));
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Tiempo indefinido' }));
        await wait();

        // Assert
        expect(getAvailabilityForHours).toHaveBeenCalledWith('z1', { vehicleType: 'car', startTime: tomorrowAt(10).toISOString(), openEnded: true }, expect.anything());
        expect(spotsLine()).toHaveTextContent('No hay cupos de carros para una estadía sin hora de salida desde esa entrada. Prueba con una hora de salida.');
    });

    test('hours that change while it asks cancel that request, and its answer is never shown', async () => {
        // Arrange: the first request never answers by itself
        let firstSignal;
        getAvailabilityForHours
            .mockImplementationOnce((id, hours, { signal }) => {
                firstSignal = signal;
                return untilCancelled(signal);
            })
            .mockReturnValueOnce(answer(5));
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();
        typeExit(tomorrowAt(13));

        // Assert: cancelled at once, and the second request gives the answer
        expect(firstSignal.aborted).toBe(true);
        expect(spotsLine()).toHaveTextContent('Buscando cupos para ese horario…');
        await wait();
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(2);
        expect(spotsLine()).toHaveTextContent('Hay 5 cupos de carros para ese horario.');
    });

    test('asking again for the same hours cancels the request that had not answered, without showing an error', async () => {
        // Arrange: the first request never answers by itself, and the
        // reservation is sent meanwhile and finds no room
        getAvailabilityForHours
            .mockImplementationOnce((id, hours, { signal }) => untilCancelled(signal))
            .mockReturnValueOnce(answer(0));
        createReservation.mockRejectedValue({ response: { status: 409, data: { code: 'NO_SPOTS_AVAILABLE' } } });
        await renderScreen();
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();

        // Act
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Reservar cupo' }));
        });

        // Assert: still looking, and then the new answer
        expect(spotsLine()).toHaveTextContent('Buscando cupos para ese horario…');
        await wait();
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(2);
        expect(spotsLine()).toHaveTextContent('No hay cupos de carros para ese horario. Prueba con otras horas.');
    });

    test('a change that leaves the same hours (another vehicle) asks nothing again', async () => {
        // Arrange
        getAvailabilityForHours.mockReturnValue(answer(2));
        await renderScreen();
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();

        // Act
        change('vehicleId', 'v2');
        await wait(5 * SPOTS_WAIT_MS);

        // Assert
        expect(spotsLine()).toHaveTextContent('Hay 2 cupos de carros para ese horario.');
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['a stay of 20 minutes', () => { typeEntry(tomorrowAt(10)); typeExit(tomorrowAt(10, 20)); }],
        ['an exit before the entry', () => { typeEntry(tomorrowAt(10)); typeExit(tomorrowAt(9)); }],
        ['a stay of 25 hours', () => { typeEntry(tomorrowAt(10)); typeExit(dayAt(2, 11)); }],
        ['an entry that already passed', () => { typeEntry(dayAt(-1, 10)); typeExit(dayAt(-1, 12)); }],
        ['an entry more than 48 hours ahead', () => { typeEntry(dayAt(3, 10)); typeExit(dayAt(3, 12)); }],
    ])('with %s it asks nothing (the form says why when it is sent)', async (_case, typeHours) => {
        // Arrange
        await renderScreen();

        // Act
        typeHours();
        await wait(5 * SPOTS_WAIT_MS);

        // Assert
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
        expect(spotsLine()).toHaveTextContent('Cuando la entrada y la salida sean válidas, te diremos si hay cupos para ese horario.');
    });

    test.each([
        ['the entry and the exit', 21, 22],
        ['only the exit', 19, 21],
    ])('hours outside the hours of the zone ask nothing (%s)', async (_case, entry, exit) => {
        // Arrange: it opens tomorrow from 6:00 a. m. to 8:00 p. m. in
        // Colombia (UTC-5), the time of the hours of the zones
        const HOUR = 60 * 60 * 1000;
        const colombia = new Date(Date.now() + 24 * HOUR - 5 * HOUR);
        const day = colombia.getUTCDay() === 0 ? 7 : colombia.getUTCDay();
        const colombiaAt = (hours) => new Date(Date.UTC(colombia.getUTCFullYear(), colombia.getUTCMonth(), colombia.getUTCDate(), hours + 5));
        await renderScreen({ ...ZONE, open24h: false, schedule: [{ day, opensAt: '06:00', closesAt: '20:00' }] });

        // Act: from 9:00 to 10:00 p. m., and from 7:00 to 9:00 p. m., in Colombia
        typeEntry(colombiaAt(entry));
        typeExit(colombiaAt(exit));
        await wait(5 * SPOTS_WAIT_MS);

        // Assert
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
    });

    test.each([
        ['the zone was deactivated', 'Esta zona ya no acepta reservas.', { response: { status: 409, data: { code: 'ZONE_INACTIVE' } } }],
        ['the hours of the zone changed', 'El martes esta zona abre de 7:00 a. m. a 6:00 p. m. La reserva debe quedar dentro de ese horario, con la entrada al menos 30 minutos antes del cierre.', { response: { status: 400, data: { code: 'OUTSIDE_ZONE_HOURS', hours: { day: 2, opensAt: '07:00', closesAt: '18:00' } } } }],
        ['there is no network', 'No pudimos consultar los cupos para ese horario. Igual puedes intentar reservar.', new Error('Network Error')],
    ])('when %s it says "%s", and the reservation can still be sent', async (_case, text, error) => {
        // Arrange
        getAvailabilityForHours.mockRejectedValue(error);
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();

        // Assert
        expect(screen.getByText(text).closest('[role="status"]')).not.toBeNull();
        expect(screen.getByRole('button', { name: 'Reservar cupo' })).toBeEnabled();
    });

    test('when the reservation answers that the room was taken, it asks again for the same hours', async () => {
        // Arrange: there was 1 spot, and someone took it before sending
        getAvailabilityForHours.mockReturnValueOnce(answer(1)).mockReturnValueOnce(answer(0));
        createReservation.mockRejectedValue({ response: { status: 409, data: { code: 'NO_SPOTS_AVAILABLE' } } });
        await renderScreen();
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();
        expect(spotsLine()).toHaveTextContent('Hay 1 cupo de carros para ese horario.');

        // Act
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Reservar cupo' }));
        });
        await wait();

        // Assert
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(2);
        expect(spotsLine()).toHaveTextContent('No hay cupos de carros para ese horario. Prueba con otras horas.');
    });

    test('the rate and the total are the ones the API answers for those hours (HU-31 AC-10)', async () => {
        // Arrange: the rate of cars went from $2.000 to $3.000 after the screen was opened
        getAvailabilityForHours.mockReturnValue(Promise.resolve({ data: { availableSlots: 7, totalSlots: 10, vehicleType: 'car', hourlyRate: 3000 } }));
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        typeExit(tomorrowAt(12));
        await wait();

        // Assert
        expect(screen.getByText('Tarifa por hora de carros').nextElementSibling).toHaveTextContent('$ 3.000');
        expect(document.getElementById('vehicleId-rate')).toHaveTextContent('Tarifa para carros: $ 3.000 por hora.');
        expect(screen.getByText('$ 6.000')).toBeInTheDocument();
        expect(screen.getByText(/\(Tarifa: \$\s3\.000 x 2 horas\)/)).toBeInTheDocument();
    });

    test('an open stay shows the first hour with the rate the API answers (HU-31 AC-10)', async () => {
        // Arrange: the rate of cars went from $2.000 to $3.000 after the screen was opened
        getAvailabilityForHours.mockReturnValue(Promise.resolve({ data: { availableSlots: 7, totalSlots: 10, vehicleType: 'car', hourlyRate: 3000, openEnded: true } }));
        await renderScreen();

        // Act
        typeEntry(tomorrowAt(10));
        fireEvent.click(screen.getByRole('checkbox', { name: 'Tiempo indefinido' }));
        await wait();

        // Assert
        expect(screen.getByText('A pagar al confirmar').nextElementSibling).toHaveTextContent('$ 3.000');
        expect(screen.getByText(/\(Primera hora\. Luego \$\s3\.000 por cada hora empezada\)/)).toBeInTheDocument();
    });
});
