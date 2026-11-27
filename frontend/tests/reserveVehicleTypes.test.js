import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import ReserveSpot from '../src/pages/ReserveSpot';
import RegisterVehicle from '../src/pages/RegisterVehicle';
import { getAvailabilityForHours, getZone } from '../src/services/zoneService';
import { createVehicle, getVehicles } from '../src/services/vehicleService';
import { createReservation } from '../src/services/reservationService';
import { translateError } from '../src/utils/errorMessages';
import { REQUIRED_MESSAGE } from '../src/utils/validators';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({ getZone: jest.fn(), getAvailabilityForHours: jest.fn() }));
jest.mock('../src/services/vehicleService', () => ({ getVehicles: jest.fn(), createVehicle: jest.fn() }));
jest.mock('../src/services/reservationService', () => ({ createReservation: jest.fn() }));

// HU-31: the zone accepts cars and trucks, the trucks full now. Its id is a
// UUID, as the API gives it: the register screen only comes back to one.
const ZONE_ID = 'a1b2c3d4-0000-4000-8000-000000000001';
const CAR = { vehicleType: 'car', totalSlots: 20, availableSlots: 12, hourlyRate: 3000 };
const TRUCK = { vehicleType: 'truck', totalSlots: 4, availableSlots: 0, hourlyRate: 6000 };
const zoneWith = (vehicleTypes) => ({
    id: ZONE_ID,
    name: 'Centro',
    address: 'Calle 1 # 2-3',
    totalSlots: vehicleTypes.reduce((sum, t) => sum + t.totalSlots, 0),
    availableSlots: vehicleTypes.reduce((sum, t) => sum + t.availableSlots, 0),
    vehicleTypes,
    isActive: true,
    open24h: true,
    schedule: [],
});
const ZONE = zoneWith([CAR, TRUCK]);

// The default vehicle comes first (AC-03 of HU-14): here a motorcycle
const MOTO = { id: 'v-moto', plate: 'ABC12D', vehicleType: 'motorcycle', brand: 'Yamaha', model: 'FZ', color: 'Negro', isDefault: true };
const KIA = { id: 'v-car', plate: 'GHT421', vehicleType: 'car', brand: 'Kia', model: 'Rio', color: 'Rojo', isDefault: false };
const NHR = { id: 'v-truck', plate: 'TRK123', vehicleType: 'truck', brand: 'Chevrolet', model: 'NHR', color: 'Blanco', isDefault: false };

// The fields take the local date and time of the browser
const pad = (n) => String(n).padStart(2, '0');
function tomorrowAt(hours) {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(hours, 0, 0, 0);
    return d;
}
const localDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const localTime = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const change = (id, value) => fireEvent.change(document.getElementById(id), { target: { value } });
function typeHours(entry, exit) {
    change('startDate', localDate(entry));
    change('startTime', localTime(entry));
    change('endDate', localDate(exit));
    change('endTime', localTime(exit));
}

// Where the app went, and with which state
function Where() {
    const location = useLocation();
    return <output data-testid="where">{location.pathname + location.search}</output>;
}

async function renderScreen({ zone = ZONE, vehicles = [MOTO, KIA, NHR], state } = {}) {
    getZone.mockResolvedValue({ data: { zone } });
    getVehicles.mockResolvedValue({ data: { vehicles } });
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={[{ pathname: `/reserve/${ZONE_ID}`, state }]}>
            <Routes>
                <Route path="/reserve/:zoneId" element={<ReserveSpot />} />
                <Route path="/reservations/:id" element={<p>Confirmación</p>} />
                <Route path="/vehicles/new" element={<RegisterVehicle />} />
                <Route path="/zones" element={<p>Lista de zonas</p>} />
            </Routes>
            <Where />
        </MemoryRouter>,
    );
    await screen.findByRole('heading', { name: 'Reservar cupo' });
    return user;
}

const select = () => screen.getByLabelText(/^Vehículo/);
const optionOf = (plate) => within(select()).getAllByRole('option').find((o) => o.textContent.startsWith(plate));
const where = () => screen.getByTestId('where').textContent;
const rateLine = () => document.getElementById('vehicleId-rate');

beforeEach(() => {
    getZone.mockReset();
    getVehicles.mockReset();
    createVehicle.mockReset();
    createReservation.mockReset();
    getAvailabilityForHours.mockReset().mockReturnValue(new Promise(() => {}));
});

describe('The vehicles the zone accepts (AC-10)', () => {
    test('a vehicle of a type the zone does not accept is in the list, disabled, with why', async () => {
        // Act
        await renderScreen();

        // Assert
        expect(optionOf('ABC12D')).toBeDisabled();
        expect(optionOf('ABC12D')).toHaveTextContent(/^ABC12D · Moto \(esta zona no recibe motos\)$/);
        expect(optionOf('GHT421')).toBeEnabled();
        expect(optionOf('GHT421')).toHaveTextContent(/^GHT421 · Carro · Kia Rio · Rojo$/);
        expect(optionOf('TRK123')).toBeEnabled();
        expect(optionOf('TRK123')).toHaveTextContent(/^TRK123 · Camión · Chevrolet NHR · Blanco$/);
    });

    test('the first vehicle that fits is chosen, though the default one comes first', async () => {
        // Act
        await renderScreen();

        // Assert
        expect(select()).toHaveValue('v-car');
    });

    test('the default vehicle, when it fits, is chosen and says so', async () => {
        // Act
        await renderScreen({ vehicles: [{ ...KIA, isDefault: true }, NHR] });

        // Assert
        expect(select()).toHaveValue('v-car');
        expect(optionOf('GHT421')).toHaveTextContent(/^GHT421 · Carro · Kia Rio · Rojo \(Predeterminado\)$/);
    });

    test('the zone says which types it accepts, and the spots and the rate of the chosen one', async () => {
        // Act
        await renderScreen();

        // Assert
        expect(screen.getByText('Recibe carros y camiones.')).toBeInTheDocument();
        expect(screen.getByText('cupos de carros libres ahora').parentElement).toHaveTextContent(/^12\s*de\s*20\s*cupos de carros libres ahora$/);
        expect(screen.getByText('Disponible')).toBeInTheDocument();
        expect(screen.getByText('Tarifa por hora de carros').nextElementSibling).toHaveTextContent('$ 3.000');
    });

    test('under the vehicle, the rate of its type, heard when it changes', async () => {
        // Act
        await renderScreen();

        // Assert
        expect(rateLine()).toHaveTextContent('Tarifa para carros: $ 3.000 por hora.');
        expect(rateLine()).toHaveAttribute('aria-live', 'polite');
        expect(select()).toHaveAccessibleDescription('Tarifa para carros: $\u00a03.000 por hora.');
    });

    test('another vehicle of another type changes the spots, the rate and the total', async () => {
        // Arrange
        const user = await renderScreen();
        typeHours(tomorrowAt(10), tomorrowAt(12));
        expect(screen.getByText('(Tarifa: $ 3.000 x 2 horas)')).toBeInTheDocument();
        expect(screen.getByText('$ 6.000')).toBeInTheDocument();

        // Act
        await user.selectOptions(select(), 'v-truck');

        // Assert: the trucks are full now, but other hours may have room
        expect(screen.getByText('cupos de camiones libres ahora').parentElement).toHaveTextContent(/^0\s*de\s*4\s*cupos de camiones libres ahora$/);
        expect(screen.getByText('Llena')).toBeInTheDocument();
        expect(screen.getByText('No hay cupos de camiones en este momento, pero puedes reservar para otro horario.')).toBeInTheDocument();
        expect(screen.getByText('Tarifa por hora de camiones').nextElementSibling).toHaveTextContent('$ 6.000');
        expect(rateLine()).toHaveTextContent('Tarifa para camiones: $ 6.000 por hora.');
        expect(screen.getByText('(Tarifa: $ 6.000 x 2 horas)')).toBeInTheDocument();
        expect(screen.getByText('$ 12.000')).toBeInTheDocument();
    });

    test('an open stay pays the first hour of the type of the vehicle', async () => {
        // Arrange
        const user = await renderScreen();
        await user.selectOptions(select(), 'v-truck');

        // Act
        change('startDate', localDate(tomorrowAt(10)));
        change('startTime', localTime(tomorrowAt(10)));
        await user.click(screen.getByRole('checkbox', { name: 'Tiempo indefinido' }));

        // Assert
        expect(screen.getByText('A pagar al confirmar').nextElementSibling).toHaveTextContent('$ 6.000');
        expect(screen.getByText('(Primera hora. Luego $ 6.000 por cada hora empezada)')).toBeInTheDocument();
    });

    test('the free spots for the hours are of the type of the vehicle, and are asked again for another type', async () => {
        // Arrange
        getAvailabilityForHours.mockImplementation((id, { vehicleType }) => Promise.resolve({ data: { availableSlots: vehicleType === 'car' ? 7 : 1 } }));
        const user = await renderScreen();
        typeHours(tomorrowAt(10), tomorrowAt(12));
        expect(await screen.findByText('Hay 7 cupos de carros para ese horario.')).toBeInTheDocument();

        // Act
        await user.selectOptions(select(), 'v-truck');

        // Assert
        expect(await screen.findByText('Hay 1 cupo de camiones para ese horario.')).toBeInTheDocument();
        expect(getAvailabilityForHours).toHaveBeenCalledTimes(2);
        expect(getAvailabilityForHours).toHaveBeenLastCalledWith(
            ZONE_ID,
            { vehicleType: 'truck', startTime: tomorrowAt(10).toISOString(), endTime: tomorrowAt(12).toISOString() },
            { signal: expect.any(AbortSignal) },
        );
    });

    test('the reservation is sent with the chosen vehicle', async () => {
        // Arrange
        createReservation.mockResolvedValue({ data: { reservation: { id: 'r1' } } });
        const user = await renderScreen();
        await user.selectOptions(select(), 'v-truck');
        typeHours(tomorrowAt(10), tomorrowAt(12));

        // Act
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({ zoneId: ZONE_ID, vehicleId: 'v-truck' }));
        expect(await screen.findByText('Confirmación')).toBeInTheDocument();
    });

    test('the reservation is sent with the vehicle chosen by default', async () => {
        // Arrange
        createReservation.mockResolvedValue({ data: { reservation: { id: 'r1' } } });
        const user = await renderScreen();
        typeHours(tomorrowAt(10), tomorrowAt(12));

        // Act
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        expect(createReservation).toHaveBeenCalledWith(expect.objectContaining({ vehicleId: 'v-car' }));
    });

    test('another vehicle takes the error of the one before away', async () => {
        // Arrange: the car has a reservation at those hours
        createReservation.mockRejectedValue({ response: { status: 409, data: { code: 'VEHICLE_RESERVATION_OVERLAP' } } });
        const user = await renderScreen();
        typeHours(tomorrowAt(10), tomorrowAt(12));
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));
        expect(await screen.findByText(translateError('VEHICLE_RESERVATION_OVERLAP'))).toBeInTheDocument();

        // Act
        await user.selectOptions(select(), 'v-truck');

        // Assert
        expect(screen.queryByText(translateError('VEHICLE_RESERVATION_OVERLAP'))).not.toBeInTheDocument();
        expect(select()).not.toHaveAttribute('aria-invalid', 'true');
    });

    test('without the vehicles (they could not be loaded), the zone shows all its spots and no rate', async () => {
        // Arrange
        getZone.mockResolvedValue({ data: { zone: ZONE } });
        getVehicles.mockRejectedValue(new Error('Network Error'));
        render(
            <MemoryRouter initialEntries={[`/reserve/${ZONE_ID}`]}>
                <Routes>
                    <Route path="/reserve/:zoneId" element={<ReserveSpot />} />
                </Routes>
            </MemoryRouter>,
        );

        // Act
        await screen.findByText('No pudimos cargar tus vehículos.');
        typeHours(tomorrowAt(10), tomorrowAt(12));
        await new Promise((resolve) => setTimeout(resolve, 700));

        // Assert: nothing is asked without a type, and the form says what is missing
        expect(screen.getByText('cupos libres ahora').parentElement).toHaveTextContent(/^12\s*de\s*24\s*cupos libres ahora$/);
        expect(screen.queryByText(/^Tarifa por hora de/)).not.toBeInTheDocument();
        expect(rateLine()).toBeNull();
        expect(screen.queryByText('Resumen de la reserva')).not.toBeInTheDocument();
        expect(getAvailabilityForHours).not.toHaveBeenCalled();
        fireEvent.click(screen.getByRole('button', { name: 'Reservar cupo' }));
        expect(await screen.findByText(REQUIRED_MESSAGE)).toBeInTheDocument();
        expect(createReservation).not.toHaveBeenCalled();
    });
});

describe('Back from registering a vehicle (AC-11, #217)', () => {
    test('the new vehicle is chosen, though it is not the first one', async () => {
        // Act
        await renderScreen({ state: { vehicleAdded: true, vehicleId: 'v-truck' } });

        // Assert
        expect(select()).toHaveValue('v-truck');
        expect(screen.getByText('Vehículo registrado correctamente. Ya quedó seleccionado para tu reserva.')).toBeInTheDocument();
    });

    test('a new vehicle the zone does not accept is not chosen, and the screen says so', async () => {
        // Act
        await renderScreen({ state: { vehicleAdded: true, vehicleId: 'v-moto' } });

        // Assert
        expect(select()).toHaveValue('v-car');
        expect(screen.getByText('Vehículo registrado correctamente, pero esta zona no recibe ese tipo de vehículo.')).toBeInTheDocument();
    });

    test('a state without the id of the vehicle keeps the message of the first vehicle', async () => {
        // Act
        await renderScreen({ vehicles: [KIA], state: { vehicleAdded: true } });

        // Assert
        expect(select()).toHaveValue('v-car');
        expect(screen.getByText('Vehículo registrado correctamente. Ya quedó seleccionado para tu reserva.')).toBeInTheDocument();
    });
});

describe('The register screen gives back the new vehicle (AC-11)', () => {
    // What the reserve screen gets back from the register screen
    function State() {
        const location = useLocation();
        return <output data-testid="state">{JSON.stringify(location.state)}</output>;
    }

    async function register(state) {
        createVehicle.mockResolvedValue({ data: { vehicle: { id: 'v-new' } } });
        const user = userEvent.setup();
        render(
            <MemoryRouter initialEntries={[{ pathname: '/vehicles/new', state }]}>
                <Routes>
                    <Route path="/vehicles/new" element={<RegisterVehicle />} />
                    <Route path="/reserve/:zoneId" element={<State />} />
                    <Route path="/vehicles" element={<State />} />
                </Routes>
            </MemoryRouter>,
        );
        await user.selectOptions(screen.getByLabelText(/Tipo de vehículo/), 'car');
        await user.type(screen.getByLabelText(/Placa/), 'JKL345');
        await user.type(screen.getByLabelText(/Marca/), 'Mazda');
        await user.type(screen.getByLabelText(/Modelo/), 'Dos');
        await user.type(screen.getByLabelText(/Color/), 'Gris');
        await user.click(screen.getByRole('button', { name: 'Registrar vehículo' }));
        return JSON.parse((await screen.findByTestId('state')).textContent);
    }

    test('coming from a reservation, with the id of the vehicle, so that one is chosen', async () => {
        expect(await register({ returnTo: `/reserve/${ZONE_ID}` })).toEqual({ vehicleAdded: true, vehicleId: 'v-new' });
    });

    test('coming from "Mis vehículos", without it', async () => {
        expect(await register(null)).toEqual({ vehicleAdded: true });
    });
});

describe('None of the vehicles fits (AC-11)', () => {
    test('says so, shows no form and offers the zones for motorcycles and registering a vehicle', async () => {
        // Act
        await renderScreen({ vehicles: [MOTO] });

        // Assert
        expect(screen.getByText('Esta zona recibe carros y camiones, y ninguno de tus vehículos es de esos tipos.')).toBeInTheDocument();
        expect(screen.getByRole('heading', { name: 'Centro' })).toBeInTheDocument();
        expect(screen.queryByLabelText(/^Vehículo/)).not.toBeInTheDocument();
        expect(document.getElementById('startDate')).toBeNull();
        expect(screen.queryByRole('button', { name: 'Reservar cupo' })).not.toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver zonas para motos' })).toHaveAttribute('href', '/zones?type=motorcycle');
        expect(screen.getByRole('link', { name: 'Registrar un vehículo' })).toHaveAttribute('href', '/vehicles/new');
        expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    test('a zone of one type says "ese tipo"', async () => {
        // Act
        await renderScreen({ zone: zoneWith([CAR]), vehicles: [MOTO] });

        // Assert
        expect(screen.getByText('Esta zona recibe carros, y ninguno de tus vehículos es de ese tipo.')).toBeInTheDocument();
    });

    test('offers the zones of each type the user has, once each', async () => {
        // Act: two motorcycles and a truck, and a zone for cars
        await renderScreen({ zone: zoneWith([CAR]), vehicles: [MOTO, { ...MOTO, id: 'v-moto-2', plate: 'XYZ98E' }, NHR] });

        // Assert
        const links = screen.getAllByRole('link').map((link) => [link.textContent, link.getAttribute('href')]);
        expect(links).toEqual([
            ['Ver zonas para motos', '/zones?type=motorcycle'],
            ['Ver zonas para camiones', '/zones?type=truck'],
            ['Registrar un vehículo', '/vehicles/new'],
        ]);
    });

    test('"Ver zonas para motos" opens the list with that filter', async () => {
        // Arrange
        const user = await renderScreen({ vehicles: [MOTO] });

        // Act
        await user.click(screen.getByRole('link', { name: 'Ver zonas para motos' }));

        // Assert
        expect(screen.getByText('Lista de zonas')).toBeInTheDocument();
        expect(where()).toBe('/zones?type=motorcycle');
    });

    test('after registering a car, the user comes back to this zone with the car chosen', async () => {
        // Arrange
        const user = await renderScreen({ vehicles: [MOTO] });
        createVehicle.mockResolvedValue({ data: { vehicle: { id: 'v-new' } } });

        // Act: register a car
        await user.click(screen.getByRole('link', { name: 'Registrar un vehículo' }));
        await user.selectOptions(await screen.findByLabelText(/Tipo de vehículo/), 'car');
        await user.type(screen.getByLabelText(/Placa/), 'JKL345');
        await user.type(screen.getByLabelText(/Marca/), 'Mazda');
        await user.type(screen.getByLabelText(/Modelo/), 'Dos');
        await user.type(screen.getByLabelText(/Color/), 'Gris');
        getVehicles.mockResolvedValue({ data: { vehicles: [MOTO, { id: 'v-new', plate: 'JKL345', vehicleType: 'car', brand: 'Mazda', model: 'Dos', color: 'Gris', isDefault: false }] } });
        await user.click(screen.getByRole('button', { name: 'Registrar vehículo' }));

        // Assert
        expect(await screen.findByText('Vehículo registrado correctamente. Ya quedó seleccionado para tu reserva.')).toBeInTheDocument();
        expect(where()).toBe(`/reserve/${ZONE_ID}`);
        expect(select()).toHaveValue('v-new');
    });

    test('back with a vehicle that does not fit either, it says it was registered', async () => {
        // Act
        await renderScreen({ vehicles: [MOTO], state: { vehicleAdded: true, vehicleId: 'v-moto' } });

        // Assert
        expect(screen.getByText('Vehículo registrado correctamente.')).toHaveAttribute('role', 'status');
        expect(screen.getByRole('link', { name: 'Ver zonas para motos' })).toBeInTheDocument();
    });
});

describe('A type turned off while the screen was open (AC-12)', () => {
    test('the message of the code names no type', () => {
        expect(translateError('VEHICLE_TYPE_NOT_ACCEPTED')).toBe('Esta zona no recibe este tipo de vehículo');
    });

    test('the reservation answers 409: the zone is read again and another vehicle that fits is chosen', async () => {
        // Arrange: the trucks are turned off after the screen opened
        createReservation.mockRejectedValue({ response: { status: 409, data: { code: 'VEHICLE_TYPE_NOT_ACCEPTED', acceptedTypes: ['car'] } } });
        const user = await renderScreen();
        await user.selectOptions(select(), 'v-truck');
        typeHours(tomorrowAt(10), tomorrowAt(12));
        getZone.mockResolvedValue({ data: { zone: zoneWith([CAR]) } });

        // Act
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        const message = await screen.findByRole('alert');
        expect(message).toHaveTextContent('Esta zona ya no recibe camiones. Revisa el vehículo elegido y la tarifa antes de reservar.');
        expect(getZone).toHaveBeenCalledTimes(2);
        await waitFor(() => expect(optionOf('TRK123')).toBeDisabled());
        expect(optionOf('TRK123')).toHaveTextContent('TRK123 · Camión (esta zona no recibe camiones)');
        expect(select()).toHaveValue('v-car');
        expect(rateLine()).toHaveTextContent('Tarifa para carros: $ 3.000 por hora.');
        expect(screen.getByText('Recibe carros.')).toBeInTheDocument();
    });

    test('when no vehicle fits anymore, the screen says that the zone stopped accepting it, with the focus there', async () => {
        // Arrange: only the truck fits, and the trucks are turned off
        createReservation.mockRejectedValue({ response: { status: 409, data: { code: 'VEHICLE_TYPE_NOT_ACCEPTED', acceptedTypes: ['car'] } } });
        const user = await renderScreen({ vehicles: [MOTO, NHR] });
        typeHours(tomorrowAt(10), tomorrowAt(12));
        getZone.mockResolvedValue({ data: { zone: zoneWith([CAR]) } });

        // Act
        await user.click(screen.getByRole('button', { name: 'Reservar cupo' }));

        // Assert
        const message = await screen.findByText('Esta zona dejó de recibir camiones.');
        expect(message).toHaveAttribute('role', 'alert');
        expect(message).toHaveFocus();
        expect(screen.getByText('Esta zona recibe carros, y ninguno de tus vehículos es de ese tipo.')).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver zonas para motos' })).toBeInTheDocument();
        expect(screen.getByRole('link', { name: 'Ver zonas para camiones' })).toBeInTheDocument();
    });

    test('the free spots for the hours answer 409: the zone is read again and the screen says so', async () => {
        // Arrange
        getAvailabilityForHours.mockRejectedValue({ response: { status: 409, data: { code: 'VEHICLE_TYPE_NOT_ACCEPTED', acceptedTypes: ['car'] } } });
        const user = await renderScreen();
        await user.selectOptions(select(), 'v-truck');
        getZone.mockResolvedValue({ data: { zone: zoneWith([CAR]) } });

        // Act
        typeHours(tomorrowAt(10), tomorrowAt(12));

        // Assert: the car is chosen, since the trucks are off, and the screen says why
        await waitFor(() => expect(getZone).toHaveBeenCalledTimes(2), { timeout: 2000 });
        await waitFor(() => expect(select()).toHaveValue('v-car'));
        expect(optionOf('TRK123')).toBeDisabled();
        expect(screen.getByRole('alert')).toHaveTextContent('Esta zona ya no recibe camiones. Revisa el vehículo elegido y la tarifa antes de reservar.');
        expect(select()).toHaveAccessibleDescription(/^Esta zona ya no recibe camiones/);
    });
});
