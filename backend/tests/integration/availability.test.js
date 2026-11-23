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

// The spot with that number in the zone
const spot = (zona, spotNumber) => ParkingSpot.findOne({ where: { zoneId: zona.id, spotNumber } });

// A reservation of `spotNumber` from `start` to `end` minutes from now
async function hold(zona, spotNumber, start, end, values = {}) {
    const cupo = await spot(zona, spotNumber);
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

// The number of the free spot with the lowest number, or null
async function firstFree(zona, start, end) {
    const cupo = await availability.firstFreeSpot(zona.id, inMinutes(start), inMinutes(end));
    return cupo ? cupo.spotNumber : null;
}

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

describe('The free spots of several zones (#373)', () => {
    test('are counted in one query, for the hours asked', async () => {
        // Arrange: two zones of 3 spots; the first has one taken now and one
        // taken tomorrow
        const centro = await createZone(3);
        const norte = await createZone(3);
        await hold(centro, 1, -30, 60);
        await hold(centro, 2, 24 * 60, 25 * 60);

        // Act
        const now = await availability.freeSpotsByZone([centro.id, norte.id], inMinutes(1), inMinutes(31));
        const tomorrow = await availability.freeSpotsByZone([centro.id, norte.id], inMinutes(24 * 60), inMinutes(25 * 60));

        // Assert
        expect(now).toEqual(new Map([[centro.id, 2], [norte.id, 3]]));
        expect(tomorrow).toEqual(new Map([[centro.id, 2], [norte.id, 3]]));
    });

    test('availableSlots is the number free for 30 minutes from now', async () => {
        // Arrange: a stay that starts in 35 minutes takes its spot, with the
        // margin, from the next 30 minutes
        const zona = await createZone(3);
        await hold(zona, 1, 35, 90);
        await hold(zona, 2, 24 * 60, 25 * 60);

        // Act and assert
        expect(await availability.availableNow(zona.id)).toBe(2);
        await availability.withAvailableSlots([zona]);
        expect(zona.toJSON().availableSlots).toBe(2);
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
        const inUse = await availability.spotsInUse(zona.id);
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
