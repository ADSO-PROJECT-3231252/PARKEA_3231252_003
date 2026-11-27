// #373: services/availability.js against a real MySQL database. The
// reservations are saved directly, with the exact times each case needs.
const { Op } = require('sequelize');
const { ParkingSpot, Reserva } = require('../../src/models');
const availability = require('../../src/services/availability');
const { createUser, createZone } = require('./helpers');

// The times of this file count from one moment in whole seconds, as MySQL
// keeps them, so a case on the edge of the margin is always the same
const BASE = Math.floor(Date.now() / 1000) * 1000;
const inMinutes = (minutes) => new Date(BASE + minutes * 60 * 1000);

let cuenta;

beforeAll(async () => {
    cuenta = await createUser();
});

// The spot with that number in the zone, of the cars unless another type is
// asked (HU-31: each type numbers its spots from 1)
const spot = (zona, spotNumber, vehicleType = 'car') => ParkingSpot.findOne({ where: { zoneId: zona.id, vehicleType, spotNumber } });

// A reservation of `spotNumber` from `start` to `end` minutes from now
async function hold(zona, spotNumber, start, end, { vehicleType, ...values } = {}) {
    const cupo = await spot(zona, spotNumber, vehicleType);
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
        ...values,
    });
}

// The number of the free car spot (or of the type asked) with the lowest
// number, or null
async function firstFree(zona, start, end, vehicleType = 'car') {
    const cupo = await availability.firstFreeSpot(zona.id, vehicleType, inMinutes(start), inMinutes(end));
    return cupo ? cupo.spotNumber : null;
}

// HU-31: a zone with `cars` car spots and `motorcycles` motorcycle spots
const mixedZone = (cars, motorcycles) => createZone(cars, {
    vehicleTypes: [
        { vehicleType: 'car', totalSlots: cars, hourlyRate: 2000 },
        { vehicleType: 'motorcycle', totalSlots: motorcycles, hourlyRate: 1000 },
    ],
});

describe('A spot is free for some hours (#373)', () => {
    test('when its reservation ends 10 minutes or more before them, or starts 10 minutes or more after them', async () => {
        // Arrange: spot 1 is reserved from 60 to 120 minutes from now
        const zona = await createZone(1);
        await hold(zona, 1, 60, 120);

        // Act and assert
        expect(await firstFree(zona, 130, 160)).toBe(1);
        expect(await firstFree(zona, 129, 160)).toBeNull();
        expect(await firstFree(zona, 20, 50)).toBe(1);
        expect(await firstFree(zona, 20, 51)).toBeNull();
        expect(await firstFree(zona, 70, 100)).toBeNull();
    });

    test('a Pending reservation holds it while its 15 minutes run, also without a deadline', async () => {
        // Arrange
        const zona = await createZone(2);
        await hold(zona, 1, 60, 120, { status: 'Pending', holdExpiresAt: inMinutes(5) });
        await hold(zona, 2, 60, 120, { status: 'Pending', holdExpiresAt: null });

        // Act and assert
        expect(await firstFree(zona, 60, 120)).toBeNull();
    });

    test('a Pending reservation whose 15 minutes ended no longer holds it, before the job marks it Expired', async () => {
        // Arrange
        const zona = await createZone(1);
        await hold(zona, 1, 60, 120, { status: 'Pending', holdExpiresAt: inMinutes(-1) });

        // Act and assert
        expect(await firstFree(zona, 60, 120)).toBe(1);
    });

    test.each(['Cancelled', 'Expired'])('a %s reservation does not hold it', async (status) => {
        // Arrange
        const zona = await createZone(1);
        await hold(zona, 1, 60, 120, { status });

        // Act and assert
        expect(await firstFree(zona, 60, 120)).toBe(1);
    });

    test.each(['Active', 'Finished'])('a stay that ended 1 minute ago keeps its 10 minutes after, also once %s', async (status) => {
        // Arrange: Active is how it is before the finish job runs, and
        // Finished after it
        const zona = await createZone(1);
        await hold(zona, 1, -60, -1, { status });

        // Act and assert: 2 minutes from now is too soon; 9 is not
        expect(await firstFree(zona, 2, 60)).toBeNull();
        expect(await firstFree(zona, 9, 60)).toBe(1);
    });

    test('a Finished stay that ended 11 minutes ago no longer holds its spot', async () => {
        // Arrange
        const zona = await createZone(1);
        await hold(zona, 1, -60, -11, { status: 'Finished' });

        // Act and assert
        expect(await firstFree(zona, 1, 60)).toBe(1);
    });

    test('a Disabled spot is never free, and the lowest free number is the one given', async () => {
        // Arrange: spot 1 is taken, 2 is disabled, 3 and 4 are free
        const zona = await createZone(4);
        await hold(zona, 1, 60, 120);
        await (await spot(zona, 2)).update({ status: 'Disabled' });

        // Act and assert
        expect(await firstFree(zona, 60, 120)).toBe(3);
    });
});

describe('A spot of a vehicle type (HU-31)', () => {
    test('is a spot of that type: the spots of the other types are never given', async () => {
        // Arrange: car spot 1 is free, and motorcycle spot 1 is taken
        const zona = await mixedZone(1, 2);
        await hold(zona, 1, 60, 120, { vehicleType: 'motorcycle' });

        // Act and assert
        expect(await firstFree(zona, 60, 120, 'motorcycle')).toBe(2);
        expect(await firstFree(zona, 60, 120, 'car')).toBe(1);
        expect((await availability.firstFreeSpot(zona.id, 'motorcycle', inMinutes(60), inMinutes(120))).vehicleType).toBe('motorcycle');
    });

    test('with all the spots of its type taken there is none, even with spots of other types free', async () => {
        // Arrange
        const zona = await mixedZone(2, 1);
        await hold(zona, 1, 60, 120, { vehicleType: 'motorcycle' });

        // Act and assert
        expect(await firstFree(zona, 60, 120, 'motorcycle')).toBeNull();
        expect(await availability.freeSpotsBetween(zona.id, 'motorcycle', inMinutes(60), inMinutes(120))).toBe(0);
        expect(await availability.freeSpotsBetween(zona.id, 'car', inMinutes(60), inMinutes(120))).toBe(2);
    });

    test('a type the zone does not have has no spots', async () => {
        // Arrange
        const zona = await createZone(2);

        // Act and assert
        expect(await firstFree(zona, 60, 120, 'truck')).toBeNull();
        expect(await availability.freeSpotsBetween(zona.id, 'truck', inMinutes(60), inMinutes(120))).toBe(0);
    });
});

describe('The free spots of several zones (#373, HU-31)', () => {
    test('are counted for each type of each zone in one query, for the hours asked', async () => {
        // Arrange: Centro has 3 cars and 2 motorcycles, with one car taken
        // now and one tomorrow, and a motorcycle taken tomorrow; Norte has 3
        // cars
        const centro = await mixedZone(3, 2);
        const norte = await createZone(3);
        await hold(centro, 1, -30, 60);
        await hold(centro, 2, 24 * 60, 25 * 60);
        await hold(centro, 1, 24 * 60, 25 * 60, { vehicleType: 'motorcycle' });

        // Act
        const key = availability.typeKey;
        const now = await availability.freeSpotsByZoneAndType([centro.id, norte.id], inMinutes(1), inMinutes(31));
        const tomorrow = await availability.freeSpotsByZoneAndType([centro.id, norte.id], inMinutes(24 * 60), inMinutes(25 * 60));

        // Assert
        expect(now).toEqual(new Map([[key(centro.id, 'car'), 2], [key(centro.id, 'motorcycle'), 2], [key(norte.id, 'car'), 3]]));
        expect(tomorrow).toEqual(new Map([[key(centro.id, 'car'), 2], [key(centro.id, 'motorcycle'), 1], [key(norte.id, 'car'), 3]]));
    });

    test('a type with all its spots taken is missing', async () => {
        // Arrange
        const zona = await mixedZone(1, 1);
        await hold(zona, 1, -30, 60, { vehicleType: 'motorcycle' });

        // Act
        const free = await availability.freeSpotsByZoneAndType([zona.id], inMinutes(1), inMinutes(31));

        // Assert
        expect(free).toEqual(new Map([[availability.typeKey(zona.id, 'car'), 1]]));
    });

    test('availableSlots is the number free for 30 minutes from now', async () => {
        // Arrange: a stay that starts in 35 minutes takes its spot, with the
        // margin, from the next 30 minutes
        const zona = await createZone(3);
        await hold(zona, 1, 35, 90);
        await hold(zona, 2, 24 * 60, 25 * 60);

        // Act and assert
        expect(await availability.availableNowByZoneAndType([zona.id])).toEqual(new Map([[availability.typeKey(zona.id, 'car'), 2]]));
    });
});

describe('The next reservation of the same spot (HU-28, #373)', () => {
    test('is the first one in the time added to a stay, never the stay itself', async () => {
        // Arrange: a stay from now to 60 minutes, and the spot reserved
        // again from 120 and from 200 minutes
        const zona = await createZone(1);
        const stay = await hold(zona, 1, -30, 60);
        const next = await hold(zona, 1, 120, 180);
        await hold(zona, 1, 200, 260);

        // Act
        const holder = await availability.nextHolderOfSpot(stay, stay.endTime, inMinutes(150));
        const none = await availability.nextHolderOfSpot(stay, stay.endTime, inMinutes(110));

        // Assert
        expect(holder.id).toBe(next.id);
        expect(availability.freeUntil(holder)).toEqual(inMinutes(110));
        expect(none).toBeNull();
    });
});

describe('The spots in use (HU-21, #373)', () => {
    test('are the different spots with a reservation that holds them from now on', async () => {
        // Arrange: spot 1 has two reservations, spot 2 one that already
        // ended (the job has not finished it yet) and spot 3 an expired one
        const zona = await createZone(4);
        await hold(zona, 1, 60, 120);
        await hold(zona, 1, 24 * 60, 25 * 60);
        await hold(zona, 2, -120, -1);
        await hold(zona, 3, 60, 120, { status: 'Pending', holdExpiresAt: inMinutes(-1) });

        // Act
        const inUse = await availability.spotsOfTypeInUse(zona.id, 'car');
        const byZone = await availability.spotsInUseByZone([zona.id]);
        const canBeDisabled = await ParkingSpot.findAll({
            where: { zoneId: zona.id, [Op.and]: [availability.freeFromNow(new Date())] },
            order: [['spotNumber', 'ASC']],
        });

        // Assert
        expect(inUse).toBe(1);
        expect(byZone).toEqual(new Map([[zona.id, 1]]));
        expect(canBeDisabled.map((cupo) => cupo.spotNumber)).toEqual([2, 3, 4]);
    });
});
