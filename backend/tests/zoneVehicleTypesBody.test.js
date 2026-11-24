// HU-31: the vehicle types in the body of POST and PUT /api/zones
// (utils/zoneVehicleTypes.js). Each error has the field of the type it is
// about, so the screen can show it next to that field.
const { MAX_TOTAL_SLOTS, vehicleTypesErrors, vehicleTypesOf } = require('../src/utils/zoneVehicleTypes');

const car = (values = {}) => ({ vehicleType: 'car', totalSlots: 10, hourlyRate: 2000, ...values });
const pathsOf = (vehicleTypes) => vehicleTypesErrors(vehicleTypes).map((error) => error.path);
const errorOf = (values) => vehicleTypesErrors([car(values)]);

describe('The vehicle types of a zone (HU-31)', () => {
    test.each([
        ['one type', [car()]],
        ['the three types, in any order', [car({ vehicleType: 'truck' }), car(), car({ vehicleType: 'motorcycle' })]],
        ['500 spots in total', [car({ totalSlots: 300 }), car({ vehicleType: 'motorcycle', totalSlots: 200 })]],
    ])('%s is valid', (_case, vehicleTypes) => {
        expect(vehicleTypesErrors(vehicleTypes)).toEqual([]);
    });

    test.each([
        ['text', 'car'],
        ['an object', { vehicleType: 'car' }],
        ['a number', 3],
    ])('vehicleTypes as %s must be a list', (_case, vehicleTypes) => {
        expect(vehicleTypesErrors(vehicleTypes)).toEqual([{ path: 'vehicleTypes', msg: 'vehicleTypes must be a list' }]);
    });

    test('an empty list: at least one type', () => {
        expect(vehicleTypesErrors([])).toEqual([{ path: 'vehicleTypes', msg: 'vehicleTypes must have at least one vehicle type' }]);
    });

    test.each([
        ['null', null],
        ['text', 'car'],
        ['a list', ['car', 10, 2000]],
    ])('an item that is %s is not a type', (_case, item) => {
        expect(vehicleTypesErrors([car(), item])).toEqual([{ path: 'vehicleTypes[1]', msg: 'each vehicle type must have vehicleType, totalSlots and hourlyRate' }]);
    });

    test.each([
        ['a type that does not exist', 'bicycle'],
        ['a type with capitals', 'Car'],
        ['the name in Spanish', 'carro'],
        ['no type', undefined],
    ])('%s is not valid', (_case, vehicleType) => {
        expect(errorOf({ vehicleType })).toEqual([{ path: 'vehicleTypes[0].vehicleType', msg: 'vehicleType must be one of car, motorcycle, truck' }]);
    });

    test('a type that is repeated has the error on its second item', () => {
        expect(vehicleTypesErrors([car(), car({ vehicleType: 'motorcycle' }), car()])).toEqual([
            { path: 'vehicleTypes[2].vehicleType', msg: 'vehicleType car is repeated' },
        ]);
    });

    test.each([
        ['0 spots', 0],
        ['negative spots', -1],
        ['spots that are not whole', 1.5],
        ['spots as text', '10'],
        ['more than 500 spots', 501],
        ['no spots', undefined],
    ])('%s are not valid', (_case, totalSlots) => {
        expect(errorOf({ totalSlots })).toEqual([{ path: 'vehicleTypes[0].totalSlots', msg: `totalSlots must be a whole number between 1 and ${MAX_TOTAL_SLOTS}` }]);
    });

    test.each([1, 500])('%s spots are valid', (totalSlots) => {
        expect(errorOf({ totalSlots })).toEqual([]);
    });

    test('more than 500 spots, all the types together, is an error of the list', () => {
        expect(vehicleTypesErrors([car({ totalSlots: 300 }), car({ vehicleType: 'motorcycle', totalSlots: 201 })])).toEqual([
            { path: 'vehicleTypes', msg: 'the zone can have at most 500 spots, all its vehicle types together' },
        ]);
    });

    // The rate is greater than 0 (#316), and it is DECIMAL(10, 2): a third
    // decimal would be rounded by the database without a warning (HU-20, HU-21)
    test.each([
        ['the smallest rate the column holds', 0.01],
        ['a whole number', 3500],
        ['one decimal', 3500.5],
        ['two decimals', 3500.12],
        ['the largest rate the column holds', 99999999.99],
    ])('a rate with %s is valid', (_case, hourlyRate) => {
        expect(errorOf({ hourlyRate })).toEqual([]);
    });

    test.each([
        ['three decimals', 3500.123, 'hourlyRate must have at most 2 decimals'],
        ['more than three decimals', 3500.1234, 'hourlyRate must have at most 2 decimals'],
        ['a third decimal that floating point hides', 1.005, 'hourlyRate must have at most 2 decimals'],
        ['a tiny fraction', 0.001, 'hourlyRate must have at most 2 decimals'],
        ['zero', 0, 'hourlyRate must be greater than 0'],
        ['minus zero', -0, 'hourlyRate must be greater than 0'],
        ['a negative rate', -1.234, 'hourlyRate must be greater than 0'],
        ['a rate larger than the column', 100000000, 'hourlyRate must be a number up to 99999999.99'],
        ['a rate as text', '2000', 'hourlyRate must be a number up to 99999999.99'],
        ['no rate', undefined, 'hourlyRate must be a number up to 99999999.99'],
        ['infinity', Infinity, 'hourlyRate must be a number up to 99999999.99'],
        ['not a number', NaN, 'hourlyRate must be a number up to 99999999.99'],
    ])('a rate with %s is not valid', (_case, hourlyRate, msg) => {
        expect(errorOf({ hourlyRate })).toEqual([{ path: 'vehicleTypes[0].hourlyRate', msg }]);
    });

    test('every error of every type is sent, in the order of the list', () => {
        expect(pathsOf([car({ totalSlots: 0, hourlyRate: 0 }), car({ vehicleType: 'motorcycle', totalSlots: 'x' }), car({ vehicleType: 'bus' })])).toEqual([
            'vehicleTypes[0].totalSlots',
            'vehicleTypes[0].hourlyRate',
            'vehicleTypes[1].totalSlots',
            'vehicleTypes[2].vehicleType',
        ]);
    });
});

describe('The vehicle types of a valid body (HU-31)', () => {
    test('go in the order car, motorcycle, truck, with only their three values', () => {
        // Act
        const tipos = vehicleTypesOf([
            { vehicleType: 'truck', totalSlots: 2, hourlyRate: 9000, isAccepting: false },
            { vehicleType: 'car', totalSlots: 10, hourlyRate: 2000, extra: 'x' },
        ]);

        // Assert
        expect(tipos).toEqual([
            { vehicleType: 'car', totalSlots: 10, hourlyRate: 2000 },
            { vehicleType: 'truck', totalSlots: 2, hourlyRate: 9000 },
        ]);
    });
});
