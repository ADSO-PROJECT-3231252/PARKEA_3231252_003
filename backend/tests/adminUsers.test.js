const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Rol, AdminActionLog, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-23: an administrator changes the role or the status of an account.
// Every change is written in the log of admin actions.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '88888888-8888-4888-8888-888888888888';
const USER_ROLE_ID = '99999999-9999-4999-8999-999999999991';
const ADMIN_ROLE_ID = '99999999-9999-4999-8999-999999999992';

const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);

let transaction;
let target;
let sessionRole;
let countAdmins;
let writeLog;

// The account the admin changes, with its own update spy
function account(values = {}) {
    return { id: TARGET_ID, isActive: true, isPrimaryAdmin: false, role: { name: 'user' }, update: jest.fn(), ...values };
}

const changeRole = (role, id = TARGET_ID, token = adminToken) => request(app)
    .patch(`/api/admin/users/${id}/role`)
    .set('Authorization', `Bearer ${token}`)
    .send({ role });

const changeStatus = (isActive, id = TARGET_ID) => request(app)
    .patch(`/api/admin/users/${id}/status`)
    .set('Authorization', `Bearer ${adminToken}`)
    .send({ isActive });

beforeEach(() => {
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    target = account();
    sessionRole = 'admin';
    // The session of whoever sends the request (auth middleware) and the account it changes
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async (id) => {
        if (id === TARGET_ID) return target;
        if (id === ADMIN_ID) return { id: ADMIN_ID, isActive: true, passwordVersion: 0, role: { name: sessionRole } };
        return null;
    });
    countAdmins = jest.spyOn(Usuario, 'count').mockResolvedValue(2);
    jest.spyOn(Rol, 'findOne').mockImplementation(async ({ where }) => ({ id: where.name === 'admin' ? ADMIN_ROLE_ID : USER_ROLE_ID, name: where.name }));
    writeLog = jest.spyOn(AdminActionLog, 'create').mockResolvedValue({});
});

afterEach(() => {
    jest.restoreAllMocks();
});

// Nothing changed and nothing was written in the log
function expectNothingChanged() {
    expect(target.update).not.toHaveBeenCalled();
    expect(writeLog).not.toHaveBeenCalled();
    expect(transaction.commit).not.toHaveBeenCalled();
}

describe('Only an administrator can change accounts (HU-23)', () => {
    test('a user session answers 403 FORBIDDEN_ROLE', async () => {
        // Arrange: the token says admin, but the role stored now is user
        sessionRole = 'user';

        // Act
        const res = await changeRole('admin');

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('FORBIDDEN_ROLE');
        expectNothingChanged();
    });

    test('without a session it answers 401 NO_TOKEN', async () => {
        // Act
        const res = await request(app).patch(`/api/admin/users/${TARGET_ID}/status`).send({ isActive: false });

        // Assert
        expect(res.status).toBe(401);
        expect(res.body.code).toBe('NO_TOKEN');
        expectNothingChanged();
    });
});

describe('Changing the role of an account (HU-23)', () => {
    test.each([
        ['without a role', undefined],
        ['with a role that does not exist', 'superadmin'],
    ])('a request %s answers 400 VALIDATION_ERROR', async (name, role) => {
        // Act
        const res = await changeRole(role);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expectNothingChanged();
    });

    test('an admin cannot change their own role: 403 CANNOT_MODIFY_SELF', async () => {
        // Act
        const res = await changeRole('user', ADMIN_ID);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CANNOT_MODIFY_SELF');
        expect(transaction.rollback).toHaveBeenCalled();
        expect(writeLog).not.toHaveBeenCalled();
    });

    test('an account that does not exist answers 404 USER_NOT_FOUND', async () => {
        // Act
        const res = await changeRole('admin', '00000000-0000-4000-8000-000000000000');

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('USER_NOT_FOUND');
        expect(writeLog).not.toHaveBeenCalled();
    });

    test('the primary administrator answers 403 PRIMARY_ADMIN_PROTECTED', async () => {
        // Arrange
        target = account({ isPrimaryAdmin: true, role: { name: 'admin' } });

        // Act
        const res = await changeRole('user');

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('PRIMARY_ADMIN_PROTECTED');
        expectNothingChanged();
    });

    test('a user becomes an admin and the change is written in the log', async () => {
        // Act
        const res = await changeRole('admin');

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ roleId: ADMIN_ROLE_ID }, { transaction });
        expect(writeLog).toHaveBeenCalledWith({
            adminId: ADMIN_ID,
            targetUserId: TARGET_ID,
            action: 'role_changed',
            details: 'Role changed from "user" to "admin"',
        }, { transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('making someone an admin does not need to count the admins', async () => {
        // Act
        await changeRole('admin');

        // Assert
        expect(countAdmins).not.toHaveBeenCalled();
    });

    test('an admin becomes a user while another active admin remains', async () => {
        // Arrange
        target = account({ role: { name: 'admin' } });

        // Act
        const res = await changeRole('user');

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ roleId: USER_ROLE_ID }, { transaction });
        expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({ details: 'Role changed from "admin" to "user"' }), { transaction });
    });

    test('the last active admin cannot become a user: 400 MIN_ONE_ADMIN_REQUIRED', async () => {
        // Arrange
        target = account({ role: { name: 'admin' } });
        countAdmins.mockResolvedValue(1);

        // Act
        const res = await changeRole('user');

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MIN_ONE_ADMIN_REQUIRED');
        expectNothingChanged();
    });

    test('only the active admins are counted', async () => {
        // Arrange
        target = account({ role: { name: 'admin' } });

        // Act
        await changeRole('user');

        // Assert
        const [{ where, include }] = countAdmins.mock.calls[0];
        expect(where).toEqual({ isActive: true });
        expect(include[0].where).toEqual({ name: 'admin' });
    });
});

describe('Activating and deactivating an account (HU-23)', () => {
    test.each([
        ['without isActive', undefined],
        ['with isActive as text', 'false'],
        ['with isActive as a number', 0],
    ])('a request %s answers 400 VALIDATION_ERROR', async (name, isActive) => {
        // Act
        const res = await changeStatus(isActive);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('VALIDATION_ERROR');
        expectNothingChanged();
    });

    test('an admin cannot deactivate their own account: 403 CANNOT_MODIFY_SELF', async () => {
        // Act
        const res = await changeStatus(false, ADMIN_ID);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('CANNOT_MODIFY_SELF');
        expect(writeLog).not.toHaveBeenCalled();
    });

    test('an account that does not exist answers 404 USER_NOT_FOUND', async () => {
        // Act
        const res = await changeStatus(false, '00000000-0000-4000-8000-000000000000');

        // Assert
        expect(res.status).toBe(404);
        expect(res.body.code).toBe('USER_NOT_FOUND');
    });

    test('the primary administrator answers 403 PRIMARY_ADMIN_PROTECTED', async () => {
        // Arrange
        target = account({ isPrimaryAdmin: true, role: { name: 'admin' } });

        // Act
        const res = await changeStatus(false);

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe('PRIMARY_ADMIN_PROTECTED');
        expectNothingChanged();
    });

    test('a user is deactivated and the change is written in the log', async () => {
        // Act
        const res = await changeStatus(false);

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ isActive: false }, { transaction });
        expect(writeLog).toHaveBeenCalledWith({
            adminId: ADMIN_ID,
            targetUserId: TARGET_ID,
            action: 'status_changed',
            details: 'Status changed to inactive',
        }, { transaction });
        expect(countAdmins).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('an inactive account is activated again', async () => {
        // Arrange
        target = account({ isActive: false });

        // Act
        const res = await changeStatus(true);

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ isActive: true }, { transaction });
        expect(writeLog).toHaveBeenCalledWith(expect.objectContaining({ details: 'Status changed to active' }), { transaction });
    });

    test('the last active admin cannot be deactivated: 400 MIN_ONE_ADMIN_REQUIRED', async () => {
        // Arrange
        target = account({ role: { name: 'admin' } });
        countAdmins.mockResolvedValue(1);

        // Act
        const res = await changeStatus(false);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('MIN_ONE_ADMIN_REQUIRED');
        expectNothingChanged();
    });

    test('an admin is deactivated while another active admin remains', async () => {
        // Arrange
        target = account({ role: { name: 'admin' } });

        // Act
        const res = await changeStatus(false);

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ isActive: false }, { transaction });
    });
});
