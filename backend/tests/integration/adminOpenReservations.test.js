// #348: the role or the status of an account cannot change while it has a
// reservation that holds a spot or a balance to pay, and two requests at the
// same moment never leave a reservation nobody can manage, against a real
// MySQL database
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const { Usuario, Rol, Reserva, Pago, ParkingSpot, sequelize } = require('../../src/models');
const { app, inMinutes, createUser, adminToken, createZone, reserve } = require('./helpers');

const changeRole = async (id, role, token) => request(app)
    .patch(`/api/admin/users/${id}/role`)
    .set('Authorization', `Bearer ${token ?? await adminToken()}`)
    .send({ role });

const changeStatus = async (id, isActive, token) => request(app)
    .patch(`/api/admin/users/${id}/status`)
    .set('Authorization', `Bearer ${token ?? await adminToken()}`)
    .send({ isActive });

// A new active administrator, with the token of a sign-in
async function createAdmin() {
    const rol = await Rol.findOne({ where: { name: 'admin' } });
    const id = crypto.randomBytes(4).toString('hex');
    const usuario = await Usuario.create({
        fullName: `Admin ${id}`,
        email: `admin.${id}@correo.test`,
        password: 'not-used',
        documentType: 'CC',
        documentNumber: String(parseInt(id, 16)).padStart(10, '2').slice(0, 10),
        roleId: rol.id,
        emailVerifiedAt: new Date(),
    });
    const token = jwt.sign({ id: usuario.id, email: usuario.email, rol: 'admin', pv: usuario.passwordVersion }, process.env.JWT_SECRET);
    return { usuario, token };
}

const roleOf = async (id) => (await Usuario.findByPk(id, { include: [{ model: Rol, as: 'role' }] })).role.name;
const isActive = async (id) => (await Usuario.findByPk(id)).isActive;
const statuses = (responses) => responses.map((res) => `${res.status}${res.body.code ? ` ${res.body.code}` : ''}`).sort();

// Locks the row of the account in a transaction and runs `whileLocked` once
// `sendRequest` waits for that lock. Then the transaction commits, and the
// answer of the request is returned.
async function whileAccountIsLocked(userId, sendRequest, whileLocked) {
    let notifyLock;
    const reachedLock = new Promise((resolve) => { notifyLock = resolve; });
    const hookName = 'observeAccountLock';
    let pending;

    await sequelize.transaction(async (blocker) => {
        await Usuario.findByPk(userId, { transaction: blocker, lock: blocker.LOCK.UPDATE });

        // Observe the real locking read; Sequelize still sends it to MySQL
        Usuario.addHook('beforeFind', hookName, (options) => {
            if (options.lock && options.where?.id === userId) notifyLock();
        });
        try {
            pending = sendRequest();
            await Promise.race([
                reachedLock,
                pending.then((res) => {
                    throw new Error(`Request finished before the lock of the account: HTTP ${res.status}`);
                }),
            ]);
            // Time for the read to reach MySQL and wait there
            await new Promise((resolve) => setTimeout(resolve, 300));
            await whileLocked(blocker);
        } finally {
            Usuario.removeHook('beforeFind', hookName);
        }
    });

    return pending;
}

describe('Accounts with open reservations (#348)', () => {
    let zona;

    beforeAll(async () => {
        zona = await createZone(5);
    });

    test('a Pending reservation blocks both changes, and one whose 15 minutes ended does not', async () => {
        // Arrange
        const cuenta = await createUser();
        const reserved = await reserve(cuenta, zona, inMinutes(60), inMinutes(120));
        expect(reserved.status).toBe(201);

        // Act + Assert: the 15 minutes to pay are running
        for (const res of [await changeRole(cuenta.usuario.id, 'admin'), await changeStatus(cuenta.usuario.id, false)]) {
            expect(res.status).toBe(409);
            expect(res.body.code).toBe('USER_HAS_OPEN_RESERVATIONS');
        }
        expect(await roleOf(cuenta.usuario.id)).toBe('user');
        expect(await isActive(cuenta.usuario.id)).toBe(true);

        // Act + Assert: the 15 minutes ended, and the job has not marked it Expired yet (#347)
        await Reserva.update({ holdExpiresAt: inMinutes(-1) }, { where: { id: reserved.body.reservation.id } });
        const res = await changeStatus(cuenta.usuario.id, false);
        expect(res.status).toBe(200);
        expect(await isActive(cuenta.usuario.id)).toBe(false);
    });

    test('an Active (paid) reservation blocks both changes', async () => {
        // Arrange
        const cuenta = await createUser();
        const reserved = await reserve(cuenta, zona, inMinutes(180), inMinutes(240));
        await Reserva.update({ status: 'Active', holdExpiresAt: null }, { where: { id: reserved.body.reservation.id } });

        // Act
        const responses = [await changeRole(cuenta.usuario.id, 'admin'), await changeStatus(cuenta.usuario.id, false)];

        // Assert
        expect(statuses(responses)).toEqual(['409 USER_HAS_OPEN_RESERVATIONS', '409 USER_HAS_OPEN_RESERVATIONS']);
        expect(await roleOf(cuenta.usuario.id)).toBe('user');
        expect(await isActive(cuenta.usuario.id)).toBe(true);
    });

    test('a balance to pay blocks both changes, and once it is paid they work', async () => {
        // Arrange: an open stay that ended without paying its balance (HU-27)
        const cuenta = await createUser();
        const reserved = await reserve(cuenta, zona, inMinutes(300), inMinutes(360));
        const reservationId = reserved.body.reservation.id;
        await Reserva.update({ status: 'Finished', holdExpiresAt: null }, { where: { id: reservationId } });
        const balance = await Pago.create({ reservationId, type: 'balance', amount: 2000, paymentStatus: 'Pending' });

        // Act + Assert
        const responses = [await changeRole(cuenta.usuario.id, 'admin'), await changeStatus(cuenta.usuario.id, false)];
        expect(statuses(responses)).toEqual(['409 USER_HAS_OPEN_RESERVATIONS', '409 USER_HAS_OPEN_RESERVATIONS']);

        // Act + Assert: paid, nothing is open any more
        await balance.update({ paymentStatus: 'Paid', paidAt: new Date() });
        const res = await changeRole(cuenta.usuario.id, 'admin');
        expect(res.status).toBe(200);
        expect(await roleOf(cuenta.usuario.id)).toBe('admin');
    });

    test('an account with a reservation can still be activated', async () => {
        // Arrange: deactivated before #348, with its reservation still Active
        const cuenta = await createUser();
        const reserved = await reserve(cuenta, zona, inMinutes(420), inMinutes(480));
        await Reserva.update({ status: 'Active', holdExpiresAt: null }, { where: { id: reserved.body.reservation.id } });
        await Usuario.update({ isActive: false }, { where: { id: cuenta.usuario.id } });

        // Act
        const res = await changeStatus(cuenta.usuario.id, true);

        // Assert
        expect(res.status).toBe(200);
        expect(await isActive(cuenta.usuario.id)).toBe(true);
    });
});

describe('A reservation at the same moment as the change (#348)', () => {
    let zona;

    beforeAll(async () => {
        zona = await createZone(5);
    });

    test('a reservation saved while the change waits for the account blocks the change', async () => {
        // Arrange
        const cuenta = await createUser();
        let reservationId;

        // Act: the reservation holds the account; the change waits for it
        const res = await whileAccountIsLocked(cuenta.usuario.id, () => changeRole(cuenta.usuario.id, 'admin'), async (blocker) => {
            // Saved as crear saves it, in the transaction that holds the account
            const spot = await ParkingSpot.findOne({ where: { zoneId: zona.id }, order: [['spotNumber', 'ASC']], transaction: blocker });
            const saved = await Reserva.create({
                userId: cuenta.usuario.id,
                zoneId: zona.id,
                vehicleId: cuenta.vehiculo.id,
                parkingSpotId: spot.id,
                spotNumber: spot.spotNumber,
                startTime: inMinutes(60),
                endTime: inMinutes(120),
                status: 'Pending',
                holdExpiresAt: inMinutes(15),
                appliedHourlyRate: 2000,
            }, { transaction: blocker });
            reservationId = saved.id;
        });

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('USER_HAS_OPEN_RESERVATIONS');
        expect(await roleOf(cuenta.usuario.id)).toBe('user');
        expect(await Reserva.count({ where: { id: reservationId } })).toBe(1);
    });

    test.each([
        ['made administrator', { roleId: 'admin' }, 'FORBIDDEN_ROLE'],
        ['deactivated', { isActive: false }, 'ACCOUNT_DEACTIVATED'],
    ])('a reservation that waits while the account is %s answers 403 %s and saves nothing', async (_case, change, code) => {
        // Arrange
        const cuenta = await createUser();
        const values = change.roleId ? { roleId: (await Rol.findOne({ where: { name: 'admin' } })).id } : change;

        // Act: the change is saved while the reservation waits at the lock of the account
        const res = await whileAccountIsLocked(cuenta.usuario.id, () => reserve(cuenta, zona, inMinutes(60), inMinutes(120)), async (blocker) => {
            await Usuario.update(values, { where: { id: cuenta.usuario.id }, transaction: blocker });
        });

        // Assert
        expect(res.status).toBe(403);
        expect(res.body.code).toBe(code);
        expect(await Reserva.count({ where: { userId: cuenta.usuario.id } })).toBe(0);
    });

    test('a reservation and a change sent together never both succeed', async () => {
        for (let round = 0; round < 6; round++) {
            // Arrange
            const cuenta = await createUser();
            const change = round % 2 === 0 ? () => changeRole(cuenta.usuario.id, 'admin') : () => changeStatus(cuenta.usuario.id, false);

            // Act
            const [reserved, changed] = await Promise.all([
                reserve(cuenta, zona, inMinutes(600 + round * 90), inMinutes(660 + round * 90)),
                change(),
            ]);

            // Assert: either the reservation went first and the change was refused, or the other way round
            const saved = await Reserva.count({ where: { userId: cuenta.usuario.id } });
            if (reserved.status === 201) {
                expect(changed.status).toBe(409);
                expect(saved).toBe(1);
            } else {
                expect(changed.status).toBe(200);
                expect(reserved.status).toBe(403);
                expect(saved).toBe(0);
            }
        }
    });
});

describe('Two administrators who change each other at the same moment (#348)', () => {
    test.each([
        ['deactivate', (id, token) => changeStatus(id, false, token), '403 ACCOUNT_DEACTIVATED'],
        ['make a user', (id, token) => changeRole(id, 'user', token), '403 FORBIDDEN_ROLE'],
    ])('when both %s the other one, one gets 200 and the other 403, never 500', async (_action, act, refused) => {
        for (let round = 0; round < 4; round++) {
            // Arrange
            const [a, b] = [await createAdmin(), await createAdmin()];

            // Act
            const responses = await Promise.all([act(b.usuario.id, a.token), act(a.usuario.id, b.token)]);

            // Assert
            expect(statuses(responses)).toEqual(['200', refused]);
        }
    });
});

describe('The lock of an account does not lock its role (#348)', () => {
    test('deactivating an account does not wait for a transaction that holds the row of its role', async () => {
        // Arrange
        const cuenta = await createUser();
        let answer;
        let timer;

        // Act: another transaction holds the row of the role "user" in roles
        await sequelize.transaction(async (other) => {
            await Rol.findOne({ where: { name: 'user' }, transaction: other, lock: other.LOCK.UPDATE });
            answer = await Promise.race([
                changeStatus(cuenta.usuario.id, false),
                new Promise((resolve) => { timer = setTimeout(() => resolve('still waiting after 5 s'), 5000); }),
            ]);
            clearTimeout(timer);
        });

        // Assert
        expect(answer.status).toBe(200);
        expect(await isActive(cuenta.usuario.id)).toBe(false);
    });
});
