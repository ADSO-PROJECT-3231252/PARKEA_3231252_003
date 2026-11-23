import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Zones from '../src/pages/Zones';
import AdminZones from '../src/pages/AdminZones';
import { AuthProvider } from '../src/context/AuthContext';
import { getZones, getAllZones, toggleZone } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZones: jest.fn(),
    getAllZones: jest.fn(),
    toggleZone: jest.fn(),
}));

const zone = (id, name, address) => ({
    id, name, address, availableSlots: 5, totalSlots: 10, hourlyRate: '3000.00', isActive: true, open24h: true, schedule: [],
});
const SIMON = zone('zone-simon', 'Av. Simón Bolívar', 'Carrera 7 # 18-20');
const CENTRO = zone('zone-centro', 'Parqueadero Centro', 'Calle Córdoba # 4-20');

// The admin screen draws a table and cards, so a name can appear twice
const shown = (name) => screen.queryAllByText(name).length > 0;

describe('Searching zones without accents (#182)', () => {
    beforeEach(() => {
        localStorage.clear();
        getZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
    });

    test.each(['simon', 'SIMON', 'Simón'])('the public list finds "Av. Simón Bolívar" with "%s"', async (text) => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><Zones /></AuthProvider></MemoryRouter>);
        await screen.findByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zonas por nombre'), text);

        // Assert
        expect(await screen.findByText('Av. Simón Bolívar')).toBeInTheDocument();
        expect(shown('Parqueadero Centro')).toBe(false);
    });

    test.each(['simon', 'SIMON', 'Simón'])('zone management finds "Av. Simón Bolívar" with "%s"', async (text) => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
        await screen.findAllByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zona por nombre o dirección'), text);

        // Assert
        expect(shown('Av. Simón Bolívar')).toBe(true);
        expect(shown('Parqueadero Centro')).toBe(false);
    });

    test('zone management finds an address without its accents', async () => {
        // Arrange
        const user = userEvent.setup();
        render(<MemoryRouter><AdminZones /></MemoryRouter>);
        await screen.findAllByText('Parqueadero Centro');

        // Act
        await user.type(screen.getByLabelText('Buscar zona por nombre o dirección'), 'cordoba');

        // Assert
        expect(shown('Parqueadero Centro')).toBe(true);
        expect(shown('Av. Simón Bolívar')).toBe(false);
    });
});

// #331 (WCAG 2.1 SC 4.1.3): a screen reader hears how many zones a search found
// The hidden status message of the screen (the admin screen has another status
// for the messages of its actions)
const searchStatus = () => screen.getAllByRole('status').find((element) => element.className.includes('sr-only'));

async function openPublicList() {
    const user = userEvent.setup();
    render(<MemoryRouter><AuthProvider><Zones /></AuthProvider></MemoryRouter>);
    await screen.findByText('Parqueadero Centro');
    return { user, searchBox: screen.getByLabelText('Buscar zonas por nombre') };
}

async function openZoneManagement() {
    const user = userEvent.setup();
    render(<MemoryRouter><AdminZones /></MemoryRouter>);
    await screen.findAllByText('Parqueadero Centro');
    return { user, searchBox: screen.getByLabelText('Buscar zona por nombre o dirección') };
}

describe.each([
    ['the public list', openPublicList, 'No se encontraron zonas con ese nombre.', Zones],
    ['zone management', openZoneManagement, 'No se encontraron zonas con esa búsqueda o estado.', AdminZones],
])('%s announces the result of the search (#331)', (name, open, noResults, Screen) => {
    beforeEach(() => {
        localStorage.clear();
        getZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
    });

    test('the status message is in the page and empty while there is no search', async () => {
        // Act
        await open();

        // Assert
        expect(searchStatus()).toBeInTheDocument();
        expect(searchStatus()).toBeEmptyDOMElement();
    });

    test('it says how many zones were found', async () => {
        // Arrange: both names have an "r"
        const { user, searchBox } = await open();

        // Act
        await user.type(searchBox, 'r');

        // Assert
        expect(searchStatus()).toHaveTextContent('2 zonas encontradas');
    });

    test('it says "1 zona encontrada" in singular', async () => {
        // Arrange
        const { user, searchBox } = await open();

        // Act
        await user.type(searchBox, 'simon');

        // Assert
        expect(searchStatus()).toHaveTextContent('1 zona encontrada');
    });

    test('it says that no zone was found', async () => {
        // Arrange
        const { user, searchBox } = await open();

        // Act
        await user.type(searchBox, 'zzz');

        // Assert
        expect(searchStatus()).toHaveTextContent(noResults);
    });

    test('it counts every zone found, not only the ones of the first page', async () => {
        // Arrange: 11 zones have "parqueadero" in their name, more than one page
        const others = Array.from({ length: 10 }, (_, i) => zone(`zone-${i + 1}`, `Zona Parqueadero ${i + 1}`, `Calle ${i + 1}`));
        getZones.mockResolvedValue({ data: { zones: [SIMON, CENTRO, ...others] } });
        getAllZones.mockResolvedValue({ data: { zones: [SIMON, CENTRO, ...others] } });
        const { user, searchBox } = await open();

        // Act
        await user.type(searchBox, 'parqueadero');

        // Assert
        expect(searchStatus()).toHaveTextContent('11 zonas encontradas');
    });

    test('it stays empty while the zones cannot be loaded or are loading again', async () => {
        // Arrange: the zones cannot be loaded
        getZones.mockRejectedValue(new Error('Network Error'));
        getAllZones.mockRejectedValue(new Error('Network Error'));
        const user = userEvent.setup();
        render(<MemoryRouter><AuthProvider><Screen /></AuthProvider></MemoryRouter>);
        const retry = await screen.findByRole('button', { name: 'Reintentar' });

        // Act: a search while the error is shown
        await user.type(screen.getByRole('textbox'), 'r');

        // Assert: "no zones found" is not announced over the error
        expect(searchStatus()).toBeEmptyDOMElement();

        // Act: a retry that has not answered yet
        getZones.mockReturnValue(new Promise(() => {}));
        getAllZones.mockReturnValue(new Promise(() => {}));
        await user.click(retry);

        // Assert: nor while the zones are loading again
        expect(searchStatus()).toBeEmptyDOMElement();
    });

    test('it is empty again when the search is cleared', async () => {
        // Arrange
        const { user, searchBox } = await open();
        await user.type(searchBox, 'simon');

        // Act
        await user.clear(searchBox);

        // Assert
        expect(searchStatus()).toBeEmptyDOMElement();
    });
});

describe('Zone management also announces the status filter and the address (#331)', () => {
    beforeEach(() => {
        localStorage.clear();
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [SIMON, CENTRO] } });
    });

    test('filtering by inactive zones announces that there are none', async () => {
        // Arrange: both zones are active
        const { user } = await openZoneManagement();

        // Act
        await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'inactive');

        // Assert
        expect(searchStatus()).toHaveTextContent('No se encontraron zonas con esa búsqueda o estado.');
    });

    test('filtering by active zones announces how many there are', async () => {
        // Arrange
        const { user } = await openZoneManagement();

        // Act
        await user.selectOptions(screen.getByLabelText('Filtrar por estado'), 'active');

        // Assert
        expect(searchStatus()).toHaveTextContent('2 zonas encontradas');
    });

    test('searching by an address announces the zone it finds', async () => {
        // Arrange
        const { user, searchBox } = await openZoneManagement();

        // Act
        await user.type(searchBox, 'cordoba');

        // Assert
        expect(searchStatus()).toHaveTextContent('1 zona encontrada');
    });
});

describe('Setting the zone state from the admin list (#304)', () => {
    test.each([
        [true, 'Desactivar zona', false],
        [false, 'Activar zona', true],
    ])('when isActive is %s, confirming "%s" sends %s', async (initialState, action, desiredState) => {
        const user = userEvent.setup();
        const zone = { ...CENTRO, isActive: initialState };
        getAllZones.mockReset().mockResolvedValue({ data: { zones: [zone] } });
        toggleZone.mockReset().mockResolvedValue({
            data: { zone: { ...zone, isActive: desiredState } },
        });

        render(<MemoryRouter><AdminZones /></MemoryRouter>);

        const switches = await screen.findAllByRole('switch', { name: `Zona activa: ${zone.name}` });
        await user.click(switches[0]);
        expect(toggleZone).not.toHaveBeenCalled();

        await user.click(await screen.findByRole('button', { name: action }));
        expect(toggleZone).toHaveBeenCalledTimes(1);
        expect(toggleZone).toHaveBeenCalledWith(zone.id, desiredState);
    });
});
