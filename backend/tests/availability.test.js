const { Op } = require('sequelize');

// The database is replaced by spies on the models (tests/setup.js). What the
// SQL finds on a real database is checked in tests/integration.
const { ParkingSpot, Reserva, Zona } = require('../src/models');
const availability = require('../src/services/availability');

// "Now" is Monday 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC)
const NOW = new Date('2026-11-16T13:00:00Z');
const at = (time) => new Date(`2026-11-16T${time}:00Z`);
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const OTHER_ZONE_ID = '55555555-5555-4555-8555-555555555555';

// The SQL text of the literal in a where
const sqlOf = (where) => where[Op.and].map((part) => part.val).join(' ');

afterEach(() => {
    jest.restoreAllMocks();
});

describe('The rules of availability (#373)', () => {
    test('two reservations of the same spot keep 10 minutes between them', () => {
        expect(availability.MARGIN_MS).toBe(10 * 60 * 1000);
    });

    test('availableSlots counts the spots free for the shortest stay, 30 minutes', () => {
        expect(availability.MIN_STAY_MS).toBe(30 * 60 * 1000);
    });

    test('a reservation holds its spot while it is Active, or Pending with its 15 minutes still running', () => {
        expect(availability.holdsItsSpot(NOW)).toEqual({
            [Op.or]: [
                { status: 'Active' },
                { status: 'Pending', [Op.or]: [{ holdExpiresAt: null }, { holdExpiresAt: { [Op.gt]: NOW } }] },
            ],
        });
    });

    test('the free spot is taken among the enabled spots of the type of the vehicle, the lowest number first', async () => {
        // Arrange
        const spot = { id: 'spot-3', spotNumber: 3 };
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue(spot);
        const transaction = {};

        // Act
        const found = await availability.firstFreeSpot(ZONE_ID, 'motorcycle', at('15:00'), at('16:00'), { transaction, now: NOW });

        // Assert
        expect(found).toBe(spot);
        const options = ParkingSpot.findOne.mock.calls[0][0];
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, vehicleType: 'motorcycle', status: { [Op.ne]: 'Disabled' } });
        expect(options.order).toEqual([['spotNumber', 'ASC']]);
        expect(options.transaction).toBe(transaction);
    });

    test('a spot is free when no reservation that holds it overlaps the stay with 10 minutes before and after', async () => {
        // Arrange
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue(null);

        // Act
        await availability.firstFreeSpot(ZONE_ID, 'car', at('15:00'), at('16:00'), { now: NOW });

        // Assert: the stay of 15:00 to 16:00 needs its spot from 14:50 to 16:10
        const sql = sqlOf(ParkingSpot.findOne.mock.calls[0][0].where);
        expect(sql).toContain('r.parking_spot_id = `ParkingSpot`.`id`');
        expect(sql).toContain("r.status IN ('Pending', 'Active')");
        expect(sql).toContain("r.hold_expires_at > '2026-11-16 13:00:00'");
        expect(sql).toContain("r.start_time < '2026-11-16 16:10:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 14:50:00'");
    });

    test('a Finished stay keeps the 10 minutes after its exit time, as before the job marked it (#373)', async () => {
        // Arrange
        jest.spyOn(ParkingSpot, 'findOne').mockResolvedValue(null);

        // Act
        await availability.firstFreeSpot(ZONE_ID, 'car', at('15:00'), at('16:00'), { now: NOW });

        // Assert: Finished counts with the same times, with no deadline
        const sql = sqlOf(ParkingSpot.findOne.mock.calls[0][0].where);
        expect(sql).toContain("(r.status = 'Finished' OR (r.status IN ('Pending', 'Active')");
        expect(sql).toContain("r.end_time > '2026-11-16 14:50:00'");
    });

    test('the free spots of several zones are counted in one query, and a zone with none has 0', async () => {
        // Arrange
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: ZONE_ID, free: '4' }]);

        // Act
        const free = await availability.freeSpotsByZone([ZONE_ID, OTHER_ZONE_ID], at('15:00'), at('16:00'), { now: NOW });

        // Assert
        expect(free).toEqual(new Map([[ZONE_ID, 4], [OTHER_ZONE_ID, 0]]));
        expect(ParkingSpot.findAll).toHaveBeenCalledTimes(1);
        const options = ParkingSpot.findAll.mock.calls[0][0];
        expect(options.where).toMatchObject({ zoneId: [ZONE_ID, OTHER_ZONE_ID], status: { [Op.ne]: 'Disabled' } });
        expect(options.group).toEqual(['zoneId']);
    });

    test('without zones there is nothing to ask', async () => {
        // Arrange
        jest.spyOn(ParkingSpot, 'findAll');

        // Act and assert
        await expect(availability.freeSpotsByZone([], at('15:00'), at('16:00'))).resolves.toEqual(new Map());
        expect(ParkingSpot.findAll).not.toHaveBeenCalled();
    });

    test('availableSlots of a zone counts its spots free from now for 30 minutes', async () => {
        // Arrange
        jest.spyOn(ParkingSpot, 'count').mockResolvedValue(7);

        // Act
        const free = await availability.availableNow(ZONE_ID, { now: NOW });

        // Assert: from 13:00 to 13:30, so from 12:50 to 13:40 with the margin
        expect(free).toBe(7);
        const sql = sqlOf(ParkingSpot.count.mock.calls[0][0].where);
        expect(sql).toContain("r.start_time < '2026-11-16 13:40:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 12:50:00'");
    });

    test('the free spots of a type of a zone for some hours are its enabled spots with no reservation in them, with the margin (#375, HU-31)', async () => {
        // Arrange
        const transaction = { id: 't' };
        jest.spyOn(ParkingSpot, 'count').mockResolvedValue(3);

        // Act: today from 3:00 to 5:00 p. m. in Colombia
        const free = await availability.freeSpotsBetween(ZONE_ID, 'truck', at('20:00'), at('22:00'), { transaction, now: NOW });

        // Assert: from 19:50 to 22:10 with the margin, among the enabled
        // spots of the type, with the same rule as the spot that crear gives
        expect(free).toBe(3);
        const options = ParkingSpot.count.mock.calls[0][0];
        expect(options.where.zoneId).toBe(ZONE_ID);
        expect(options.where.vehicleType).toBe('truck');
        expect(options.where.status).toEqual({ [Op.ne]: 'Disabled' });
        expect(options.transaction).toBe(transaction);
        const sql = sqlOf(options.where);
        expect(sql).toContain("r.start_time < '2026-11-16 22:10:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 19:50:00'");
        expect(sql).toContain("r.status = 'Finished'");
        expect(sql).toContain("r.hold_expires_at > '2026-11-16 13:00:00'");
    });

    test('each zone gets its availableSlots, and the API sends it', async () => {
        // Arrange
        const centro = Zona.build({ id: ZONE_ID, name: 'Centro', totalSlots: 10 });
        const norte = Zona.build({ id: OTHER_ZONE_ID, name: 'Norte', totalSlots: 5 });
        jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([{ zoneId: OTHER_ZONE_ID, free: 2 }]);

        // Act
        await availability.withAvailableSlots([centro, norte], { now: NOW });

        // Assert: from 13:00 to 13:30
        expect(centro.toJSON().availableSlots).toBe(0);
        expect(norte.toJSON().availableSlots).toBe(2);
        const sql = sqlOf(ParkingSpot.findAll.mock.calls[0][0].where);
        expect(sql).toContain("r.start_time < '2026-11-16 13:40:00'");
    });

    test('the next reservation of the same spot is looked for in the added time, without the stay itself', async () => {
        // Arrange
        const next = { id: 'other', startTime: at('17:00') };
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(next);
        const stay = { id: 'stay', parkingSpotId: 'spot-1' };

        // Act
        const holder = await availability.nextHolderOfSpot(stay, at('16:00'), at('18:00'), { now: NOW });

        // Assert
        expect(holder).toBe(next);
        const { where, order } = Reserva.findOne.mock.calls[0][0];
        expect(where).toMatchObject({
            id: { [Op.ne]: 'stay' },
            parkingSpotId: 'spot-1',
            startTime: { [Op.lt]: at('18:10') },
            endTime: { [Op.gt]: at('15:50') },
        });
        expect(where[Op.and]).toEqual([availability.holdsItsSpot(NOW)]);
        expect(order).toEqual([['startTime', 'ASC']]);
    });

    test('a reservation without a spot (from before the spots existed) has no next holder', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findOne');

        // Act and assert
        expect(await availability.nextHolderOfSpot({ id: 'old', parkingSpotId: null }, at('16:00'), at('18:00'))).toBeNull();
        expect(Reserva.findOne).not.toHaveBeenCalled();
    });

    test('the spot is free until 10 minutes before the next reservation', () => {
        expect(availability.freeUntil({ startTime: at('17:00') })).toEqual(at('16:50'));
    });

    test('after its exit time, the spot of a stay is free until 10 minutes before its next reservation, looked for as an extension does (#375)', async () => {
        // Arrange: a stay until 4:00 p. m. UTC that can go up to 8:00 p. m.
        jest.spyOn(Reserva, 'findOne').mockResolvedValue({ id: 'next', startTime: at('18:00') });
        const stay = { id: 'stay', parkingSpotId: 'spot-1', endTime: at('16:00') };
        const transaction = { id: 't' };

        // Act
        const until = await availability.spotFreeUntil(stay, at('20:00'), { transaction, now: NOW });

        // Assert: the same search as nextHolderOfSpot, from the exit time to the furthest exit
        expect(until).toEqual(at('17:50'));
        const options = Reserva.findOne.mock.calls[0][0];
        expect(options.where).toMatchObject({
            id: { [Op.ne]: 'stay' },
            parkingSpotId: 'spot-1',
            startTime: { [Op.lt]: at('20:10') },
            endTime: { [Op.gt]: at('15:50') },
        });
        expect(options.where[Op.and]).toEqual([availability.holdsItsSpot(NOW)]);
        expect(options.transaction).toBe(transaction);
    });

    test('with no reservation of the spot until the furthest exit, the spot of a stay has no limit (#375)', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findOne').mockResolvedValue(null);

        // Act and assert
        expect(await availability.spotFreeUntil({ id: 'stay', parkingSpotId: 'spot-1', endTime: at('16:00') }, at('20:00'), { now: NOW })).toBeNull();
    });

    test.each([
        ['has no furthest exit (its zone does not open that day)', null],
        ['is already at its furthest exit', at('16:00')],
    ])('a stay that %s has no limit to look for, and nothing is read (#375)', async (_case, latest) => {
        // Arrange
        jest.spyOn(Reserva, 'findOne');

        // Act and assert
        expect(await availability.spotFreeUntil({ id: 'stay', parkingSpotId: 'spot-1', endTime: at('16:00') }, latest, { now: NOW })).toBeNull();
        expect(Reserva.findOne).not.toHaveBeenCalled();
    });

    test('the spots in use are the different spots with a reservation that holds them from now on', async () => {
        // Arrange
        jest.spyOn(Reserva, 'count').mockResolvedValue(3);

        // Act
        const inUse = await availability.spotsInUse(ZONE_ID, { now: NOW });

        // Assert
        expect(inUse).toBe(3);
        const options = Reserva.count.mock.calls[0][0];
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: NOW } });
        expect(options.where[Op.and]).toEqual([availability.holdsItsSpot(NOW)]);
        expect(options).toMatchObject({ distinct: true, col: 'parkingSpotId' });
    });

    test('the spots in use of several zones are counted in one query, and a zone with none has 0', async () => {
        // Arrange
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ zoneId: OTHER_ZONE_ID, spots: '2' }]);

        // Act
        const inUse = await availability.spotsInUseByZone([ZONE_ID, OTHER_ZONE_ID], { now: NOW });

        // Assert
        expect(inUse).toEqual(new Map([[ZONE_ID, 0], [OTHER_ZONE_ID, 2]]));
        expect(Reserva.findAll).toHaveBeenCalledTimes(1);
        expect(Reserva.findAll.mock.calls[0][0].where).toMatchObject({ zoneId: [ZONE_ID, OTHER_ZONE_ID], endTime: { [Op.gt]: NOW } });
    });

    test('a spot can be disabled only if no reservation holds it from now on', () => {
        // Act
        const sql = availability.freeFromNow(NOW).val;

        // Assert
        expect(sql).toContain('r.parking_spot_id = `ParkingSpot`.`id`');
        expect(sql).toContain("r.end_time > '2026-11-16 13:00:00'");
        expect(sql).not.toContain('r.start_time');
        // A Finished stay ended in the past, so it never holds a spot from now on
        expect(sql).not.toContain('Finished');
    });
});

describe('The free spots and the spots in use of each vehicle type (HU-31)', () => {
    test('a type of a zone is written as zone:type', () => {
        expect(availability.typeKey(ZONE_ID, 'motorcycle')).toBe(`${ZONE_ID}:motorcycle`);
    });

    test('the free spots of each type of each zone are counted in one query, grouped by zone and type', async () => {
        // Arrange
        const findAll = jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([
            { zoneId: ZONE_ID, vehicleType: 'car', free: '4' },
            { zoneId: ZONE_ID, vehicleType: 'motorcycle', free: '2' },
            { zoneId: OTHER_ZONE_ID, vehicleType: 'car', free: '7' },
        ]);

        // Act
        const free = await availability.freeSpotsByZoneAndType([ZONE_ID, OTHER_ZONE_ID], at('14:00'), at('15:00'), { now: NOW });

        // Assert: as numbers, and a type with none free is missing
        expect(free).toEqual(new Map([
            [`${ZONE_ID}:car`, 4],
            [`${ZONE_ID}:motorcycle`, 2],
            [`${OTHER_ZONE_ID}:car`, 7],
        ]));
        expect(findAll).toHaveBeenCalledTimes(1);
        const [options] = findAll.mock.calls[0];
        expect(options.group).toEqual(['zoneId', 'vehicleType']);
        expect(options.where).toMatchObject({ zoneId: [ZONE_ID, OTHER_ZONE_ID], status: { [Op.ne]: 'Disabled' } });
        expect(sqlOf(options.where)).toContain("r.start_time < '2026-11-16 15:10:00'");
        expect(sqlOf(options.where)).toContain("r.end_time > '2026-11-16 13:50:00'");
    });

    test('availableSlots of each type is for the shortest stay from now', async () => {
        // Arrange
        const findAll = jest.spyOn(ParkingSpot, 'findAll').mockResolvedValue([]);

        // Act
        await availability.availableNowByZoneAndType([ZONE_ID], { now: NOW });

        // Assert: 13:00 to 13:30, with the 10 minutes on each side
        const sql = sqlOf(findAll.mock.calls[0][0].where);
        expect(sql).toContain("r.start_time < '2026-11-16 13:40:00'");
        expect(sql).toContain("r.end_time > '2026-11-16 12:50:00'");
    });

    test.each([
        ['the free spots', () => availability.freeSpotsByZoneAndType([], NOW, NOW), ParkingSpot],
        ['the spots in use', () => availability.inUseByZoneAndType([]), Reserva],
    ])('without zones, %s ask nothing', async (_case, count, Model) => {
        // Arrange
        const findAll = jest.spyOn(Model, 'findAll');

        // Act
        const result = await count();

        // Assert
        expect(result).toEqual(new Map());
        expect(findAll).not.toHaveBeenCalled();
    });

    test('the spots in use and the open reservations of each type are counted in one query, by the type of their spot', async () => {
        // Arrange: 3 reservations in 2 car spots
        const findAll = jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ zoneId: ZONE_ID, vehicleType: 'car', spots: '2', reservations: '3' }]);

        // Act
        const inUse = await availability.inUseByZoneAndType([ZONE_ID], { now: NOW });

        // Assert
        expect(inUse).toEqual(new Map([[`${ZONE_ID}:car`, { spots: 2, reservations: 3 }]]));
        const [options] = findAll.mock.calls[0];
        // Each spot once, and each reservation
        expect(JSON.stringify(options.attributes)).toBe(JSON.stringify([
            'zoneId',
            [{ col: 'parkingSpot.vehicle_type' }, 'vehicleType'],
            [{ fn: 'COUNT', args: [{ fn: 'DISTINCT', args: [{ col: 'Reserva.parking_spot_id' }] }] }, 'spots'],
            [{ fn: 'COUNT', args: [{ col: 'Reserva.id' }] }, 'reservations'],
        ]));
        expect(options.include).toEqual([expect.objectContaining({ model: ParkingSpot, as: 'parkingSpot', attributes: [] })]);
        expect(options.group).toEqual(['zoneId', 'parkingSpot.vehicle_type']);
        expect(options.where).toEqual({
            zoneId: [ZONE_ID],
            parkingSpotId: { [Op.ne]: null },
            endTime: { [Op.gt]: NOW },
            [Op.and]: [availability.holdsItsSpot(NOW)],
        });
    });

    test('the spots of one type in use count each spot once, only among the spots of that type', async () => {
        // Arrange
        const count = jest.spyOn(Reserva, 'count').mockResolvedValue(2);

        // Act
        const inUse = await availability.spotsOfTypeInUse(ZONE_ID, 'truck', { now: NOW });

        // Assert
        expect(inUse).toBe(2);
        const [options] = count.mock.calls[0];
        expect(options).toMatchObject({ distinct: true, col: 'parking_spot_id' });
        expect(options.include).toEqual([expect.objectContaining({ model: ParkingSpot, as: 'parkingSpot', attributes: [], where: { vehicleType: 'truck' } })]);
        expect(options.where).toMatchObject({ zoneId: ZONE_ID, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: NOW } });
    });
});
