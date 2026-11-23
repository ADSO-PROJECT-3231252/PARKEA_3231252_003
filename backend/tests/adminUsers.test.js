const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Op } = require('sequelize');
const { Usuario, Rol, Reserva, Pago, AdminActionLog, sequelize } = require('../src/models');
const app = require('../src/app');

// HU-23: an administrator changes the role or the status of an account.
// Every change is written in the log of admin actions.
const ADMIN_ID = '11111111-1111-4111-8111-111111111111';
const TARGET_ID = '88888888-8888-4888-8888-888888888888';
const USER_ROLE_ID = '99999999-9999-4999-8999-999999999991';
const ADMIN_ROLE_ID = '99999999-9999-4999-8999-999999999992';

const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);

const roleId = (name) => (name === 'admin' ? ADMIN_ROLE_ID : USER_ROLE_ID);

let transaction;
let target;
let sessionRole;
let adminNow;
let countAdmins;
let countOpen;
let findBalance;
let writeLog;

// The account the admin changes, with its own update spy
function account(values = {}) {
    const { role = { name: 'user' }, ...rest } = values;
    return { id: TARGET_ID, isActive: true, isPrimaryAdmin: false, roleId: roleId(role.name), update: jest.fn(), ...rest };
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
    // #348: the account of the admin as the locked read gives it (null: as the session)
    adminNow = null;
    // The session of whoever sends the request (auth middleware), and the
    // locked reads of that admin and of the account it changes
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async (id, options = {}) => {
        if (id === TARGET_ID) return target;
        if (id === ADMIN_ID) {
            const session = { id: ADMIN_ID, isActive: true, isPrimaryAdmin: false, passwordVersion: 0, roleId: roleId(sessionRole), role: { name: sessionRole } };
            return options.lock && adminNow ? { ...session, ...adminNow } : session;
        }
        return null;
    });
    countAdmins = jest.spyOn(Usuario, 'count').mockResolvedValue(2);
    const roles = [{ id: USER_ROLE_ID, name: 'user' }, { id: ADMIN_ROLE_ID, name: 'admin' }];
    jest.spyOn(Rol, 'findAll').mockResolvedValue(roles);
    jest.spyOn(Rol, 'findByPk').mockImplementation(async (id) => roles.find((r) => r.id === id) ?? null);
    // #348: no reservation that holds a spot and no balance to pay
    countOpen = jest.spyOn(Reserva, 'count').mockResolvedValue(0);
    findBalance = jest.spyOn(Pago, 'findOne').mockResolvedValue(null);
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

describe('Repeated admin actions (#304)', () => {
    test.each([
        ['role', () => changeRole('user')],
        ['status', () => changeStatus(true)],
    ])('requesting the current %s returns 200 without adding a log entry', async (_field, sendRequest) => {
        const res = await sendRequest();

        expect(res.status).toBe(200);
        expect(Usuario.findByPk).toHaveBeenCalledWith(
            TARGET_ID,
            expect.objectContaining({ transaction, lock: transaction.LOCK.UPDATE }),
        );
        expect(target.update).not.toHaveBeenCalled();
        expect(writeLog).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalledTimes(1);
    });
});

describe('Accounts with open reservations or a balance to pay (#348)', () => {
    // [case, what the account has]
    const OPEN = [
        ['a Pending or Active reservation', () => countOpen.mockResolvedValue(1)],
        ['a balance to pay', () => findBalance.mockResolvedValue({ id: 'balance-1' })],
    ];

    test.each(OPEN)('with %s, changing its role answers 409 USER_HAS_OPEN_RESERVATIONS and changes nothing', async (_case, arrangeOpen) => {
        // Arrange
        arrangeOpen();

        // Act
        const res = await changeRole('admin');

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('USER_HAS_OPEN_RESERVATIONS');
        expectNothingChanged();
        expect(transaction.rollback).toHaveBeenCalled();
    });

    test.each(OPEN)('with %s, an admin cannot become a user either', async (_case, arrangeOpen) => {
        // Arrange
        target = account({ role: { name: 'admin' } });
        arrangeOpen();

        // Act
        const res = await changeRole('user');

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('USER_HAS_OPEN_RESERVATIONS');
        expectNothingChanged();
    });

    test.each(OPEN)('with %s, deactivating it answers 409 USER_HAS_OPEN_RESERVATIONS and changes nothing', async (_case, arrangeOpen) => {
        // Arrange
        arrangeOpen();

        // Act
        const res = await changeStatus(false);

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('USER_HAS_OPEN_RESERVATIONS');
        expectNothingChanged();
    });

    test.each(OPEN)('with %s, activating it is not blocked', async (_case, arrangeOpen) => {
        // Arrange
        target = account({ isActive: false });
        arrangeOpen();

        // Act
        const res = await changeStatus(true);

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).toHaveBeenCalledWith({ isActive: true }, { transaction });
        expect(countOpen).not.toHaveBeenCalled();
    });

    test.each([
        ['role', () => changeRole('user')],
        ['status', () => changeStatus(true)],
    ])('asking for the %s it already has still answers 200 without a line in the log', async (_field, sendRequest) => {
        // Arrange
        countOpen.mockResolvedValue(1);

        // Act
        const res = await sendRequest();

        // Assert
        expect(res.status).toBe(200);
        expect(target.update).not.toHaveBeenCalled();
        expect(writeLog).not.toHaveBeenCalled();
    });

    test('the reservations counted are the ones of the account that hold a spot now, in the transaction', async () => {
        // Act
        await changeStatus(false);

        // Assert: Active, or Pending with its 15 minutes still running (#347)
        const [{ where, transaction: used }] = countOpen.mock.calls[0];
        expect(used).toBe(transaction);
        expect(where.userId).toBe(TARGET_ID);
        const [active, pending] = where[Op.and][0][Op.or];
        expect(active).toEqual({ status: 'Active' });
        expect(pending.status).toBe('Pending');
        expect(pending[Op.or][0]).toEqual({ holdExpiresAt: null });
        expect(pending[Op.or][1].holdExpiresAt[Op.gt]).toBeInstanceOf(Date);
        // The balance is the Pending payment of type balance of a reservation of the account
        const [balanceQuery] = findBalance.mock.calls[0];
        expect(balanceQuery.where).toEqual({ type: 'balance', paymentStatus: 'Pending' });
        expect(balanceQuery.include[0].where).toEqual({ userId: TARGET_ID });
        expect(balanceQuery.transaction).toBe(transaction);
    });
});

describe('Two administrators at the same moment (#348)', () => {
    // Locked reads of the change: the session reads have no lock
    const lockedReads = () => Usuario.findByPk.mock.calls.filter(([, options]) => options?.lock);

    test.each([
        ['role', () => changeRole('admin')],
        ['status', () => changeStatus(false)],
    ])('the %s change locks both accounts, in the order of their id and without the role', async (_field, sendRequest) => {
        // Act
        await sendRequest();

        // Assert: ADMIN_ID (1111...) goes before TARGET_ID (8888...)
        const reads = lockedReads();
        expect(reads.map(([id]) => id)).toEqual([ADMIN_ID, TARGET_ID]);
        for (const [, options] of reads) {
            expect(options).toEqual(expect.objectContaining({ transaction, lock: transaction.LOCK.UPDATE }));
            // Reading the role with the lock (include) would lock its row in roles
            expect(options.include).toBeUndefined();
        }
    });

    test('an account whose id comes first is locked first', async () => {
        // Arrange: an account with a lower id than the admin
        const LOWER_ID = '05555555-5555-4555-8555-555555555555';
        target = account({ id: LOWER_ID });
        Usuario.findByPk.mockImplementation(async (id) => {
            if (id === LOWER_ID) return target;
            if (id === ADMIN_ID) return { id: ADMIN_ID, isActive: true, passwordVersion: 0, roleId: ADMIN_ROLE_ID, role: { name: 'admin' } };
            return null;
        });

        // Act
        const res = await changeStatus(false, LOWER_ID);

        // Assert
        expect(res.status).toBe(200);
        expect(lockedReads().map(([id]) => id)).toEqual([LOWER_ID, ADMIN_ID]);
    });

    test.each([
        ['deactivated', { isActive: false }, 'ACCOUNT_DEACTIVATED'],
        ['made a user', { roleId: USER_ROLE_ID }, 'FORBIDDEN_ROLE'],
    ])('an admin %s by the other one while waiting at the lock answers 403 %s and changes nothing', async (_case, now, code) => {
        // Arrange: the session still saw an active admin
        adminNow = now;

        // Act
        const resRole = await changeRole('admin');
        const resStatus = await changeStatus(false);

        // Assert
        for (const res of [resRole, resStatus]) {
            expect(res.status).toBe(403);
            expect(res.body.code).toBe(code);
        }
        expectNothingChanged();
    });
});

describe('Searching the admin user list (#304)', () => {
    const { Op } = require('sequelize');

    test.each([
        ['%', '%\\%%'],
        ['_', '%\\_%'],
        ['\\', '%\\\\%'],
        ['ana', '%ana%'],
    ])('builds the expected search pattern for "%s"', async (search, expectedPattern) => {
        const findUsers = jest.spyOn(Usuario, 'findAndCountAll')
            .mockResolvedValue({ count: 0, rows: [] });

        const res = await request(app)
            .get('/api/admin/users')
            .set('Authorization', `Bearer ${adminToken}`)
            .query({ search });

        expect(res.status).toBe(200);
        expect(findUsers).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                [Op.or]: [
                    { fullName: { [Op.like]: expectedPattern } },
                    { email: { [Op.like]: expectedPattern } },
                    { documentNumber: { [Op.like]: expectedPattern } },
                ],
            },
        }));
    });
});
