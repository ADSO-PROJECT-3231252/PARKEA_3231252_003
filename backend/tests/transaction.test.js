const jwt = require('jsonwebtoken');
const request = require('supertest');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Reserva, sequelize } = require('../src/models');
const app = require('../src/app');
const { safeRollback } = require('../src/utils/transaction');

// #371: what happens when a transaction opened by hand fails. When MySQL finds
// a deadlock it undoes the transaction itself, and Sequelize marks it as
// rolled back before the error reaches the catch.
const DEADLOCK = 'Deadlock found when trying to get lock; try restarting transaction';
const ROLLBACK_OF_ENDED = 'Transaction cannot be rolled back because it has been finished';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '66666666-6666-4666-8666-666666666666';
const TARGET_ID = '77777777-7777-4777-8777-777777777777';
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VEHICLE_ID = '33333333-3333-4333-8333-333333333333';
const RESERVATION_ID = '44444444-4444-4444-8444-444444444444';
const userToken = jwt.sign({ id: USER_ID, email: 'laura@correo.test', rol: 'user' }, process.env.JWT_SECRET);
const adminToken = jwt.sign({ id: ADMIN_ID, email: 'admin@parkea.com', rol: 'admin' }, process.env.JWT_SECRET);

// Like a Sequelize transaction: rolling back one that already ended throws
function fakeTransaction(finished) {
    return {
        LOCK: { UPDATE: 'UPDATE' },
        finished,
        commit: jest.fn(async function commit() {
            this.finished = 'commit';
        }),
        rollback: jest.fn(async function rollback() {
            if (this.finished) throw new Error(`${ROLLBACK_OF_ENDED} with state: ${this.finished}`);
            this.finished = 'rollback';
        }),
    };
}

let transaction;
let logged;

// Another error of the database, which leaves the transaction open
const CONNECTION_LOST = 'Connection lost: The server closed the connection';

// The first read of the method inside a transaction fails: with a deadlock,
// MySQL already undid the transaction; with another error it is still open.
// The reads outside a transaction (the session check) answer `otherwise`.
function failOn(Model, method, otherwise = () => null, { deadlock = true } = {}) {
    return jest.spyOn(Model, method).mockImplementation(async (...args) => {
        const options = args.find((arg) => arg && typeof arg === 'object' && 'transaction' in arg);
        if (options?.transaction) {
            if (!deadlock) throw new Error(CONNECTION_LOST);
            options.transaction.finished = 'rollback';
            throw new Error(DEADLOCK);
        }
        return otherwise(...args);
    });
}
const deadlockOn = (Model, method, otherwise) => failOn(Model, method, otherwise);

// The session of the auth middleware: the user, or the administrator
const session = (id) => ({ id, isActive: true, passwordVersion: 0, role: { name: id === ADMIN_ID ? 'admin' : 'user' } });

beforeEach(() => {
    transaction = fakeTransaction();
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    jest.spyOn(Usuario, 'findByPk').mockImplementation(async (id) => session(id));
    logged = [];
    jest.spyOn(console, 'error').mockImplementation((...args) => {
        logged.push(args.map((arg) => (arg instanceof Error ? arg.stack : String(arg))).join(' '));
    });
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe('safeRollback', () => {
    test('rolls back a transaction that has not ended', async () => {
        // Act
        await safeRollback(transaction);

        // Assert
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
    });

    test.each([
        ['that MySQL already undid (deadlock)', 'rollback'],
        ['that was already committed', 'commit'],
    ])('leaves a transaction %s as it is, without an error', async (_label, finished) => {
        // Arrange
        const ended = fakeTransaction(finished);

        // Act and assert
        await expect(safeRollback(ended)).resolves.toBeUndefined();
        expect(ended.rollback).not.toHaveBeenCalled();
    });

    test('never throws: if the rollback itself fails, it goes to the log', async () => {
        // Arrange
        transaction.rollback.mockRejectedValue(new Error('Connection lost'));

        // Act and assert
        await expect(safeRollback(transaction)).resolves.toBeUndefined();
        expect(logged.join('\n')).toContain('Connection lost');
    });

    test('without a transaction it does nothing', async () => {
        await expect(safeRollback(undefined)).resolves.toBeUndefined();
    });
});

const inTwoHours = () => new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
const inThreeHours = () => new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString();

// Every route with a transaction opened by hand, and the read where it fails.
// `arrange` receives `fail` (deadlockOn, or the same with the transaction open)
const ROUTES = [
    ['creating a reservation', (fail) => fail(Usuario, 'findByPk', session),
        () => request(app).post('/api/reservations').set('Authorization', `Bearer ${userToken}`)
            .send({ zoneId: ZONE_ID, vehicleId: VEHICLE_ID, startTime: inTwoHours(), endTime: inThreeHours() })],
    ['cancelling a reservation', (fail) => fail(Reserva, 'findOne'),
        () => request(app).patch(`/api/reservations/${RESERVATION_ID}/cancel`).set('Authorization', `Bearer ${userToken}`)],
    ['finishing an open stay', (fail) => fail(Reserva, 'findOne'),
        () => request(app).patch(`/api/reservations/${RESERVATION_ID}/finish`).set('Authorization', `Bearer ${userToken}`).send({})],
    ['extending a stay', (fail) => fail(Reserva, 'findOne'),
        () => request(app).patch(`/api/reservations/${RESERVATION_ID}/extend`).set('Authorization', `Bearer ${userToken}`)
            .send({ fromEndTime: inTwoHours(), newEndTime: inThreeHours(), paymentMethod: 'pse' })],
    ['paying a reservation', (fail) => fail(Reserva, 'findByPk'),
        () => request(app).post(`/api/payments/${RESERVATION_ID}`).set('Authorization', `Bearer ${userToken}`).send({ paymentMethod: 'pse' })],
    ['paying a balance', (fail) => fail(Reserva, 'findByPk'),
        () => request(app).post(`/api/payments/${RESERVATION_ID}/balance`).set('Authorization', `Bearer ${userToken}`).send({ paymentMethod: 'pse' })],
    ['changing the role of an account', (fail) => fail(Usuario, 'findByPk', session),
        () => request(app).patch(`/api/admin/users/${TARGET_ID}/role`).set('Authorization', `Bearer ${adminToken}`).send({ role: 'admin' })],
    ['changing the status of an account', (fail) => fail(Usuario, 'findByPk', session),
        () => request(app).patch(`/api/admin/users/${TARGET_ID}/status`).set('Authorization', `Bearer ${adminToken}`).send({ isActive: false })],
];

describe('A deadlock inside a transaction (#371)', () => {
    test.each(ROUTES)('%s answers 500 and the log keeps the real error', async (_label, arrange, send) => {
        // Arrange
        arrange(deadlockOn);

        // Act
        const res = await send();

        // Assert: the transaction MySQL already undid is not rolled back again
        expect(res.status).toBe(500);
        expect(res.body.code).toBe('INTERNAL_ERROR');
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(DEADLOCK);
        expect(logged.join('\n')).not.toContain(ROLLBACK_OF_ENDED);
    });
});

describe('Another database error inside a transaction', () => {
    test.each(ROUTES)('%s rolls the transaction back once and answers 500 with the real error in the log', async (_label, arrange, send) => {
        // Arrange
        arrange((Model, method, otherwise) => failOn(Model, method, otherwise, { deadlock: false }));

        // Act
        const res = await send();

        // Assert
        expect(res.status).toBe(500);
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(CONNECTION_LOST);
    });
});
