import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegisterVehicle from '../src/pages/RegisterVehicle';
import EditVehicle from '../src/pages/EditVehicle';
import { createVehicle, getVehicle, updateVehicle } from '../src/services/vehicleService';
import { VEHICLE_TEXT_RULE_MESSAGE } from '../src/utils/vehicleRules';

// The screens do not call the real API
jest.mock('../src/services/vehicleService', () => ({
    createVehicle: jest.fn(),
    getVehicle: jest.fn(),
    updateVehicle: jest.fn(),
}));

const REQUIRED = 'Este campo es obligatorio.';
const field = (id) => document.getElementById(id);
const errorOf = (id) => document.getElementById(`${id}-error`);
const fill = (id, value) => fireEvent.change(field(id), { target: { value } });

// A rejection of the server for the fields it names, like express-validator sends it
const serverRejects = (...paths) => ({
    response: { data: { code: 'VALIDATION_ERROR', errors: paths.map((path) => ({ path, msg: 'x' })) } },
});

// The four values the rules reject in the tests: a symbol, a symbol that NFKC
// would write as a letter, a letter drawn as nothing and a text without a letter
const REJECTED = [
    ['brand', 'Mazda <b>', 'angle brackets'],
    ['model', '\u24C2', 'a circled letter, which NFKC would write as M'],
    ['color', 'Gris\u2122', 'a trade mark sign, which NFKC would write as TM'],
    ['brand', '\u3164', 'a Hangul filler, drawn as nothing'],
    ['model', '...', 'only periods'],
];

describe('Register a vehicle: brand, model and color (#234)', () => {
    async function submitWith(overrides = {}) {
        render(<MemoryRouter initialEntries={['/vehicles/new']}>
            <Routes>
                <Route path="/vehicles/new" element={<RegisterVehicle />} />
                <Route path="/vehicles" element={<p>Mis vehículos</p>} />
            </Routes>
        </MemoryRouter>);
        const values = { plate: 'ABC123', brand: 'Mazda', model: '3', color: 'Rojo', ...overrides };
        fireEvent.change(field('vehicleType'), { target: { value: 'car' } });
        for (const [id, value] of Object.entries(values)) fill(id, value);
        await userEvent.setup().click(screen.getByRole('button', { name: 'Registrar vehículo' }));
    }

    beforeEach(() => {
        createVehicle.mockReset().mockResolvedValue({ data: {} });
    });

    test.each(REJECTED)('the %s "%s" (%s) is marked on its own field and nothing is sent', async (name, value) => {
        // Act
        await submitWith({ [name]: value });

        // Assert
        expect(errorOf(name)).toHaveTextContent(VEHICLE_TEXT_RULE_MESSAGE[name]);
        expect(field(name)).toHaveAttribute('aria-invalid', 'true');
        for (const other of ['brand', 'model', 'color'].filter((id) => id !== name)) {
            expect(errorOf(other)).toBeNull();
        }
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('a brand with only spaces still says that the field is required', async () => {
        // Act
        await submitWith({ brand: '   ' });

        // Assert
        expect(errorOf('brand')).toHaveTextContent(REQUIRED);
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('real values are sent as normal text: full width letters, an accent written apart, extra spaces', async () => {
        // Act
        await submitWith({ brand: '\uFF2D\uFF41\uFF5A\uFF44\uFF41', model: '  Spark   GT ', color: 'Citroe\u0308n' });

        // Assert
        expect(createVehicle).toHaveBeenCalledTimes(1);
        expect(createVehicle.mock.calls[0][0]).toMatchObject({ brand: 'Mazda', model: 'Spark GT', color: 'Citro\u00EBn' });
    });

    test('a text that normalization makes longer than the limit is marked, and one that fits is sent', async () => {
        // Arrange: the ligature \uFB03 is one character that NFKC writes as "ffi" (three)
        // Act
        await submitWith({ brand: '\uFB03'.repeat(17) });

        // Assert: 17 become 51 characters, the limit of the brand is 50
        expect(errorOf('brand')).toHaveTextContent('Usa máximo 50 caracteres.');
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('a text that is 50 characters once normalized is sent', async () => {
        // Act: 16 ligatures become 48 characters
        await submitWith({ brand: '\uFB03'.repeat(16) });

        // Assert
        expect(createVehicle.mock.calls[0][0]).toMatchObject({ brand: 'ffi'.repeat(16) });
    });

    test('if the server rejects the brand, that field is marked and the banner says to check the marked fields', async () => {
        // Arrange
        createVehicle.mockRejectedValue(serverRejects('brand'));

        // Act
        await submitWith();

        // Assert
        expect(errorOf('brand')).toHaveTextContent(VEHICLE_TEXT_RULE_MESSAGE.brand);
        expect(screen.getByText('Revisa los campos marcados')).toBeInTheDocument();
    });

    test('if the server names a field this form does not mark, the banner does not point at marked fields', async () => {
        // Arrange
        createVehicle.mockRejectedValue(serverRejects('visualDescription'));

        // Act
        await submitWith();

        // Assert
        expect(screen.getByText('Ocurrió un error inesperado. Intenta de nuevo')).toBeInTheDocument();
        expect(screen.queryByText('Revisa los campos marcados')).toBeNull();
        expect(errorOf('brand')).toBeNull();
    });
});

describe('Edit a vehicle: brand, model and color (#234)', () => {
    const VEHICLE = { id: 'veh-1', plate: 'ABC123', vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo', visualDescription: '' };

    async function openEdit(vehicle = {}) {
        getVehicle.mockResolvedValue({ data: { vehicle: { ...VEHICLE, ...vehicle } } });
        render(<MemoryRouter initialEntries={['/vehicles/veh-1/edit']}>
            <Routes>
                <Route path="/vehicles/:id/edit" element={<EditVehicle />} />
                <Route path="/vehicles" element={<p>Mis vehículos</p>} />
            </Routes>
        </MemoryRouter>);
        await screen.findByRole('button', { name: 'Guardar cambios' });
    }

    const save = () => userEvent.setup().click(screen.getByRole('button', { name: 'Guardar cambios' }));

    beforeEach(() => {
        getVehicle.mockReset();
        updateVehicle.mockReset().mockResolvedValue({ data: {} });
    });

    test('a vehicle saved before the rule, with a symbol in its brand, marks that field when saving', async () => {
        // Arrange: the old brand comes from the API and fills the form
        await openEdit({ brand: 'Mazda <b>' });

        // Act
        await save();

        // Assert
        expect(errorOf('brand')).toHaveTextContent(VEHICLE_TEXT_RULE_MESSAGE.brand);
        expect(field('brand')).toHaveAttribute('aria-invalid', 'true');
        expect(errorOf('model')).toBeNull();
        expect(errorOf('color')).toBeNull();
        expect(updateVehicle).not.toHaveBeenCalled();
    });

    test('after fixing the brand, the vehicle is saved', async () => {
        // Arrange
        await openEdit({ brand: 'Mazda <b>' });
        await save();

        // Act
        fill('brand', 'Mazda');
        await save();

        // Assert
        expect(updateVehicle).toHaveBeenCalledTimes(1);
        expect(updateVehicle.mock.calls[0][1]).toMatchObject({ brand: 'Mazda' });
    });

    test.each(REJECTED)('the %s "%s" (%s) is marked on its own field and nothing is saved', async (name, value) => {
        // Arrange
        await openEdit();
        fill(name, value);

        // Act
        await save();

        // Assert
        expect(errorOf(name)).toHaveTextContent(VEHICLE_TEXT_RULE_MESSAGE[name]);
        expect(field(name)).toHaveAttribute('aria-invalid', 'true');
        expect(updateVehicle).not.toHaveBeenCalled();
    });

    test('real values are saved as normal text', async () => {
        // Arrange
        await openEdit();
        fill('brand', '\uFF2D\uFF41\uFF5A\uFF44\uFF41');
        fill('model', '  Spark   GT ');
        fill('color', 'Citroe\u0308n');

        // Act
        await save();

        // Assert
        expect(updateVehicle.mock.calls[0][1]).toMatchObject({ brand: 'Mazda', model: 'Spark GT', color: 'Citro\u00EBn' });
    });

    test('a text that normalization makes longer than the limit is marked', async () => {
        // Arrange: 17 ligatures become 51 characters, the limit of the brand is 50
        await openEdit();
        fill('brand', '\uFB03'.repeat(17));

        // Act
        await save();

        // Assert
        expect(errorOf('brand')).toHaveTextContent('Usa máximo 50 caracteres.');
        expect(updateVehicle).not.toHaveBeenCalled();
    });

    test('if the server rejects the color, that field is marked and the banner says to check the marked fields', async () => {
        // Arrange
        await openEdit();
        updateVehicle.mockRejectedValue(serverRejects('color'));

        // Act
        await save();

        // Assert
        expect(errorOf('color')).toHaveTextContent(VEHICLE_TEXT_RULE_MESSAGE.color);
        expect(screen.getByText('Revisa los campos marcados')).toBeInTheDocument();
    });
});
