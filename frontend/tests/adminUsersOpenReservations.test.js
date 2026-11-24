import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import AdminUsers from '../src/pages/AdminUsers';
import { AuthProvider } from '../src/context/AuthContext';
import { getUsers, getUserLogs, changeUserRole, changeUserStatus } from '../src/services/adminService';

// The screen does not call the real API
jest.mock('../src/services/adminService', () => ({
    getUsers: jest.fn(),
    getUserLogs: jest.fn(),
    changeUserRole: jest.fn(),
    changeUserStatus: jest.fn(),
}));

// #348: an account with a Pending or Active reservation or a balance to pay
// cannot change its role or be deactivated. The API answers 409
// USER_HAS_OPEN_RESERVATIONS, and "Usuarios" says it in the dialog.
const MESSAGE = 'Este usuario tiene reservas pendientes o activas, o un saldo por pagar. Espera a que se resuelvan para cambiar su rol o desactivarlo';
const LAURA = { id: 'user-9', fullName: 'Laura Gómez', email: 'laura@correo.test', role: 'user', isActive: true, documentNumber: '1000000001' };
const refused = { response: { status: 409, data: { code: 'USER_HAS_OPEN_RESERVATIONS' } } };

// jsdom has no ResizeObserver, and "Gestión de usuarios" uses it
class FakeResizeObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
}

beforeAll(() => {
    globalThis.ResizeObserver = FakeResizeObserver;
});

afterAll(() => {
    delete globalThis.ResizeObserver;
});

beforeEach(() => {
    jest.clearAllMocks();
    localStorage.clear();
    localStorage.setItem('token', 'test-token');
    localStorage.setItem('user', JSON.stringify({ id: 'admin-1', fullName: 'Administrador PARKEA', role: 'admin' }));
    getUsers.mockResolvedValue({ data: { users: [LAURA], pagination: { total: 1, totalPages: 1 }, summary: { total: 1, active: 1, inactive: 0, admins: 0 } } });
    getUserLogs.mockResolvedValue({ data: { logs: [] } });
});

const renderScreen = () => render(<MemoryRouter><AuthProvider><AdminUsers /></AuthProvider></MemoryRouter>);

// The screen draws a table and cards: the first control is the one of the table
describe('An account with open reservations in "Usuarios" (#348)', () => {
    test.each([
        ['changing the role', () => screen.findAllByRole('button', { name: 'Cambiar rol de Laura Gómez' }), changeUserRole],
        ['deactivating it', () => screen.findAllByRole('switch', { name: 'Cuenta activa de Laura Gómez' }), changeUserStatus],
    ])('%s shows the message in the dialog and changes nothing', async (_action, findControls, service) => {
        // Arrange
        const user = userEvent.setup();
        service.mockRejectedValue(refused);
        renderScreen();

        // Act
        await user.click((await findControls())[0]);
        const dialog = await screen.findByRole('alertdialog');
        await user.click(within(dialog).getByRole('button', { name: 'Confirmar cambio' }));

        // Assert: the dialog stays open with the reason, and the list is not reloaded
        expect(await within(dialog).findByRole('alert')).toHaveTextContent(MESSAGE);
        expect(screen.getByRole('alertdialog')).toBeInTheDocument();
        expect(service).toHaveBeenCalledTimes(1);
        expect(getUsers).toHaveBeenCalledTimes(1);
        expect(screen.queryByText(/correctamente|Se actualizó el rol/)).not.toBeInTheDocument();
    });
});
