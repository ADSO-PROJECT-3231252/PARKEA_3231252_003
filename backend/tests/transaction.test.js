const util = require('util');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { DatabaseError } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Usuario, Vehiculo, Zona, ZoneSchedule, Reserva, ParkingSpot, Pago, sequelize } = require('../src/models');
const app = require('../src/app');
const { safeRollback } = require('../src/utils/transaction');
const { expirarReservasVencidas } = require('../src/jobs/expirar-reservas.job');
const { finalizarReservasVencidas } = require('../src/jobs/finalizar-reservas.job');

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

// An error of MySQL as Sequelize gives it: its stack is the one of the query
// and starts with a bare "Error", without the message
// (sequelize/lib/dialects/mysql/query.js)
function mysqlError(message) {
    return new DatabaseError(new Error(message), { stack: 'Error\n    at Query.run (query.js:1:1)' });
}

// The first read of the method inside a transaction fails: with a deadlock,
// MySQL already undid the transaction; with another error it is still open.
// The reads outside a transaction (the session check) answer `otherwise`.
function failOn(Model, method, otherwise = () => null, { deadlock = true } = {}) {
    return jest.spyOn(Model, method).mockImplementation(async (...args) => {
        const options = args.find((arg) => arg && typeof arg === 'object' && 'transaction' in arg);
        if (options?.transaction) {
            if (!deadlock) throw mysqlError(CONNECTION_LOST);
            options.transaction.finished = 'rollback';
            throw mysqlError(DEADLOCK);
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
        // What console.error writes: the text, or the error as Node prints it
        logged.push(args.map((arg) => (typeof arg === 'string' ? arg : util.inspect(arg))).join(' '));
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
const ZONE = { name: 'Centro', address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, totalSlots: 10, hourlyRate: 2000, open24h: true };

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
    ['creating a zone', (fail) => fail(Zona, 'findOne'),
        () => request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send(ZONE)],
    ['editing a zone', (fail) => fail(Zona, 'findByPk'),
        () => request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send(ZONE)],
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

describe('The log of an unexpected error (#371)', () => {
    test('an error that is not of the database is written once, with its stack', async () => {
        // Arrange
        jest.spyOn(Zona, 'findOne').mockRejectedValue(new Error('Something else failed'));

        // Act
        const res = await request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send(ZONE);

        // Assert
        expect(res.status).toBe(500);
        expect(logged.join('\n').match(/Error: Something else failed/g)).toHaveLength(1);
        expect(logged.join('\n')).toMatch(/Error: Something else failed\n {4}at /);
    });

    test('an error without a message keeps the stack as Node writes it, without an extra first line', async () => {
        // Arrange: Node starts the stack of an error without a message with a
        // bare "Error" (Jest adds ": ", so the stack is written by hand)
        const error = new Error();
        error.stack = 'Error\n    at fakeQuery (query.js:1:1)';
        jest.spyOn(Zona, 'findOne').mockRejectedValue(error);

        // Act
        const res = await request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send(ZONE);

        // Assert
        expect(res.status).toBe(500);
        expect(logged).toEqual(['Error\n    at fakeQuery (query.js:1:1)']);
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

describe.each([
    ['expiration', expirarReservasVencidas, 'Expired'],
    ['finish', finalizarReservasVencidas, 'Finished'],
])('The %s job, when one reservation fails (#371)', (_name, runJob, status) => {
    test('logs the real error and still processes the next reservations', async () => {
        // Arrange: two reservations, each one in its own transaction
        const first = fakeTransaction();
        const second = fakeTransaction();
        jest.spyOn(sequelize, 'transaction').mockResolvedValueOnce(first).mockResolvedValueOnce(second);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ id: 'r1' }, { id: 'r2' }]);
        const next = { id: 'r2', zoneId: ZONE_ID, parkingSpotId: null, openEnded: false, update: jest.fn() };
        jest.spyOn(Reserva, 'findOne').mockImplementation(async ({ where, transaction: t }) => {
            if (where.id === 'r1') {
                t.finished = 'rollback';
                throw new Error(DEADLOCK);
            }
            return next;
        });
        jest.spyOn(Zona, 'findByPk').mockResolvedValue({ id: ZONE_ID, name: 'Centro', increment: jest.fn() });
        jest.spyOn(ParkingSpot, 'findByPk').mockResolvedValue(null);
        jest.spyOn(Pago, 'findAll').mockResolvedValue([]);

        // Act
        await runJob();

        // Assert
        expect(first.rollback).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(DEADLOCK);
        expect(logged.join('\n')).not.toContain(ROLLBACK_OF_ENDED);
        expect(next.update).toHaveBeenCalledWith({ status }, { transaction: second });
        expect(second.commit).toHaveBeenCalled();
    });

    test('another database error rolls back the transaction of that reservation, and the log keeps it', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ id: 'r1' }]);
        jest.spyOn(Reserva, 'findOne').mockRejectedValue(new Error(CONNECTION_LOST));

        // Act
        await runJob();

        // Assert
        expect(transaction.rollback).toHaveBeenCalledTimes(1);
        expect(transaction.commit).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(CONNECTION_LOST);
    });
});

// A zone as the model gives it, without a database behind it: reading it
// again (after the commit) fails
function zoneThatCannotBeReadAgain(values = {}) {
    const zona = Zona.build(
        { id: ZONE_ID, ...ZONE, availableSlots: 10, isActive: true, schedules: [], ...values },
        { include: [{ model: ZoneSchedule, as: 'schedules' }] },
    );
    jest.spyOn(zona, 'reload').mockRejectedValue(new Error('Connection lost'));
    jest.spyOn(zona, 'update').mockResolvedValue(zona);
    jest.spyOn(zona, 'decrement').mockResolvedValue(zona);
    return zona;
}

describe('An error after the commit (#371)', () => {
    test('creating a reservation: it answers 201 with the saved reservation, and nothing is undone', async () => {
        // Arrange: everything is saved, but reading the reservation again fails
        jest.spyOn(Vehiculo, 'findOne').mockResolvedValue({ id: VEHICLE_ID });
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zoneThatCannotBeReadAgain());
        jest.spyOn(Pago, 'findOne').mockResolvedValue(null);
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(null);
        // No reservations waiting for payment, for the limit of #299
        jest.spyOn(Reserva, 'count').mockResolvedValue(0);
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue({ id: 'spot-7', spotNumber: 7, update: jest.fn() });
        jest.spyOn(Reserva, 'create').mockResolvedValue({ id: RESERVATION_ID, status: 'Pending' });
        jest.spyOn(Reserva, 'findByPk').mockRejectedValue(new Error('Connection lost'));

        // Act
        const res = await request(app).post('/api/reservations').set('Authorization', `Bearer ${userToken}`)
            .send({ zoneId: ZONE_ID, vehicleId: VEHICLE_ID, startTime: inTwoHours(), endTime: inThreeHours() });

        // Assert
        expect(res.status).toBe(201);
        expect(res.body.reservation).toEqual({ id: RESERVATION_ID, status: 'Pending' });
        expect(transaction.commit).toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(`The reservation ${RESERVATION_ID} was saved, but reading it again failed`);
    });

    test('creating a zone: it answers 201 with the saved zone, and nothing is undone', async () => {
        // Arrange
        jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
        jest.spyOn(Zona, 'create').mockImplementation(async (values) => zoneThatCannotBeReadAgain(values));
        jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);
        jest.spyOn(ParkingSpot, 'bulkCreate').mockResolvedValue([]);

        // Act
        const res = await request(app).post('/api/zones').set('Authorization', `Bearer ${adminToken}`).send(ZONE);

        // Assert
        expect(res.status).toBe(201);
        expect(res.body.zone).toMatchObject({ id: ZONE_ID, name: 'Centro' });
        expect(transaction.commit).toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(`The zone ${ZONE_ID} was saved, but reading it again failed`);
    });

    test('editing a zone: it answers 200 with the saved zone, and nothing is undone', async () => {
        // Arrange: the capacity stays the same, so no spot changes
        jest.spyOn(Zona, 'findByPk').mockResolvedValue(zoneThatCannotBeReadAgain());
        jest.spyOn(Zona, 'findOne').mockResolvedValue(null);
        jest.spyOn(ParkingSpot, 'count').mockResolvedValue(10);
        jest.spyOn(ZoneSchedule, 'destroy').mockResolvedValue(0);
        jest.spyOn(ZoneSchedule, 'bulkCreate').mockResolvedValue([]);

        // Act
        const res = await request(app).put(`/api/zones/${ZONE_ID}`).set('Authorization', `Bearer ${adminToken}`).send({ ...ZONE, name: 'Centro Norte' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.zone).toMatchObject({ id: ZONE_ID });
        expect(transaction.commit).toHaveBeenCalled();
        expect(transaction.rollback).not.toHaveBeenCalled();
        expect(logged.join('\n')).toContain(`The zone ${ZONE_ID} was saved, but reading it again failed`);
    });
});
