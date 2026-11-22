// #373: the spot of each reservation, against a real MySQL database
const { Reserva } = require('../../src/models');
const { MARGIN_MS } = require('../../src/services/availability');
const { inMinutes, createUser, createZone, reserve } = require('./helpers');

// Two reservations of the same spot that overlap, with the margin
function sharedSpots(reservas) {
    const shared = [];
    for (const a of reservas) {
        for (const b of reservas) {
            if (a.id < b.id && a.parkingSpotId === b.parkingSpotId
                && a.startTime.getTime() < b.endTime.getTime() + MARGIN_MS
                && b.startTime.getTime() < a.endTime.getTime() + MARGIN_MS) {
                shared.push([a.spotNumber, a.startTime, b.startTime]);
            }
        }
    }
    return shared;
}

describe('The spot of a new reservation (HU-14)', () => {
    test('with 10 requests at the same moment for the same hours, a zone of 3 spots gives 3 different spots', async () => {
        // Arrange
        const zona = await createZone(3);
        const cuentas = await Promise.all(Array.from({ length: 10 }, () => createUser()));
        const start = inMinutes(60).toISOString();
        const end = inMinutes(120).toISOString();

        // Act
        const answers = await Promise.all(cuentas.map((cuenta) => reserve(cuenta, zona, start, end)));

        // Assert
        const created = answers.filter((res) => res.status === 201);
        expect(created).toHaveLength(3);
        expect(created.map((res) => res.body.reservation.spotNumber).sort()).toEqual([1, 2, 3]);
        expect(answers.filter((res) => res.status === 409).map((res) => res.body.code))
            .toEqual(Array(7).fill('NO_SPOTS_AVAILABLE'));
        expect(await Reserva.count({ where: { zoneId: zona.id } })).toBe(3);
    });

    test('in a zone of 2 spots with two reservations for tomorrow, a third person can reserve for today (#373)', async () => {
        // Arrange
        const zona = await createZone(2);
        const [ana, beto, carla] = await Promise.all([createUser(), createUser(), createUser()]);
        await reserve(ana, zona, inMinutes(24 * 60).toISOString(), inMinutes(26 * 60).toISOString());
        await reserve(beto, zona, inMinutes(24 * 60).toISOString(), inMinutes(26 * 60).toISOString());

        // Act
        const res = await reserve(carla, zona, inMinutes(30).toISOString(), inMinutes(90).toISOString());

        // Assert: the spot with the lowest number is free today
        expect(res.status).toBe(201);
        expect(res.body.reservation.spotNumber).toBe(1);
    });

    test('a reservation can start 10 minutes after the one before it on the same spot, not 9 (#373)', async () => {
        // Arrange: a zone of 1 spot, reserved from 60 to 120 minutes from now
        const zona = await createZone(1);
        const [ana, beto, carla] = await Promise.all([createUser(), createUser(), createUser()]);
        const first = await reserve(ana, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

        // Act
        const tooSoon = await reserve(beto, zona, new Date(new Date(first.body.reservation.endTime).getTime() + 9 * 60 * 1000).toISOString(), inMinutes(180).toISOString());
        const inTime = await reserve(carla, zona, new Date(new Date(first.body.reservation.endTime).getTime() + 10 * 60 * 1000).toISOString(), inMinutes(180).toISOString());

        // Assert
        expect(tooSoon.status).toBe(409);
        expect(tooSoon.body.code).toBe('NO_SPOTS_AVAILABLE');
        expect(inTime.status).toBe(201);
    });

    test('20 requests at the same moment for hours that cross each other never share a spot at overlapping hours (#373)', async () => {
        // Arrange: a zone of 3 spots, and stays of one hour that start every
        // 20 minutes, two people for each one
        const zona = await createZone(3);
        const cuentas = await Promise.all(Array.from({ length: 20 }, () => createUser()));

        // Act
        const answers = await Promise.all(cuentas.map((cuenta, i) => {
            const start = 60 + Math.floor(i / 2) * 20;
            return reserve(cuenta, zona, inMinutes(start).toISOString(), inMinutes(start + 60).toISOString());
        }));

        // Assert: every answer is 201 or 409 NO_SPOTS_AVAILABLE, and the saved
        // reservations never share a spot
        expect(answers.filter((res) => res.status !== 201 && res.body.code !== 'NO_SPOTS_AVAILABLE')).toEqual([]);
        const reservas = await Reserva.findAll({ where: { zoneId: zona.id } });
        expect(reservas.length).toBe(answers.filter((res) => res.status === 201).length);
        expect(reservas.length).toBeGreaterThan(3);
        expect(sharedSpots(reservas)).toEqual([]);
    });

    test('a Pending reservation whose 15 minutes ended does not hold its spot, before the job marks it Expired (#373)', async () => {
        // Arrange: a zone of 1 spot, with a reservation that was never paid
        const zona = await createZone(1);
        const [ana, beto] = await Promise.all([createUser(), createUser()]);
        const unpaid = await reserve(ana, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
        await Reserva.update({ holdExpiresAt: inMinutes(-1) }, { where: { id: unpaid.body.reservation.id } });

        // Act
        const res = await reserve(beto, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

        // Assert
        expect(res.status).toBe(201);
        expect(res.body.reservation.spotNumber).toBe(1);
        expect((await Reserva.findByPk(unpaid.body.reservation.id)).status).toBe('Pending');
    });

    test('an open stay is accepted only when a spot is free until its provisional exit, 24 hours later (HU-27, #373)', async () => {
        // Arrange: a zone of 1 spot, reserved for tomorrow
        const zona = await createZone(1);
        const [ana, beto, carla] = await Promise.all([createUser(), createUser(), createUser()]);
        await reserve(ana, zona, inMinutes(20 * 60).toISOString(), inMinutes(21 * 60).toISOString());

        // Act
        const blocked = await reserve(beto, zona, inMinutes(60).toISOString(), undefined, { openEnded: true });
        const withExit = await reserve(carla, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

        // Assert: the open stay would hold the spot until 25 hours from now
        expect(blocked.status).toBe(409);
        expect(blocked.body.code).toBe('NO_SPOTS_AVAILABLE');
        expect(withExit.status).toBe(201);
    });
});
