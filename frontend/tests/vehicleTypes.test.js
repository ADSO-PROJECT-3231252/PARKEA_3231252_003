import {
    VEHICLE_TYPES,
    VEHICLE_TYPE_OPTIONS,
    VEHICLE_TYPE_LABELS,
    vehicleTypeLabel,
    vehicleTypePlural,
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
