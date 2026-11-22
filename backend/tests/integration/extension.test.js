// #373: extending a stay (HU-28) against a real MySQL database. A stay never
// changes spot, so its spot must be free for the added time.
const request = require('supertest');
const { Reserva } = require('../../src/models');
const { app, inMinutes, createUser, createZone, reserve } = require('./helpers');

// A reservation from `start` to `end` minutes from now, paid with PSE
async function paidStay(cuenta, zona, start, end) {
    const res = await reserve(cuenta, zona, inMinutes(start).toISOString(), inMinutes(end).toISOString());
    if (res.status !== 201) throw new Error(`The stay was not created: ${res.status} ${JSON.stringify(res.body)}`);
    const { id } = res.body.reservation;
    await request(app).post(`/api/payments/${id}`).set('Authorization', `Bearer ${cuenta.token}`).send({ paymentMethod: 'pse' });
    return Reserva.findByPk(id);
}

// PATCH /api/reservations/:id/extend from the exit time the stay has now
function extend(cuenta, stay, body) {
    return request(app)
        .patch(`/api/reservations/${stay.id}/extend`)
        .set('Authorization', `Bearer ${cuenta.token}`)
        .send({ fromEndTime: stay.endTime.toISOString(), ...body });
}

describe('Extending a stay (HU-28, #373)', () => {
    test('an extension that would reach the next reservation of its spot answers 409 SPOT_RESERVED_LATER with until when it is free', async () => {
        // Arrange: a zone of 1 spot, a stay until 60 minutes from now and the
        // spot reserved again from 120 minutes
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const stay = await paidStay(ana, zona, 5, 60);
        const next = await paidStay(beto, zona, 120, 180);

        // Act
        const tooFar = await extend(ana, stay, { newEndTime: inMinutes(115).toISOString(), paymentMethod: 'pse' });
        const inTime = await extend(ana, stay, { newEndTime: new Date(next.startTime.getTime() - 10 * 60 * 1000).toISOString(), paymentMethod: 'pse' });

        // Assert: free until 10 minutes before the next one
        expect(tooFar.status).toBe(409);
        expect(tooFar.body.code).toBe('SPOT_RESERVED_LATER');
        expect(tooFar.body.freeUntil).toBe(new Date(next.startTime.getTime() - 10 * 60 * 1000).toISOString());
        expect(inTime.status).toBe(200);
    });

    test('switching to an open stay is rejected when the spot is reserved before its provisional exit', async () => {
        // Arrange
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const stay = await paidStay(ana, zona, 5, 60);
        await paidStay(beto, zona, 20 * 60, 21 * 60);

        // Act
        const res = await extend(ana, stay, { openEnded: true });

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('SPOT_RESERVED_LATER');
        expect((await Reserva.findByPk(stay.id)).openEnded).toBe(false);
    });

    test('an extension and a new reservation for the same hours of the same spot at the same time: only one of them succeeds', async () => {
        // Arrange: 8 rounds, each with its zone of 1 spot and a stay until
        // 60 minutes from now
        const rounds = await Promise.all(Array.from({ length: 8 }, async () => {
            const zona = await createZone(1);
            const [ana, beto] = await Promise.all([createUser(), createUser()]);
            return { zona, ana, beto, stay: await paidStay(ana, zona, 5, 60) };
        }));

        // Act: in each round both requests go at the same moment
        const answers = await Promise.all(rounds.map(({ zona, ana, beto, stay }) => Promise.all([
            extend(ana, stay, { newEndTime: inMinutes(120).toISOString(), paymentMethod: 'pse' }),
            reserve(beto, zona, inMinutes(75).toISOString(), inMinutes(120).toISOString()),
        ])));

        // Assert: one 200 or one 201 in each round, and the other one is told why
        for (const [extended, created] of answers) {
            const outcome = [extended.status, created.status].sort().join(' and ');
            expect(['200 and 409', '201 and 409']).toContain(outcome);
            if (extended.status === 409) expect(extended.body.code).toBe('SPOT_RESERVED_LATER');
            if (created.status === 409) expect(created.body.code).toBe('NO_SPOTS_AVAILABLE');
        }
    });
});
