// #375: GET /api/zones/:id/availability against a real MySQL database. The
// number it gives must be the number of reservations that POST /reservations
// can still take for those hours.
const request = require('supertest');
const { ParkingSpot, Reserva } = require('../../src/models');
const { app, createUser, createZone, reserve } = require('./helpers');

// The times of this file count from one moment in whole seconds, as MySQL
// keeps them, so a case on the edge of the margin is always the same
const BASE = Math.floor(Date.now() / 1000) * 1000;
const inMinutes = (minutes) => new Date(BASE + minutes * 60 * 1000).toISOString();

let cuenta;

beforeAll(async () => {
    cuenta = await createUser();
});

// A paid reservation of the spot with that number, from `start` to `end`
// minutes from now
async function hold(zona, spotNumber, start, end) {
    const cupo = await ParkingSpot.findOne({ where: { zoneId: zona.id, spotNumber } });
    return Reserva.create({
        userId: cuenta.usuario.id,
        zoneId: zona.id,
        vehicleId: cuenta.vehiculo.id,
        parkingSpotId: cupo.id,
        spotNumber,
        startTime: inMinutes(start),
        endTime: inMinutes(end),
        status: 'Active',
        appliedHourlyRate: 2000,
    });
}

// The free spots of the zone from `start` to `end` minutes from now
async function freeSpots(zona, start, end) {
    const res = await request(app).get(`/api/zones/${zona.id}/availability`).query({ startTime: inMinutes(start), endTime: inMinutes(end) });
    expect(res.status).toBe(200);
    return res.body.availableSlots;
}

describe('The free spots of a zone for some hours, on MySQL (#375)', () => {
    test('counts the enabled spots with no reservation in those hours, with the 10 minutes', async () => {
        // Arrange: 3 spots; spot 1 reserved from 60 to 120 minutes from now,
        // spot 2 from 200 to 260, and spot 3 disabled
        const zona = await createZone(3);
        await hold(zona, 1, 60, 120);
        await hold(zona, 2, 200, 260);
        await ParkingSpot.update({ status: 'Disabled' }, { where: { zoneId: zona.id, spotNumber: 3 } });

        // Act and assert
        expect(await freeSpots(zona, 60, 120)).toBe(1);
        expect(await freeSpots(zona, 130, 190)).toBe(2);
        expect(await freeSpots(zona, 129, 190)).toBe(1);
        expect(await freeSpots(zona, 130, 191)).toBe(1);
        expect(await freeSpots(zona, 100, 220)).toBe(0);
    });

    test('the number is how many reservations can still be made for those hours', async () => {
        // Arrange: 4 spots, 1 of them reserved at the same hours
        const zona = await createZone(4);
        await hold(zona, 2, 90, 150);
        const free = await freeSpots(zona, 60, 120);
        expect(free).toBe(3);

        // Act: one more reservation than the free spots
        const users = await Promise.all(Array.from({ length: free + 1 }, () => createUser()));
        const answers = [];
        for (const user of users) answers.push(await reserve(user, zona, inMinutes(60), inMinutes(120)));

        // Assert
        expect(answers.map((res) => res.status)).toEqual([201, 201, 201, 409]);
        expect(answers[free].body.code).toBe('NO_SPOTS_AVAILABLE');
        expect(await freeSpots(zona, 60, 120)).toBe(0);
    });

    test('an open stay needs the spot until its provisional exit, 24 hours later', async () => {
        // Arrange: 2 spots; spot 1 reserved 10 hours from now
        const zona = await createZone(2);
        await hold(zona, 1, 600, 660);

        // Act
        const res = await request(app).get(`/api/zones/${zona.id}/availability`).query({ startTime: inMinutes(60), openEnded: 'true' });

        // Assert: only spot 2 is free for the whole 24 hours
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ openEnded: true, endTime: inMinutes(60 + 24 * 60), availableSlots: 1 });
    });
});
