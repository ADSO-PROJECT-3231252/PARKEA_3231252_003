// HU-31: the models of the vehicle types of a zone and of the type of a spot.
// Only the rules of the models: the checks and the foreign key of the
// database are in tests/integration/schemaRules.test.js.
const { Zona, ZoneVehicleType, ParkingSpot, Vehiculo } = require('../src/models');
const { VEHICLE_TYPES } = require('../src/constants/vehicleTypes');

const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const VALID = { zoneId: ZONE_ID, vehicleType: 'motorcycle', totalSlots: 10, hourlyRate: 1500 };

// The attributes that break a rule of the model, or [] when it is valid
async function invalidFields(values) {
    try {
        await ZoneVehicleType.build({ ...VALID, ...values }).validate();
        return [];
    } catch (error) {
        return error.errors.map((item) => item.path);
    }
}

describe('The vehicle types of PARKEA (HU-31)', () => {
    test('are car, motorcycle and truck, in that order', () => {
        expect(VEHICLE_TYPES).toEqual(['car', 'motorcycle', 'truck']);
    });

    test('are the same types a vehicle can have', () => {
        expect(Vehiculo.getAttributes().vehicleType.values).toEqual(VEHICLE_TYPES);
    });

    test('cannot be changed by the code that uses them', () => {
        expect(Object.isFrozen(VEHICLE_TYPES)).toBe(true);
    });
});

describe('A vehicle type of a zone (HU-31)', () => {
    test('with its spots and its rate is valid, and it takes reservations unless it is turned off', async () => {
        // Act
        const tipo = ZoneVehicleType.build(VALID);

        // Assert
        expect(await invalidFields({})).toEqual([]);
        expect(tipo.isAccepting).toBe(true);
    });

    test.each(VEHICLE_TYPES)('the type %s is allowed', async (vehicleType) => {
        expect(await invalidFields({ vehicleType })).toEqual([]);
    });

    test.each([
        ['a type that does not exist', { vehicleType: 'bicycle' }, 'vehicleType'],
        ['no type', { vehicleType: null }, 'vehicleType'],
        ['no spots', { totalSlots: 0 }, 'totalSlots'],
        ['more than 500 spots', { totalSlots: 501 }, 'totalSlots'],
        ['spots that are not whole', { totalSlots: 1.5 }, 'totalSlots'],
        ['a rate of 0', { hourlyRate: 0 }, 'hourlyRate'],
        ['a negative rate', { hourlyRate: -1500 }, 'hourlyRate'],
        ['no zone', { zoneId: null }, 'zoneId'],
    ])('%s is not valid', async (_case, values, field) => {
        expect(await invalidFields(values)).toEqual([field]);
    });

    test.each([
        ['1 spot', { totalSlots: 1 }],
        ['500 spots', { totalSlots: 500 }],
        ['a rate of one cent', { hourlyRate: 0.01 }],
    ])('the limit of %s is valid', async (_case, values) => {
        expect(await invalidFields(values)).toEqual([]);
    });

    test('uses the columns of zone_vehicle_types', () => {
        // Act
        const attributes = ZoneVehicleType.getAttributes();

        // Assert
        expect(ZoneVehicleType.getTableName()).toBe('zone_vehicle_types');
        expect(Object.fromEntries(Object.entries(attributes).map(([name, attribute]) => [name, attribute.field]))).toEqual({
            id: 'id',
            zoneId: 'zone_id',
            vehicleType: 'vehicle_type',
            totalSlots: 'total_slots',
            hourlyRate: 'hourly_rate',
            isAccepting: 'is_accepting',
        });
    });

    test('belongs to its zone, and a zone has its types as vehicleTypes', () => {
        // Act
        const ofZone = Zona.associations.vehicleTypes;
        const ofType = ZoneVehicleType.associations.zone;

        // Assert
        expect(ofZone).toMatchObject({ associationType: 'HasMany', foreignKey: 'zoneId' });
        expect(ofZone.target).toBe(ZoneVehicleType);
        expect(ofType).toMatchObject({ associationType: 'BelongsTo', foreignKey: 'zoneId' });
        expect(ofType.target).toBe(Zona);
    });
});

describe('The vehicle type of a spot (HU-31)', () => {
    test('is required and is one of the types of PARKEA', () => {
        // Act
        const attribute = ParkingSpot.getAttributes().vehicleType;

        // Assert
        expect(attribute).toMatchObject({ field: 'vehicle_type', allowNull: false, values: VEHICLE_TYPES });
    });

    test.each([
        ['a type that does not exist', 'bicycle'],
        ['no type', null],
    ])('a spot with %s is not valid', async (_case, vehicleType) => {
        // Act
        const errors = await ParkingSpot.build({ zoneId: ZONE_ID, vehicleType, spotNumber: 1 }).validate().then(() => [], (error) => error.errors.map((item) => item.path));

        // Assert
        expect(errors).toEqual(['vehicleType']);
    });
});

describe('A zone (HU-31)', () => {
    test('has no spots or rate of its own: each vehicle type has its spots and its rate', () => {
        // Act
        const attributes = Object.keys(Zona.getAttributes());

        // Assert
        expect(attributes).not.toContain('totalSlots');
        expect(attributes).not.toContain('hourlyRate');
    });

    test('is sent with the spots and the types that the API adds to it', () => {
        // Arrange
        const zona = Zona.build({ id: ZONE_ID, name: 'Centro' });
        zona.setDataValue('vehicleTypes', [{ vehicleType: 'car', totalSlots: 10, availableSlots: 4, hourlyRate: 2000 }]);
        zona.setDataValue('totalSlots', 10);

        // Act
        const sent = zona.toJSON();

        // Assert
        expect(sent).toMatchObject({ id: ZONE_ID, name: 'Centro', totalSlots: 10, vehicleTypes: [{ vehicleType: 'car', hourlyRate: 2000 }] });
        expect(sent).not.toHaveProperty('hourlyRate');
    });
});
