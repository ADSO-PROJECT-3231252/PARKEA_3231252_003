import { acceptedTypesOf, spotsOf, typeFilterOf, zoneTypeOf } from '../src/utils/zones';

// HU-31: a zone as GET /zones sends it, with the types that take
// reservations (here in another order than the one of the screens)
const ZONE = {
    id: 'z1',
    totalSlots: 30,
    availableSlots: 12,
    vehicleTypes: [
        { vehicleType: 'truck', totalSlots: 5, availableSlots: 0, hourlyRate: 6000 },
        { vehicleType: 'car', totalSlots: 25, availableSlots: 12, hourlyRate: 3000 },
    ],
};

describe('zoneTypeOf', () => {
    test('gives the type of the zone, with its spots and its rate', () => {
        expect(zoneTypeOf(ZONE, 'truck')).toEqual({ vehicleType: 'truck', totalSlots: 5, availableSlots: 0, hourlyRate: 6000 });
    });

    test('gives null for a type the zone does not accept', () => {
        expect(zoneTypeOf(ZONE, 'motorcycle')).toBeNull();
    });

    test.each([
        ['a zone without types', { id: 'z2' }],
        ['no zone yet', null],
    ])('gives null for %s', (_case, zone) => {
        expect(zoneTypeOf(zone, 'car')).toBeNull();
    });
});

describe('acceptedTypesOf', () => {
    test('gives the types of the zone in the order of every screen: car, motorcycle, truck', () => {
        expect(acceptedTypesOf(ZONE)).toEqual(['car', 'truck']);
    });

    test('gives none for a zone without types', () => {
        expect(acceptedTypesOf({ id: 'z2' })).toEqual([]);
    });
});

describe('spotsOf (AC-09)', () => {
    test('without a type, the spots of the whole zone', () => {
        expect(spotsOf(ZONE, null)).toMatchObject({ availableSlots: 12, totalSlots: 30 });
    });

    test('with a type, the spots of that type', () => {
        expect(spotsOf(ZONE, 'truck')).toMatchObject({ availableSlots: 0, totalSlots: 5 });
    });

    test('with a type the zone does not accept, the spots of the whole zone', () => {
        expect(spotsOf(ZONE, 'motorcycle')).toMatchObject({ availableSlots: 12, totalSlots: 30 });
    });
});

describe('typeFilterOf (AC-09)', () => {
    test.each(['car', 'motorcycle', 'truck'])('"%s" is a filter', (value) => {
        expect(typeFilterOf(value)).toBe(value);
    });

    test.each([
        ['no parameter', null],
        ['an empty one', ''],
        ['another word', 'bus'],
        ['a name in Spanish', 'moto'],
        ['another case', 'Car'],
    ])('%s means "Todos"', (_case, value) => {
        expect(typeFilterOf(value)).toBeNull();
    });
});
