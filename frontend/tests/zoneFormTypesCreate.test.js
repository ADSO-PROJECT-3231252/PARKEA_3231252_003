import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import CreateZone from '../src/pages/CreateZone';
import { createZone } from '../src/services/zoneService';

// The screens do not call the real API
jest.mock('../src/services/zoneService', () => ({
    getZone: jest.fn(),
    getAllZones: jest.fn(),
    createZone: jest.fn(),
    updateZone: jest.fn(),
    toggleZone: jest.fn(),
}));

// HU-31 AC-01 and AC-02: the vehicle types of a new zone in "Crear zona". The
// rules of the form are tested in zoneForm.test.js; here, what the
// administrator sees and does.

const checkbox = (name) => screen.getByRole('checkbox', { name });
const slotsOf = (plural) => screen.getByLabelText(new RegExp(`^Cupos de ${plural}`));
const rateOf = (plural) => screen.getByLabelText(new RegExp(`^Tarifa por hora de ${plural}`));
const save = (name) => screen.getByRole('button', { name });

// "Crear zona" with its name, address, location and hours already filled in
async function renderCreate() {
    const user = userEvent.setup();
    render(
        <MemoryRouter initialEntries={['/admin/zones/new']}>
            <Routes>
                <Route path="/admin/zones/new" element={<CreateZone />} />
                <Route path="/admin/zones" element={<p>Lista de zonas</p>} />
            </Routes>
        </MemoryRouter>,
    );
    await user.type(screen.getByLabelText(/Nombre de la zona/), 'Centro');
    await user.type(screen.getByLabelText(/Dirección/), 'Calle 1 # 2-3');
    await user.type(screen.getByLabelText(/^Latitud/), '4.81');
    await user.type(screen.getByLabelText(/^Longitud/), '-75.69');
    await user.click(screen.getByRole('radio', { name: /Abierta 24 horas/ }));
    return user;
}

beforeEach(() => {
    jest.clearAllMocks();
    createZone.mockResolvedValue({ data: { zone: { id: 'zone-1', name: 'Centro' } } });
});

describe('"Crear zona" with its vehicle types (HU-31 AC-01, AC-02)', () => {
    test('the types are a group with its legend, and a type shows its spots and rate only when it is checked', async () => {
        // Arrange
        const user = await renderCreate();
        const group = screen.getByRole('group', { name: /Tipos de vehículo/ });
        expect(within(group).getAllByRole('checkbox').map((box) => box.closest('li').textContent)).toEqual(['Carro', 'Moto', 'Camión']);
        expect(screen.queryByLabelText(/^Cupos de motos/)).not.toBeInTheDocument();

        // Act
        await user.click(checkbox('Moto'));

        // Assert
        expect(slotsOf('motos')).toBeInTheDocument();
        expect(rateOf('motos')).toBeInTheDocument();
        expect(screen.queryByLabelText(/^Cupos de carros/)).not.toBeInTheDocument();
    });

    test('a type checked after another starts with its rate, which can be changed', async () => {
        // Arrange
        const user = await renderCreate();
        await user.click(checkbox('Carro'));
        await user.type(rateOf('carros'), '2000');

        // Act
        await user.click(checkbox('Camión'));

        // Assert
        expect(rateOf('camiones')).toHaveValue('2000');
        await user.clear(rateOf('camiones'));
        await user.type(rateOf('camiones'), '5000');
        expect(rateOf('carros')).toHaveValue('2000');
        expect(rateOf('camiones')).toHaveAccessibleDescription('Se cobrarán $\u00a05.000 por cada hora de parqueo.');
    });

    test('the form shows the total of the checked types', async () => {
        // Arrange
        const user = await renderCreate();
        expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 0 cupos');

        // Act
        await user.click(checkbox('Carro'));
        await user.type(slotsOf('carros'), '20');
        await user.click(checkbox('Moto'));
        await user.type(slotsOf('motos'), '10');

        // Assert: an unchecked type does not count, and keeps what was typed
        expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 30 cupos');
        await user.click(checkbox('Moto'));
        expect(screen.getByText(/^Total:/)).toHaveTextContent('Total: 20 cupos');
        await user.click(checkbox('Moto'));
        expect(slotsOf('motos')).toHaveValue('10');
    });

    test('without a type checked, it says so and moves the focus to the first type', async () => {
        // Arrange
        const user = await renderCreate();

        // Act
        await user.click(save('Guardar zona'));

        // Assert
        expect(screen.getByRole('group', { name: /Tipos de vehículo/ })).toHaveAccessibleDescription('Marca al menos un tipo de vehículo.');
        expect(checkbox('Carro')).toHaveFocus();
        expect(createZone).not.toHaveBeenCalled();
    });

    test('the types come before the coordinates: with errors in both, the focus goes to the types', async () => {
        // Arrange: no type checked, and no latitude
        const user = await renderCreate();
        await user.clear(screen.getByLabelText(/^Latitud/));

        // Act
        await user.click(save('Guardar zona'));

        // Assert
        expect(screen.getByLabelText(/^Latitud/)).toHaveAccessibleDescription('Este campo es obligatorio.');
        expect(checkbox('Carro')).toHaveFocus();
    });

    test('each error goes next to its field, and the focus to the first one', async () => {
        // Arrange: motorcycles without spots, trucks without a rate
        const user = await renderCreate();
        await user.click(checkbox('Moto'));
        await user.type(rateOf('motos'), '1000');
        await user.click(checkbox('Camión'));
        await user.type(slotsOf('camiones'), '4');
        await user.clear(rateOf('camiones'));

        // Act
        await user.click(save('Guardar zona'));

        // Assert
        expect(slotsOf('motos')).toHaveAccessibleDescription('Este campo es obligatorio.');
        expect(rateOf('camiones')).toHaveAccessibleDescription('Este campo es obligatorio.');
        expect(slotsOf('motos')).toHaveFocus();
        expect(createZone).not.toHaveBeenCalled();
    });

    test('it sends the checked types, in the order car, motorcycle, truck', async () => {
        // Arrange
        const user = await renderCreate();
        await user.click(checkbox('Camión'));
        await user.type(slotsOf('camiones'), '4');
        await user.type(rateOf('camiones'), '5000');
        await user.click(checkbox('Carro'));
        await user.type(slotsOf('carros'), '20');

        // Act
        await user.click(save('Guardar zona'));

        // Assert
        expect(createZone.mock.calls[0][0].vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 20, hourlyRate: 5000 },
            { vehicleType: 'truck', totalSlots: 4, hourlyRate: 5000 },
        ]);
        expect(await screen.findByText('Lista de zonas')).toBeInTheDocument();
    });

    test('an error of the API on the second type goes next to that type', async () => {
        // Arrange
        const user = await renderCreate();
        await user.click(checkbox('Carro'));
        await user.type(slotsOf('carros'), '20');
        await user.type(rateOf('carros'), '2000');
        await user.click(checkbox('Moto'));
        await user.type(slotsOf('motos'), '10');
        createZone.mockRejectedValue({ response: { status: 400, data: { code: 'VALIDATION_ERROR', errors: [{ path: 'vehicleTypes[1].hourlyRate', msg: '...' }] } } });

        // Act
        await user.click(save('Guardar zona'));

        // Assert
        expect(await screen.findByText('Ingresa una tarifa válida en pesos.')).toBeInTheDocument();
        expect(rateOf('motos')).toHaveFocus();
    });
});

