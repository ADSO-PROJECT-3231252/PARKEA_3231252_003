// #373: paying a reservation (HU-17) against a real MySQL database, when its
// 15 minutes end while the payment is still running
const request = require('supertest');
const { Op } = require('sequelize');
const { Pago, Reserva } = require('../../src/models');
const { app, inMinutes, createUser, createZone, reserve } = require('./helpers');

const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });

afterEach(() => {
    jest.restoreAllMocks();
});

describe('A payment at the last second (HU-17, #373)', () => {
    test('a payment that starts before the 15 minutes end and finishes after them never leaves its spot to another reservation too', async () => {
        // Arrange: a zone of 1 spot and a reservation with 1 or 2 seconds
        // left to pay (a whole second, as MySQL keeps it). Its payment stops
        // after it checks the deadline, like a slow payment, until 2.5
        // seconds after it, so the 15 minutes end while it runs.
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const start = inMinutes(60).toISOString();
        const end = inMinutes(120).toISOString();
        const created = await reserve(ana, zona, start, end);
        const { id } = created.body.reservation;
        const deadline = new Date(Math.ceil((Date.now() + 1000) / 1000) * 1000);
        await Reserva.update({ holdExpiresAt: deadline }, { where: { id } });
        const findOne = Pago.findOne.bind(Pago);
        jest.spyOn(Pago, 'findOne').mockImplementation(async (options) => {
            if (options?.where?.type === 'initial') await sleep(deadline.getTime() + 2500 - Date.now());
            return findOne(options);
        });

        // Act: the payment starts, and the same hours are reserved once its
        // 15 minutes ended, while it is still running. Sequelize sends the
        // time without its milliseconds, so it goes a second and a bit after
        // the deadline.
        const paying = request(app).post(`/api/payments/${id}`).set('Authorization', `Bearer ${ana.token}`).send({ paymentMethod: 'pse' }).then((res) => res);
        await sleep(deadline.getTime() + 1300 - Date.now());
        const other = await reserve(beto, zona, start, end);
        const paid = await paying;

        // Assert: the payment went first, so the other reservation waited
        // for it and found no free spot
        expect(paid.status).toBe(201);
        expect(other.status).toBe(409);
        expect(other.body.code).toBe('NO_SPOTS_AVAILABLE');
        const holders = await Reserva.findAll({
            where: {
                zoneId: zona.id,
                [Op.or]: [{ status: 'Active' }, { status: 'Pending', holdExpiresAt: { [Op.gt]: new Date() } }],
            },
        });
        expect(holders).toHaveLength(1);
    }, 15000);
});
