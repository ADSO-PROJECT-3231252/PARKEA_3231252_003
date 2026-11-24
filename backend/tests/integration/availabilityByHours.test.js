// #375: GET /api/zones/:id/availability against a real MySQL database. The
// number it gives must be the number of reservations that POST /reservations
// can still take for those hours. HU-31: for one vehicle type.
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

// A paid reservation of the car spot with that number, from `start` to `end`
// minutes from now
async function hold(zona, spotNumber, start, end) {
    const cupo = await ParkingSpot.findOne({ where: { zoneId: zona.id, vehicleType: 'car', spotNumber } });
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

// The question for the spots of a type from `start` to `end` minutes from now
const ask = (zona, start, end, vehicleType = 'car') => request(app)
    .get(`/api/zones/${zona.id}/availability`)
    .query({ startTime: inMinutes(start), endTime: inMinutes(end), vehicleType });

// The free car spots (or of the type asked) of the zone from `start` to `end`
// minutes from now
async function freeSpots(zona, start, end, vehicleType = 'car') {
    const res = await ask(zona, start, end, vehicleType);
    expect(res.status).toBe(200);
    return res.body.availableSlots;
}

// A new user whose vehicle is a motorcycle (it has no reservations yet)
async function motorcycleUser() {
    const user = await createUser();
    await user.vehiculo.update({ vehicleType: 'motorcycle' });
    return user;
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
        const res = await request(app).get(`/api/zones/${zona.id}/availability`).query({ startTime: inMinutes(60), openEnded: 'true', vehicleType: 'car' });

        // Assert: only spot 2 is free for the whole 24 hours
        expect(res.status).toBe(200);
        expect(res.body).toMatchObject({ openEnded: true, endTime: inMinutes(60 + 24 * 60), availableSlots: 1 });
    });
});

describe('The free spots of one vehicle type, on MySQL (HU-31)', () => {
    test('the number of a type is how many reservations of vehicles of that type can still be made, and the cars do not use them', async () => {
        // Arrange: 2 cars and 2 motorcycles, and one car reserved at those hours
        const zona = await createZone(2, {
            vehicleTypes: [
                { vehicleType: 'car', totalSlots: 2, hourlyRate: 2000 },
                { vehicleType: 'motorcycle', totalSlots: 2, hourlyRate: 1000 },
            ],
        });
        await hold(zona, 1, 60, 120);
        const asked = await ask(zona, 60, 120, 'motorcycle');
        expect(asked.body).toMatchObject({ vehicleType: 'motorcycle', availableSlots: 2, totalSlots: 2, hourlyRate: 1000 });

        // Act: one more motorcycle than the free motorcycle spots
        const users = await Promise.all([motorcycleUser(), motorcycleUser(), motorcycleUser()]);
        const answers = [];
        for (const user of users) answers.push(await reserve(user, zona, inMinutes(60), inMinutes(120)));

        // Assert: each one at the rate of the motorcycles, and the car spot
        // that was free is still free
        expect(answers.map((res) => res.status)).toEqual([201, 201, 409]);
        expect(answers[2].body.code).toBe('NO_SPOTS_AVAILABLE');
        expect(answers.slice(0, 2).map((res) => [res.body.reservation.spotNumber, res.body.reservation.spotVehicleType, Number(res.body.reservation.appliedHourlyRate)]))
            .toEqual([[1, 'motorcycle', 1000], [2, 'motorcycle', 1000]]);
        expect(await freeSpots(zona, 60, 120, 'motorcycle')).toBe(0);
        expect(await freeSpots(zona, 60, 120, 'car')).toBe(1);
    });

    test('a type the zone does not accept answers 409 VEHICLE_TYPE_NOT_ACCEPTED, the same as the reservation of a vehicle of that type', async () => {
        // Arrange: a zone of cars only
        const zona = await createZone(2);
        const user = await motorcycleUser();

        // Act
        const asked = await ask(zona, 60, 120, 'motorcycle');
        const booked = await reserve(user, zona, inMinutes(60), inMinutes(120));

        // Assert
        expect(asked.status).toBe(409);
        expect(asked.body).toEqual({ code: 'VEHICLE_TYPE_NOT_ACCEPTED', message: 'This zone does not accept this type of vehicle', vehicleType: 'motorcycle', acceptedTypes: ['car'] });
        expect({ status: booked.status, body: booked.body }).toEqual({ status: asked.status, body: asked.body });
    });
});
