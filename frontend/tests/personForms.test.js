import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import Register from '../src/pages/Register';
import Profile from '../src/pages/Profile';
import { AuthProvider } from '../src/context/AuthContext';
import { register } from '../src/services/authService';
import { getProfile, updateProfile, changePassword } from '../src/services/userService';
import { NAME_RULE_MESSAGE, PHONE_RULE_MESSAGE } from '../src/utils/personRules';

// The screens do not call the real API
jest.mock('../src/services/authService', () => ({ register: jest.fn() }));
jest.mock('../src/services/userService', () => ({
    getProfile: jest.fn(),
    updateProfile: jest.fn(),
    changePassword: jest.fn(),
}));

const field = (id) => document.getElementById(id);
const errorOf = (id) => document.getElementById(`${id}-error`);

// #312: the registration form uses the rules of utils/personRules.js
describe('Registration: full name and phone (#312)', () => {
    async function fillForm(user, { fullName = "Ana María Pérez-O'Neil", phone = '3001234567' } = {}) {
        render(<MemoryRouter><AuthProvider><Register /></AuthProvider></MemoryRouter>);
        await user.type(field('documentNumber'), '1012345678');
        await user.type(field('fullName'), fullName);
        await user.type(field('email'), 'ana@correo.test');
        await user.type(field('password'), 'Clave123*');
        await user.type(field('confirmPassword'), 'Clave123*');
        await user.type(field('phone'), phone);
    }

    beforeEach(() => {
        localStorage.clear();
        register.mockReset().mockResolvedValue({ data: {} });
    });

    test('sends the example of the card, with the phone written with spaces', async () => {
        // Arrange
        const user = userEvent.setup();
        await fillForm(user, { phone: '300 123 4567' });

        // Act
        await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

        // Assert
        expect(register).toHaveBeenCalledTimes(1);
        expect(register.mock.calls[0][0]).toMatchObject({ fullName: "Ana María Pérez-O'Neil", phone: '3001234567' });
    });

    test('rejects the name "12345 @@@" without calling the API', async () => {
        // Arrange
        const user = userEvent.setup();
        await fillForm(user, { fullName: '12345 @@@' });

        // Act
        await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

        // Assert
        expect(errorOf('fullName')).toHaveTextContent(NAME_RULE_MESSAGE);
        expect(field('fullName')).toHaveAttribute('aria-invalid', 'true');
        expect(register).not.toHaveBeenCalled();
    });

    test('rejects the phone "0000000000" without calling the API', async () => {
        // Arrange
        const user = userEvent.setup();
        await fillForm(user, { phone: '0000000000' });

        // Act
        await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

        // Assert
        expect(errorOf('phone')).toHaveTextContent(PHONE_RULE_MESSAGE);
        expect(register).not.toHaveBeenCalled();
    });

    test('the name field accepts 70 Unicode code points when pasted', async () => {
        const user = userEvent.setup();
        const fullName = 'A'.repeat(69) + '𠮷';
        await fillForm(user);

        await user.clear(field('fullName'));
        await user.paste(fullName);

        expect(field('fullName')).toHaveValue(fullName);
    });

    test('marks the name and the phone when the backend rejects them', async () => {
        // Arrange
        register.mockRejectedValue({
            response: {
                status: 400,
                data: {
                    code: 'VALIDATION_ERROR',
                    errors: [{ path: 'fullName', msg: 'Full name must have...' }, { path: 'phone', msg: 'Phone must be...' }],
                },
            },
        });
        const user = userEvent.setup();
        await fillForm(user);

        // Act
        await user.click(screen.getByRole('button', { name: 'Crear cuenta' }));

        // Assert
        expect(await screen.findByText('Revisa los campos marcados')).toBeInTheDocument();
        expect(errorOf('fullName')).toHaveTextContent(NAME_RULE_MESSAGE);
        expect(errorOf('phone')).toHaveTextContent(PHONE_RULE_MESSAGE);
    });
});

// #312: Mi perfil uses the same rules, only on the field that changed
describe('Mi perfil: full name and phone (#312)', () => {
    const LAURA = { id: 'user-laura', fullName: 'Laura Gómez', email: 'laura@correo.test', phone: '3001234567', role: 'user' };

    async function openProfile(user, profile = LAURA) {
        getProfile.mockResolvedValue({ data: { user: profile } });
        render(<MemoryRouter><AuthProvider><Profile /></AuthProvider></MemoryRouter>);
        await screen.findByDisplayValue(profile.fullName);
        return user;
    }

    async function replace(user, id, value) {
        await user.clear(field(id));
        await user.type(field(id), value);
    }

    beforeEach(() => {
        localStorage.clear();
        localStorage.setItem('token', 'token');
        localStorage.setItem('user', JSON.stringify(LAURA));
        getProfile.mockReset();
        updateProfile.mockReset().mockResolvedValue({ data: { user: LAURA } });
        changePassword.mockReset();
    });

    test('the profile name field accepts 70 Unicode code points when pasted', async () => {
        const user = await openProfile(userEvent.setup());
        const fullName = 'A'.repeat(69) + '𠮷';

        await user.clear(field('fullName'));
        await user.paste(fullName);

        expect(field('fullName')).toHaveValue(fullName);
    });

    test('rejects the name "12345 @@@" without calling the API', async () => {
        // Arrange
        const user = await openProfile(userEvent.setup());

        // Act
        await replace(user, 'fullName', '12345 @@@');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(errorOf('fullName')).toHaveTextContent(NAME_RULE_MESSAGE);
        expect(updateProfile).not.toHaveBeenCalled();
    });

    test('rejects the phone "2001234567" without calling the API', async () => {
        // Arrange
        const user = await openProfile(userEvent.setup());

        // Act
        await replace(user, 'phone', '2001234567');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(errorOf('phone')).toHaveTextContent(PHONE_RULE_MESSAGE);
        expect(updateProfile).not.toHaveBeenCalled();
    });

    test('an unchanged formatted phone does not block a name change', async () => {
        const user = await openProfile(userEvent.setup(), { ...LAURA, phone: '200 123 4567' });

        await replace(user, 'fullName', 'Laura Ríos');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        expect(updateProfile).toHaveBeenCalledWith({ fullName: 'Laura Ríos' });
    });

    test('an old name that breaks the rules does not block a change of the phone', async () => {
        // Arrange: an account created before #312
        const user = await openProfile(userEvent.setup(), { ...LAURA, fullName: 'Laura 123' });

        // Act
        await replace(user, 'phone', '310 987 6543');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(updateProfile).toHaveBeenCalledWith({ phone: '3109876543' });
    });

    test.each([
        ['fullName', 'Laura Gómez Ríos', NAME_RULE_MESSAGE],
        ['phone', '3109876543', PHONE_RULE_MESSAGE],
    ])('marks the field %s when the backend rejects it', async (id, value, message) => {
        // Arrange
        updateProfile.mockRejectedValue({
            response: { status: 400, data: { code: 'VALIDATION_ERROR', errors: [{ path: id, msg: 'Rejected' }] } },
        });
        const user = await openProfile(userEvent.setup());

        // Act
        await replace(user, id, value);
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Revisa los campos marcados')).toBeInTheDocument();
        expect(errorOf(id)).toHaveTextContent(message);
    });

    test('does not say "Revisa los campos marcados" when the backend marks no known field', async () => {
        // Arrange
        updateProfile.mockRejectedValue({
            response: { status: 400, data: { code: 'VALIDATION_ERROR', errors: [{ path: 'other', msg: 'Other' }] } },
        });
        const user = await openProfile(userEvent.setup());

        // Act
        await replace(user, 'phone', '3109876543');
        await user.click(screen.getByRole('button', { name: 'Guardar cambios' }));

        // Assert
        expect(await screen.findByText('Ocurrió un error inesperado. Intenta de nuevo')).toBeInTheDocument();
        expect(screen.queryByText('Revisa los campos marcados')).toBeNull();
    });
});
