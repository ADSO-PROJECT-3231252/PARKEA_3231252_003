import {
    VEHICLE_TYPES,
    VEHICLE_TYPE_OPTIONS,
    VEHICLE_TYPE_LABELS,
    vehicleTypeLabel,
    vehicleTypePlural,
    spotText,
    spotLabel,
} from '../src/utils/vehicleTypes';

// HU-31: one place for the names of the vehicle types, used by every screen
describe('The vehicle types of PARKEA (HU-31)', () => {
    test('are car, motorcycle and truck, in that order, as in the backend', () => {
        expect(VEHICLE_TYPES).toEqual(['car', 'motorcycle', 'truck']);
    });

    test('are called Carro, Moto and Camión on every screen', () => {
        expect(VEHICLE_TYPE_OPTIONS).toEqual([
            { value: 'car', label: 'Carro' },
            { value: 'motorcycle', label: 'Moto' },
            { value: 'truck', label: 'Camión' },
        ]);
        expect(VEHICLE_TYPE_LABELS).toEqual({ car: 'Carro', motorcycle: 'Moto', truck: 'Camión' });
    });

    test.each([
        ['car', 'Carro', 'carros'],
        ['motorcycle', 'Moto', 'motos'],
        ['truck', 'Camión', 'camiones'],
    ])('%s is "%s", and "%s" in a sentence', (type, label, plural) => {
        expect(vehicleTypeLabel(type)).toBe(label);
        expect(vehicleTypePlural(type)).toBe(plural);
    });

    test('a type that is not of PARKEA is shown as it comes', () => {
        expect(vehicleTypeLabel('bicycle')).toBe('bicycle');
        expect(vehicleTypePlural('bicycle')).toBe('bicycle');
    });
});

// HU-31 AC-03: the spots are numbered per type, so a spot is always shown
// with its type
describe('The text of a spot (HU-31 AC-03)', () => {
    test.each([
        [3, 'motorcycle', '3 · Moto', 'Cupo 3 · Moto'],
        [12, 'car', '12 · Carro', 'Cupo 12 · Carro'],
        [1, 'truck', '1 · Camión', 'Cupo 1 · Camión'],
    ])('spot %s of %s is "%s", or "%s" alone', (number, type, text, label) => {
        expect(spotText(number, type)).toBe(text);
        expect(spotLabel(number, type)).toBe(label);
    });

    test('without its type, only its number', () => {
        expect(spotText(4, null)).toBe('4');
        expect(spotLabel(4, undefined)).toBe('Cupo 4');
    });

    test('without a number, a dash', () => {
        expect(spotText(null, 'car')).toBe('— · Carro');
        expect(spotLabel(undefined, null)).toBe('Cupo —');
    });
});
