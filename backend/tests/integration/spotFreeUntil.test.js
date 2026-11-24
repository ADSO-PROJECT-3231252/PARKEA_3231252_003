// #375: `spotFreeUntil` of the list and the detail of the reservations,
// against a real MySQL database. The extend dialog offers the exit times up
// to it, so an extension up to it must be accepted, and one past it must
// answer SPOT_RESERVED_LATER with that same time.
const request = require('supertest');
const { Reserva } = require('../../src/models');
const { app, createUser, createZone, reserve, MINUTE_MS } = require('./helpers');

// The times of this file count from one moment in whole seconds, as MySQL
// keeps them, so a case on the edge of the margin is always the same
const BASE = Math.floor(Date.now() / 1000) * 1000;
const inMinutes = (minutes) => new Date(BASE + minutes * MINUTE_MS);

// A reservation from `start` to `end` minutes from now, paid with PSE
async function paidStay(cuenta, zona, start, end) {
    const res = await reserve(cuenta, zona, inMinutes(start).toISOString(), inMinutes(end).toISOString());
    if (res.status !== 201) throw new Error(`The stay was not created: ${res.status} ${JSON.stringify(res.body)}`);
    const { id } = res.body.reservation;
    await request(app).post(`/api/payments/${id}`).set('Authorization', `Bearer ${cuenta.token}`).send({ paymentMethod: 'pse' });
    return Reserva.findByPk(id);
}

// spotFreeUntil of the stay in its detail and in the list of its account
async function spotFreeUntilOf(cuenta, stay) {
    const detail = await request(app).get(`/api/reservations/${stay.id}`).set('Authorization', `Bearer ${cuenta.token}`);
    const list = await request(app).get('/api/reservations').set('Authorization', `Bearer ${cuenta.token}`);
    expect(detail.status).toBe(200);
    expect(list.status).toBe(200);
    const inList = list.body.reservations.find((r) => r.id === stay.id).spotFreeUntil;
    expect(inList).toBe(detail.body.reservation.spotFreeUntil);
    return detail.body.reservation.spotFreeUntil;
}

// PATCH /api/reservations/:id/extend from the exit time the stay has now
function extend(cuenta, stay, body) {
    return request(app)
        .patch(`/api/reservations/${stay.id}/extend`)
        .set('Authorization', `Bearer ${cuenta.token}`)
        .send({ fromEndTime: stay.endTime.toISOString(), ...body });
}

describe('Until when the spot of a stay is free, on MySQL (#375)', () => {
    test('with the spot reserved later, it is free until 10 minutes before, and an extension is accepted up to that time and not one minute later', async () => {
        // Arrange: a zone of 1 spot, a stay until 60 minutes from now and the
        // spot reserved again from 120 minutes
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const stay = await paidStay(ana, zona, 5, 60);
        const next = await paidStay(beto, zona, 120, 180);
        const tenMinutesBefore = new Date(next.startTime.getTime() - 10 * MINUTE_MS).toISOString();

        // Act
        const until = await spotFreeUntilOf(ana, stay);
        const oneMinuteLater = await extend(ana, stay, { newEndTime: new Date(new Date(until).getTime() + MINUTE_MS).toISOString(), paymentMethod: 'pse' });
        const upToIt = await extend(ana, stay, { newEndTime: until, paymentMethod: 'pse' });

        // Assert
        expect(until).toBe(tenMinutesBefore);
        expect(oneMinuteLater.status).toBe(409);
        expect(oneMinuteLater.body).toMatchObject({ code: 'SPOT_RESERVED_LATER', freeUntil: until });
        expect(upToIt.status).toBe(200);
        expect((await Reserva.findByPk(stay.id)).endTime.toISOString()).toBe(until);
    });

    test('with the spot free for the rest of the 24 hours, there is no limit, and the stay can become an open stay', async () => {
        // Arrange
        const zona = await createZone(1);
        const ana = await createUser();
        const stay = await paidStay(ana, zona, 5, 60);

        // Act
        const until = await spotFreeUntilOf(ana, stay);
        const open = await extend(ana, stay, { openEnded: true });

        // Assert
        expect(until).toBeNull();
        expect(open.status).toBe(200);
    });

    test('a reservation of the spot that waits for its payment counts until its 15 minutes end, as in an extension', async () => {
        // Arrange: the spot reserved again from 120 minutes, not paid yet
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const stay = await paidStay(ana, zona, 5, 60);
        const waiting = await reserve(beto, zona, inMinutes(120).toISOString(), inMinutes(180).toISOString());
        expect(waiting.status).toBe(201);

        // Act: while its 15 minutes run, and once they ended (before the job marks it Expired, #347)
        const whileWaiting = await spotFreeUntilOf(ana, stay);
        await Reserva.update({ holdExpiresAt: inMinutes(-1) }, { where: { id: waiting.body.reservation.id } });
        const afterItsTime = await spotFreeUntilOf(ana, stay);
        const open = await extend(ana, stay, { openEnded: true });

        // Assert
        expect(whileWaiting).toBe(new Date(new Date(waiting.body.reservation.startTime).getTime() - 10 * MINUTE_MS).toISOString());
        expect(afterItsTime).toBeNull();
        expect(open.status).toBe(200);
    });

    test('the spot taken just after the exit (at the 10 minutes) leaves no time to extend: it is free until the exit time itself', async () => {
        // Arrange: the next reservation of the spot starts 10 minutes after the exit
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const stay = await paidStay(ana, zona, 5, 60);
        await paidStay(beto, zona, 70, 130);

        // Act
        const until = await spotFreeUntilOf(ana, stay);
        const tenMinutesMore = await extend(ana, stay, { newEndTime: inMinutes(70).toISOString(), paymentMethod: 'pse' });

        // Assert
        expect(until).toBe(stay.endTime.toISOString());
        expect(tenMinutesMore.status).toBe(409);
        expect(tenMinutesMore.body).toMatchObject({ code: 'SPOT_RESERVED_LATER', freeUntil: until });
    });
});
