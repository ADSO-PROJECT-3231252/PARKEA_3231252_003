import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import RegisterVehicle from '../src/pages/RegisterVehicle';
import EditVehicle from '../src/pages/EditVehicle';
import { createVehicle, getVehicle, updateVehicle } from '../src/services/vehicleService';

// The screens do not call the real API
jest.mock('../src/services/vehicleService', () => ({
    createVehicle: jest.fn(),
    getVehicle: jest.fn(),
    updateVehicle: jest.fn(),
}));

const field = (id) => document.getElementById(id);
const fill = (id, value) => fireEvent.change(field(id), { target: { value } });
const apiError = (status, data) => ({ response: { status, data } });
const serverRejects = (...paths) => apiError(400, {
    code: 'VALIDATION_ERROR',
    errors: paths.map((path) => ({ path, msg: 'x' })),
});

const LIMIT_MESSAGE = 'Alcanzaste el máximo de 5 vehículos activos. Elimina uno antes de registrar otro';

beforeEach(() => {
    jest.clearAllMocks();
});

// #390: on a phone the message of the server is far above the button, so after
// a failed save the focus goes to it (which also brings it into view), and an
// error found before sending moves the focus to the first field that fails
describe('Register a vehicle: the focus goes to the error (#390)', () => {
    function renderForm() {
        render(<MemoryRouter initialEntries={['/vehicles/new']}>
            <Routes>
                <Route path="/vehicles/new" element={<RegisterVehicle />} />
                <Route path="/vehicles" element={<p>Mis vehículos</p>} />
            </Routes>
        </MemoryRouter>);
    }

    function fillValid(overrides = {}) {
        const values = { vehicleType: 'car', plate: 'ABC123', brand: 'Mazda', model: '3', color: 'Rojo', ...overrides };
        for (const [id, value] of Object.entries(values)) fill(id, value);
    }

    const submit = (user) => user.click(screen.getByRole('button', { name: 'Registrar vehículo' }));

    test('the sixth vehicle: the limit message gets the focus', async () => {
        // Arrange
        createVehicle.mockRejectedValue(apiError(409, { code: 'VEHICLE_LIMIT_REACHED' }));
        const user = userEvent.setup();
        renderForm();
        fillValid();

        // Act
        await submit(user);

        // Assert
        const message = await screen.findByText(LIMIT_MESSAGE);
        expect(message).toHaveFocus();
    });

    test('an error 500: the generic message gets the focus', async () => {
        // Arrange
        createVehicle.mockRejectedValue(apiError(500, { code: 'INTERNAL_ERROR' }));
        const user = userEvent.setup();
        renderForm();
        fillValid();

        // Act
        await submit(user);

        // Assert
        const message = await screen.findByRole('alert');
        expect(message).toHaveFocus();
    });

    test('the server rejects the brand: the message gets the focus', async () => {
        // Arrange
        createVehicle.mockRejectedValue(serverRejects('brand'));
        const user = userEvent.setup();
        renderForm();
        fillValid();

        // Act
        await submit(user);

        // Assert: the banner, which is above the marked brand
        await screen.findByText((_, el) => el?.id === 'brand-error');
        const banner = document.querySelector('form > p[role="alert"]');
        expect(banner).not.toBeNull();
        expect(banner).toHaveFocus();
    });

    test('the same error twice in a row: the message gets the focus again', async () => {
        // Arrange
        createVehicle.mockRejectedValue(apiError(409, { code: 'VEHICLE_LIMIT_REACHED' }));
        const user = userEvent.setup();
        renderForm();
        fillValid();
        await submit(user);
        await screen.findByText(LIMIT_MESSAGE);

        // Act: the button takes the focus back and sends again
        await submit(user);

        // Assert
        expect(createVehicle).toHaveBeenCalledTimes(2);
        expect(await screen.findByText(LIMIT_MESSAGE)).toHaveFocus();
    });

    test('a plate already registered: the plate field, where the message is, gets the focus', async () => {
        // Arrange
        createVehicle.mockRejectedValue(apiError(409, { code: 'PLATE_ALREADY_REGISTERED' }));
        const user = userEvent.setup();
        renderForm();
        fillValid();

        // Act
        await submit(user);

        // Assert
        await screen.findByText((_, el) => el?.id === 'plate-error');
        expect(field('plate')).toHaveFocus();
    });

    test('an empty form: the type of vehicle, the first field, gets the focus and nothing is sent', async () => {
        // Arrange
        const user = userEvent.setup();
        renderForm();

        // Act
        await submit(user);

        // Assert
        expect(field('vehicleType')).toHaveFocus();
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test.each([
        ['plate', { plate: 'AB' }],
        ['brand', { brand: 'Mazda <b>' }],
        ['model', { model: '' }],
        ['color', { color: '...' }],
    ])('only the %s fails: that field gets the focus', async (id, overrides) => {
        // Arrange
        const user = userEvent.setup();
        renderForm();
        fillValid(overrides);

        // Act
        await submit(user);

        // Assert
        expect(field(id)).toHaveFocus();
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('the plate and the color fail: the plate, which comes first, gets the focus', async () => {
        // Arrange
        const user = userEvent.setup();
        renderForm();
        fillValid({ plate: 'AB', color: '' });

        // Act
        await submit(user);

        // Assert
        expect(field('plate')).toHaveFocus();
    });

    test('the fields fail one after another: each save moves the focus to the next one, in the order of the form', async () => {
        // Arrange: every field fails except the type
        const user = userEvent.setup();
        renderForm();
        fillValid({ plate: 'AB', brand: '', model: '', color: '' });
        const focused = [];

        // Act: each time, the field with the focus is corrected
        for (const [id, value] of [['plate', 'ABC123'], ['brand', 'Mazda'], ['model', '3'], ['color', 'Rojo']]) {
            await submit(user);
            focused.push(document.activeElement.id);
            fill(id, value);
        }

        // Assert
        expect(focused).toEqual(['plate', 'brand', 'model', 'color']);
        expect(createVehicle).not.toHaveBeenCalled();
    });

    test('after the focus moves to the error, the person can type in another field', async () => {
        // Arrange
        const user = userEvent.setup();
        renderForm();
        fillValid({ brand: '' });
        await submit(user);

        // Act
        await user.click(field('visualDescription'));
        await user.type(field('visualDescription'), 'Con rayón');

        // Assert
        expect(field('visualDescription')).toHaveFocus();
        expect(field('visualDescription')).toHaveValue('Con rayón');
    });
});

describe('Edit a vehicle: the focus goes to the error (#390)', () => {
    const VEHICLE = { id: 'veh-1', plate: 'ABC123', vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo', visualDescription: '' };

    async function openEdit() {
        getVehicle.mockResolvedValue({ data: { vehicle: VEHICLE } });
        render(<MemoryRouter initialEntries={['/vehicles/veh-1/edit']}>
            <Routes>
                <Route path="/vehicles/:id/edit" element={<EditVehicle />} />
                <Route path="/vehicles" element={<p>Mis vehículos</p>} />
            </Routes>
        </MemoryRouter>);
        await screen.findByRole('button', { name: 'Guardar cambios' });
    }

    const save = (user) => user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    test('an error 500: the generic message gets the focus', async () => {
        // Arrange
        updateVehicle.mockRejectedValue(apiError(500, { code: 'INTERNAL_ERROR' }));
        const user = userEvent.setup();
        await openEdit();

        // Act
        await save(user);

        // Assert
        const message = await screen.findByRole('alert');
        expect(message).toHaveFocus();
    });

    test('the server rejects the color: the message gets the focus', async () => {
        // Arrange
        updateVehicle.mockRejectedValue(serverRejects('color'));
        const user = userEvent.setup();
        await openEdit();

        // Act
        await save(user);

        // Assert
        await screen.findByText((_, el) => el?.id === 'color-error');
        const banner = document.querySelector('form > p[role="alert"]');
        expect(banner).not.toBeNull();
        expect(banner).toHaveFocus();
    });

    test('the server rejects the plate for the type: the type of vehicle gets the focus', async () => {
        // Arrange
        updateVehicle.mockRejectedValue(apiError(400, { code: 'INVALID_PLATE_FORMAT' }));
        const user = userEvent.setup();
        await openEdit();

        // Act
        await save(user);

        // Assert
        await screen.findByText((_, el) => el?.id === 'vehicleType-error');
        expect(field('vehicleType')).toHaveFocus();
    });

    test.each([
        ['brand', { brand: '' }],
        ['model', { model: 'Ⓜ' }],
        ['color', { color: 'Gris™' }],
    ])('only the %s fails: that field gets the focus and nothing is sent', async (id, overrides) => {
        // Arrange
        const user = userEvent.setup();
        await openEdit();
        for (const [name, value] of Object.entries(overrides)) fill(name, value);

        // Act
        await save(user);

        // Assert
        expect(field(id)).toHaveFocus();
        expect(updateVehicle).not.toHaveBeenCalled();
    });

    test('the brand and the color fail: the brand, which comes first, gets the focus', async () => {
        // Arrange
        const user = userEvent.setup();
        await openEdit();
        fill('brand', '');
        fill('color', '');

        // Act
        await save(user);

        // Assert
        expect(field('brand')).toHaveFocus();
    });

    test('the fields fail one after another: each save moves the focus to the next one, in the order of the form', async () => {
        // Arrange
        const user = userEvent.setup();
        await openEdit();
        fill('brand', '');
        fill('model', '');
        fill('color', '');
        const focused = [];

        // Act: each time, the field with the focus is corrected
        for (const [id, value] of [['brand', 'Mazda'], ['model', '3'], ['color', 'Rojo']]) {
            await save(user);
            focused.push(document.activeElement.id);
            fill(id, value);
        }

        // Assert
        expect(focused).toEqual(['brand', 'model', 'color']);
        expect(updateVehicle).not.toHaveBeenCalled();
    });

    test('after the focus moves to the error, the person can type in another field', async () => {
        // Arrange
        const user = userEvent.setup();
        await openEdit();
        fill('brand', '');
        await save(user);

        // Act
        await user.click(field('visualDescription'));
        await user.type(field('visualDescription'), 'Con rayón');

        // Assert
        expect(field('visualDescription')).toHaveFocus();
        expect(field('visualDescription')).toHaveValue('Con rayón');
    });
});
