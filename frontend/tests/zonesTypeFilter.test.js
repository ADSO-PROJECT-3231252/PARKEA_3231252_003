import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones } from '../src/services/zoneService';

// The screen does not call the real API
jest.mock('../src/services/zoneService', () => ({ getZones: jest.fn() }));

// jsdom cannot draw the map: its pieces only render what they hold, so the
// summary of every pin is in the page, as if it were open. With
// mockTilesFail, the tiles fail as soon as the map opens.
let mockTilesFail = false;
jest.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => children,
    TileLayer: function TileLayer({ eventHandlers }) {
        const { useEffect } = jest.requireActual('react');
        useEffect(() => {
            if (mockTilesFail) [1, 2, 3].forEach(() => eventHandlers.tileerror());
        }, [eventHandlers]);
        return null;
    },
    ZoomControl: () => null,
    Marker: ({ children, icon }) => (
        <div data-testid="pin">
            <div dangerouslySetInnerHTML={{ __html: icon.options.html }} />
            {children}
        </div>
    ),
    Popup: ({ children }) => children,
    useMap: () => ({ closePopup: jest.fn() }),
}));

// HU-31: zones as GET /zones sends them, the ones with more spots free first,
// each with the types that take reservations
const type = (vehicleType, availableSlots, totalSlots, hourlyRate) => ({ vehicleType, availableSlots, totalSlots, hourlyRate });
const zone = (id, name, types) => ({
    id,
    name,
    address: 'Calle 1 # 2-3',
    totalSlots: types.reduce((sum, t) => sum + t.totalSlots, 0),
    availableSlots: types.reduce((sum, t) => sum + t.availableSlots, 0),
    vehicleTypes: types,
    isActive: true,
    open24h: true,
    schedule: [],
    latitude: '4.8100000',
    longitude: '-75.6900000',
});
// Cars and motorcycles, the motorcycles full
const CENTRO = zone('zone-centro', 'Parqueadero Centro', [type('car', 18, 20, 3000), type('motorcycle', 0, 10, 1500)]);
// Only motorcycles, with room
const BOLIVAR = zone('zone-bolivar', 'Av. Simón Bolívar', [type('motorcycle', 8, 10, 1200)]);
// Only cars
const ESTADIO = zone('zone-estadio', 'Estadio', [type('car', 2, 10, 2500)]);
const ZONES = [CENTRO, BOLIVAR, ESTADIO];

// Where the screen is: the path and the query
function Where() {
    const location = useLocation();
    return <output data-testid="where">{location.pathname + location.search}</output>;
}

// The back button of the browser
function Back() {
    const navigate = useNavigate();
    return <button type="button" onClick={() => navigate(-1)}>Atrás</button>;
}

function renderZones(entries = ['/zones'], zones = ZONES) {
    getZones.mockResolvedValue({ data: { zones } });
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
            <AuthProvider>
                <Routes>
                    <Route path="/" element={<p>Inicio</p>} />
                    <Route path="/zones" element={<Zones />} />
                    <Route path="/reserve/:zoneId" element={<p>Pantalla de reserva</p>} />
                    <Route path="/login" element={<p>Pantalla de inicio de sesión</p>} />
                </Routes>
                <Where />
                <Back />
            </AuthProvider>
        </MemoryRouter>,
    );
    return user;
}

const where = () => screen.getByTestId('where').textContent;
const filter = () => screen.getByRole('group', { name: 'Tipo de vehículo' });
const option = (name) => within(filter()).getByRole('radio', { name });
// The names of the zones of the list, in order
const listed = () => screen.queryAllByRole('heading', { level: 2 }).map((heading) => heading.textContent);
// The hidden status message of the screen (#331)
const searchStatus = () => screen.getAllByRole('status').find((element) => element.className.includes('sr-only'));
// The text of the empty list (the hidden status says it too)
const shownText = (text) => screen.getAllByText(text).find((element) => !element.className.includes('sr-only'));
const card = (name) => screen.getByRole('heading', { level: 2, name }).parentElement.parentElement;

beforeEach(() => {
    localStorage.clear();
    getZones.mockReset();
    mockTilesFail = false;
});

describe('The zone list shows the types of each zone (AC-08)', () => {
    test('each card has its types with their free spots now and their rates', async () => {
        // Act
        renderZones();
        await screen.findByText('Parqueadero Centro');

        // Assert
        const types = within(card('Parqueadero Centro')).getAllByRole('listitem').map((row) => row.textContent);
        expect(types).toEqual(['Carro, 18 libres, $\u00a03.000/h por hora', 'Moto, 0 libres, $\u00a01.500/h por hora']);
        expect(within(card('Av. Simón Bolívar')).getAllByRole('listitem')).toHaveLength(1);
        expect(within(card('Av. Simón Bolívar')).getByRole('listitem')).toHaveTextContent('Moto, 8 libres, $ 1.200/h por hora');
    });

    test('the card has no rate of the whole zone anymore', async () => {
        // Act
        renderZones();
        await screen.findByText('Parqueadero Centro');

        // Assert
        expect(screen.queryByText('Tarifa por hora')).not.toBeInTheDocument();
        expect(screen.queryByText('$\u00a0NaN', { exact: false })).not.toBeInTheDocument();
    });
});

describe('The filter by type of vehicle (AC-09)', () => {
    test('has "Todos", "Carro", "Moto" and "Camión", with "Todos" chosen', async () => {
        // Act
        renderZones();
        await screen.findByText('Parqueadero Centro');

        // Assert: a group with a visible name, and every zone listed
        expect(within(filter()).getAllByRole('radio').map((radio) => radio.labels[0].textContent)).toEqual(['Todos', 'Carro', 'Moto', 'Camión']);
        expect(option('Todos')).toBeChecked();
        expect(screen.getByText('Tipo de vehículo').tagName).toBe('LEGEND');
        expect(listed()).toEqual(['Parqueadero Centro', 'Av. Simón Bolívar', 'Estadio']);
        expect(searchStatus()).toBeEmptyDOMElement();
    });

    test('"Moto" shows the zones that accept motorcycles, the ones with more of them free first', async () => {
        // Arrange
        const user = renderZones();
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.click(option('Moto'));

        // Assert: Bolívar has 8 of 10 free, Centro none, and Estadio has no motorcycles
        expect(option('Moto')).toBeChecked();
        expect(listed()).toEqual(['Av. Simón Bolívar', 'Parqueadero Centro']);
        expect(where()).toBe('/zones?type=motorcycle');
        expect(searchStatus()).toHaveTextContent('2 zonas reciben motos.');
    });

    test('says "1 zona recibe" in singular', async () => {
        // Act: only Centro accepts motorcycles
        renderZones(['/zones?type=motorcycle'], [CENTRO, ESTADIO]);
        await screen.findByText('Parqueadero Centro');

        // Assert
        expect(searchStatus()).toHaveTextContent('1 zona recibe motos.');
    });

    test('with a search, says "1 zona encontrada que recibe" in singular', async () => {
        // Arrange
        const user = renderZones(['/zones?type=motorcycle']);
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), 'centro');

        // Assert
        expect(searchStatus()).toHaveTextContent('1 zona encontrada que recibe motos');
    });

    test('the arrows of the keyboard move between the options', async () => {
        // Arrange
        const user = renderZones();
        await screen.findByText('Parqueadero Centro');
        await user.click(option('Todos'));

        // Act
        await user.keyboard('{ArrowRight}');

        // Assert
        expect(option('Carro')).toBeChecked();
        expect(option('Carro')).toHaveFocus();
        expect(listed()).toEqual(['Parqueadero Centro', 'Estadio']);
    });

    test('"Todos" takes the filter out of the address', async () => {
        // Arrange
        const user = renderZones(['/zones?type=truck']);
        await screen.findByRole('button', { name: 'Ver todos los tipos' });

        // Act
        await user.click(option('Todos'));

        // Assert
        expect(where()).toBe('/zones');
        expect(listed()).toHaveLength(3);
        expect(searchStatus()).toBeEmptyDOMElement();
    });

    test('the address with the filter opens with it (a reload)', async () => {
        // Act
        renderZones(['/zones?type=motorcycle']);
        await screen.findByText('Parqueadero Centro');

        // Assert
        expect(option('Moto')).toBeChecked();
        expect(listed()).toEqual(['Av. Simón Bolívar', 'Parqueadero Centro']);
    });

    test('a value that is not a type is "Todos"', async () => {
        // Act
        renderZones(['/zones?type=bus']);
        await screen.findByText('Parqueadero Centro');

        // Assert
        expect(option('Todos')).toBeChecked();
        expect(listed()).toHaveLength(3);
    });

    test('the back button from the reserve screen comes back with the filter', async () => {
        // Arrange: a signed-in user
        localStorage.setItem('token', 'test-token');
        localStorage.setItem('user', JSON.stringify({ id: 'account-1', role: 'user', fullName: 'Cuenta de prueba' }));
        const user = renderZones(['/zones?type=motorcycle']);
        await user.click(await screen.findByRole('button', { name: 'Reservar en Av. Simón Bolívar' }));
        expect(screen.getByText('Pantalla de reserva')).toBeInTheDocument();

        // Act
        await user.click(screen.getByRole('button', { name: 'Atrás' }));

        // Assert
        expect(await screen.findByText('Av. Simón Bolívar')).toBeInTheDocument();
        expect(option('Moto')).toBeChecked();
        expect(listed()).toEqual(['Av. Simón Bolívar', 'Parqueadero Centro']);
    });

    test('changing the filter does not add steps to the back button', async () => {
        // Arrange: the list was opened from the home
        const user = renderZones(['/', '/zones']);
        await screen.findByText('Parqueadero Centro');
        await user.click(option('Moto'));
        await user.click(option('Camión'));

        // Act
        await user.click(screen.getByRole('button', { name: 'Atrás' }));

        // Assert
        expect(screen.getByText('Inicio')).toBeInTheDocument();
    });

    test('works together with the search', async () => {
        // Arrange
        const user = renderZones();
        await screen.findByText('Parqueadero Centro');
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), 'a');

        // Act
        await user.click(option('Carro'));

        // Assert: the search stays, and both apply
        expect(screen.getByLabelText('Buscar zonas por nombre')).toHaveValue('a');
        expect(listed()).toEqual(['Parqueadero Centro', 'Estadio']);
        expect(searchStatus()).toHaveTextContent('2 zonas encontradas que reciben carros');
    });

    test('the list goes back to page 1 when the filter changes', async () => {
        // Arrange: 12 zones for cars, more than one page
        const many = Array.from({ length: 12 }, (_, i) => zone(`zone-${i + 1}`, `Zona ${i + 1}`, [type('car', 5, 10, 3000)]));
        const user = renderZones(['/zones'], many);
        await screen.findByText('Zona 1');
        await user.click(screen.getByRole('button', { name: 'Página siguiente' }));
        expect(screen.getByText('Página 2 de 2')).toBeInTheDocument();

        // Act
        await user.click(option('Carro'));

        // Assert
        expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
        expect(listed()[0]).toBe('Zona 1');
    });

    test('the list goes back to page 1 also when the back button changes the filter', async () => {
        // Arrange: on page 2 without filter, then on the zones for cars
        const many = Array.from({ length: 12 }, (_, i) => zone(`zone-${i + 1}`, `Zona ${i + 1}`, [type('car', 5, 10, 3000)]));
        const user = renderZones(['/zones', '/zones?type=car'], many);
        await screen.findByText('Zona 1');
        await user.click(screen.getByRole('button', { name: 'Página siguiente' }));

        // Act
        await user.click(screen.getByRole('button', { name: 'Atrás' }));

        // Assert
        expect(option('Todos')).toBeChecked();
        expect(screen.getByText('Página 1 de 2')).toBeInTheDocument();
    });
});

describe('A filtered card is about that type (AC-09)', () => {
    test('the badge and the note are of motorcycles, though the zone has cars free', async () => {
        // Act
        renderZones(['/zones?type=motorcycle']);
        await screen.findByText('Parqueadero Centro');

        // Assert: the badge says it is full of motorcycles, also to a screen reader
        const centro = card('Parqueadero Centro');
        expect(within(centro).getByText('Llena')).toHaveTextContent('Llena para motos');
        expect(within(centro).getByText('para motos')).toHaveClass('sr-only');
        expect(within(centro).getByRole('button', { name: 'Reservar en Parqueadero Centro' }))
            .toHaveAccessibleDescription('No hay cupos de motos en este momento, pero puedes reservar para otro horario.');
    });

    test('without the filter, the same zone is about all its spots', async () => {
        // Act
        renderZones();
        await screen.findByText('Parqueadero Centro');

        // Assert
        const centro = card('Parqueadero Centro');
        expect(within(centro).getByText('Disponible')).toHaveTextContent(/^Disponible$/);
        expect(within(centro).getByRole('button', { name: 'Reservar en Parqueadero Centro' })).not.toHaveAccessibleDescription();
    });
});

describe('No zone for the filter (AC-09)', () => {
    test('says so and offers to see every type, which takes the focus to "Todos"', async () => {
        // Arrange
        const user = renderZones(['/zones?type=truck']);
        await screen.findByRole('button', { name: 'Ver todos los tipos' });
        expect(shownText('Ninguna zona recibe camiones en este momento.')).toBeInTheDocument();
        expect(searchStatus()).toHaveTextContent('Ninguna zona recibe camiones en este momento.');
        expect(screen.queryByText('Limpiar búsqueda', { selector: 'button' })).not.toBeInTheDocument();

        // Act
        await user.click(screen.getByRole('button', { name: 'Ver todos los tipos' }));

        // Assert
        expect(option('Todos')).toBeChecked();
        expect(option('Todos')).toHaveFocus();
        expect(listed()).toHaveLength(3);
        expect(where()).toBe('/zones');
    });

    test('with a search, it offers to clear the search and to see every type', async () => {
        // Arrange
        const user = renderZones(['/zones?type=motorcycle']);
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), 'estadio');

        // Assert
        expect(shownText('No se encontraron zonas con ese nombre que reciban motos.')).toBeInTheDocument();
        expect(searchStatus()).toHaveTextContent('No se encontraron zonas con ese nombre que reciban motos.');
        expect(screen.getByText('Limpiar búsqueda', { selector: 'button' })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: 'Ver todos los tipos' })).toBeInTheDocument();
    });

    test('without the filter, a search with no zone offers only to clear the search', async () => {
        // Arrange
        const user = renderZones();
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), 'zzz');

        // Assert
        expect(shownText('No se encontraron zonas con ese nombre.')).toBeInTheDocument();
        expect(screen.getByText('Limpiar búsqueda', { selector: 'button' })).toBeInTheDocument();
        expect(screen.queryByRole('button', { name: 'Ver todos los tipos' })).not.toBeInTheDocument();
    });
});

describe('The filter and the map (AC-09)', () => {
    // The map is downloaded apart (lazy), so the pins take a moment
    const pins = () => screen.findAllByTestId('pin', {}, { timeout: 3000 });

    test('"Mapa" and "Lista" keep the filter', async () => {
        // Act
        renderZones(['/zones?type=motorcycle']);
        await screen.findByText('Parqueadero Centro');

        // Assert
        expect(screen.getByRole('link', { name: 'Mapa' })).toHaveAttribute('href', '/zones?type=motorcycle&view=map');
        expect(screen.getByRole('link', { name: 'Lista' })).toHaveAttribute('href', '/zones?type=motorcycle');
    });

    test('switching to the map keeps the filter and the search', async () => {
        // Arrange
        const user = renderZones(['/zones?type=car']);
        await screen.findByText('Parqueadero Centro');
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), 'estadio');

        // Act
        await user.click(screen.getByRole('link', { name: 'Mapa' }));

        // Assert: only the pin of Estadio
        expect(await pins()).toHaveLength(1);
        expect(where()).toBe('/zones?type=car&view=map');
        expect(option('Carro')).toBeChecked();
        expect(screen.getByLabelText('Buscar zonas por nombre')).toHaveValue('estadio');
    });

    test('the filter changes the map without leaving it', async () => {
        // Arrange
        const user = renderZones(['/zones?view=map']);
        expect(await pins()).toHaveLength(3);

        // Act
        await user.click(option('Moto'));

        // Assert
        expect(await pins()).toHaveLength(2);
        expect(where()).toBe('/zones?view=map&type=motorcycle');
    });

    test('a pin of a filtered zone is of that type, and its summary too', async () => {
        // Act
        renderZones(['/zones?view=map&type=motorcycle']);
        const [bolivar, centro] = await pins();

        // Assert: Centro has cars free, but no motorcycles
        expect(bolivar).toHaveTextContent('Av. Simón Bolívar');
        expect(centro.querySelector('.zone-marker-pin')).toHaveClass('bg-danger');
        expect(centro.querySelector('.sr-only')).toHaveTextContent(', Llena, 0 de 10 cupos de motos');
        expect(within(centro).getByText('Llena')).toHaveTextContent('Llena para motos');
        expect(within(centro).getByRole('button', { name: 'Reservar en Parqueadero Centro' }))
            .toHaveAccessibleDescription('No hay cupos de motos en este momento, pero puedes reservar para otro horario.');
    });

    test('the summary of a pin shows the types of the zone (AC-08)', async () => {
        // Act
        renderZones(['/zones?view=map']);
        const [centro] = await pins();

        // Assert
        expect(within(centro).getByText('Disponible')).toHaveTextContent(/^Disponible$/);
        expect(within(centro).getAllByRole('listitem').map((row) => row.textContent))
            .toEqual(['Carro, 18 libres, $\u00a03.000/h por hora', 'Moto, 0 libres, $\u00a01.500/h por hora']);
        expect(centro.querySelector('.zone-marker-pin')).toHaveClass('bg-parkea-600');
    });

    test('when the map cannot load, the list keeps the filter', async () => {
        // Arrange: the tiles of the map fail
        mockTilesFail = true;

        // Act
        renderZones(['/zones?view=map&type=motorcycle']);

        // Assert
        expect(await screen.findByText('No pudimos cargar el mapa. Te mostramos la lista de zonas.', {}, { timeout: 3000 })).toBeInTheDocument();
        expect(where()).toBe('/zones?type=motorcycle');
        expect(option('Moto')).toBeChecked();
        expect(listed()).toEqual(['Av. Simón Bolívar', 'Parqueadero Centro']);
    });

    test('"Verlas en la lista" keeps the filter', async () => {
        // Arrange: a zone without its place on the map
        const user = renderZones(['/zones?view=map&type=motorcycle'], [CENTRO, { ...BOLIVAR, latitude: null, longitude: null }, ESTADIO]);
        await pins();

        // Act
        await user.click(screen.getByRole('button', { name: 'Verlas en la lista' }));

        // Assert
        expect(where()).toBe('/zones?type=motorcycle');
        expect(listed()).toEqual(['Av. Simón Bolívar', 'Parqueadero Centro']);
    });
});
