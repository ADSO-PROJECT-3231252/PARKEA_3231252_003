// HU-31: the vehicle types of the zones as the API sends them
// (services/zoneVehicleTypes.js). The counts are replaced by spies: their
// queries are tested in availability.test.js and on MySQL.
const { Zona, ZoneVehicleType } = require('../src/models');
const availability = require('../src/services/availability');
const { withVehicleTypes } = require('../src/services/zoneVehicleTypes');

const NOW = new Date('2026-11-16T13:00:00Z');
const CENTRO = '22222222-2222-4222-8222-222222222222';
const NORTE = '55555555-5555-4555-8555-555555555555';
const TRANSACTION = { id: 'zone-reads' };

const zone = (id) => Zona.build({ id, name: id === CENTRO ? 'Centro' : 'Norte', totalSlots: 99, hourlyRate: '2000.00' });
// [zoneId, vehicleType, totalSlots, hourlyRate, isAccepting], as the model gives them
const rows = (...items) => items.map(([zoneId, vehicleType, totalSlots, hourlyRate, isAccepting = true]) => ZoneVehicleType.build({ zoneId, vehicleType, totalSlots, hourlyRate, isAccepting }));

let findTypes;
let free;
let inUse;

// The types of both zones, with the free spots and the spots in use of each
function arrange() {
    findTypes = jest.spyOn(ZoneVehicleType, 'findAll').mockImplementation(async ({ where }) => rows(
        [CENTRO, 'truck', 2, '9000.00', false],
        [CENTRO, 'motorcycle', 4, '1500.00'],
        [CENTRO, 'car', 10, '2500.00'],
        [NORTE, 'car', 5, '1800.00'],
    ).filter((tipo) => where.isAccepting === undefined || tipo.isAccepting === where.isAccepting));
    free = jest.spyOn(availability, 'availableNowByZoneAndType').mockResolvedValue(new Map([
        [`${CENTRO}:car`, 6],
        [`${CENTRO}:truck`, 2],
        [`${NORTE}:car`, 5],
    ]));
    inUse = jest.spyOn(availability, 'inUseByZoneAndType').mockResolvedValue(new Map([
        [`${CENTRO}:car`, { spots: 3, reservations: 4 }],
        [`${CENTRO}:truck`, { spots: 1, reservations: 1 }],
    ]));
}

afterEach(() => {
    jest.restoreAllMocks();
});

describe('The vehicle types of the zones, as the API sends them (HU-31)', () => {
    test('each zone gets the types it accepts, in the order car, motorcycle, truck, with their rates as numbers', async () => {
        // Arrange
        arrange();
        const centro = zone(CENTRO);

        // Act
        await withVehicleTypes([centro, zone(NORTE)], { transaction: TRANSACTION, now: NOW });

        // Assert: a type with no free spot has 0
        expect(centro.get('vehicleTypes')).toEqual([
            { vehicleType: 'car', totalSlots: 10, availableSlots: 6, hourlyRate: 2500 },
            { vehicleType: 'motorcycle', totalSlots: 4, availableSlots: 0, hourlyRate: 1500 },
        ]);
    });

    test('the spots and the free spots of a zone are the sums of the types it accepts', async () => {
        // Arrange
        arrange();
        const [centro, norte] = [zone(CENTRO), zone(NORTE)];

        // Act
        await withVehicleTypes([centro, norte], { transaction: TRANSACTION, now: NOW });

        // Assert
        expect([centro.totalSlots, centro.get('availableSlots')]).toEqual([14, 6]);
        expect([norte.totalSlots, norte.get('availableSlots')]).toEqual([5, 5]);
    });

    test('for the user, it asks only the types that take reservations, and no spots in use', async () => {
        // Arrange
        arrange();

        // Act
        await withVehicleTypes([zone(CENTRO), zone(NORTE)], { transaction: TRANSACTION, now: NOW });

        // Assert: one query of each kind for all the zones, in the transaction
        expect(findTypes).toHaveBeenCalledTimes(1);
        expect(findTypes).toHaveBeenCalledWith({ where: { zoneId: [CENTRO, NORTE], isAccepting: true }, transaction: TRANSACTION });
        expect(free).toHaveBeenCalledWith([CENTRO, NORTE], { transaction: TRANSACTION, now: NOW });
        expect(inUse).not.toHaveBeenCalled();
    });

    test('the administrator gets every type, the ones turned off too, with their spots in use and open reservations', async () => {
        // Arrange
        arrange();
        const centro = zone(CENTRO);

        // Act
        await withVehicleTypes([centro], { transaction: TRANSACTION, now: NOW, forAdmin: true });

        // Assert
        expect(centro.get('vehicleTypes')).toEqual([
            { vehicleType: 'car', totalSlots: 10, availableSlots: 6, hourlyRate: 2500, isAccepting: true, spotsInUse: 3, openReservations: 4 },
            { vehicleType: 'motorcycle', totalSlots: 4, availableSlots: 0, hourlyRate: 1500, isAccepting: true, spotsInUse: 0, openReservations: 0 },
            { vehicleType: 'truck', totalSlots: 2, availableSlots: 2, hourlyRate: 9000, isAccepting: false, spotsInUse: 1, openReservations: 1 },
        ]);
        expect(findTypes).toHaveBeenCalledWith({ where: { zoneId: [CENTRO] }, transaction: TRANSACTION });
        expect(inUse).toHaveBeenCalledWith([CENTRO], { transaction: TRANSACTION, now: NOW });
    });

    test('for the administrator too, the sums of a zone leave out the types turned off', async () => {
        // Arrange
        arrange();
        const centro = zone(CENTRO);

        // Act
        await withVehicleTypes([centro], { forAdmin: true });

        // Assert
        expect([centro.totalSlots, centro.get('availableSlots')]).toEqual([14, 6]);
    });

    test('a zone without types has none, and no spots', async () => {
        // Arrange
        arrange();
        const otra = zone('77777777-7777-4777-8777-777777777777');

        // Act
        await withVehicleTypes([otra]);

        // Assert
        expect(otra.get('vehicleTypes')).toEqual([]);
        expect([otra.totalSlots, otra.get('availableSlots')]).toEqual([0, 0]);
    });

    test('without zones it asks nothing', async () => {
        // Arrange
        arrange();

        // Act
        const result = await withVehicleTypes([]);

        // Assert
        expect(result).toEqual([]);
        expect(findTypes).not.toHaveBeenCalled();
        expect(free).not.toHaveBeenCalled();
    });

    test('it gives back the same zones, so it can be chained', async () => {
        // Arrange
        arrange();
        const zonas = [zone(CENTRO)];

        // Act + Assert
        expect(await withVehicleTypes(zonas)).toBe(zonas);
    });
});
