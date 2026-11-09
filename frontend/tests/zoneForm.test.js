import {
    validateZoneForm,
    buildZonePayload,
    mapZoneApiError,
    parseCoordinatePair,
    zoneToForm,
} from '../src/utils/zoneForm';

// A form that passes every rule; each test changes only what it checks.
const validForm = () => ({
    name: 'Parque Olaya',
    address: 'Carrera 7 # 20-15, Pereira',
    totalSlots: '20',
    hourlyRate: '2500',
    latitude: '4.8133',
    longitude: '-75.6961',
});

// What axios gives the screen when the API answers with an error
const apiError = (data) => ({ response: { data } });

describe('validateZoneForm', () => {
    test('a complete, valid form has no errors', () => {
        // Arrange
        const form = validForm();
        // Act
        const errors = validateZoneForm(form);
        // Assert
        expect(errors).toEqual({});
    });

    test('every empty field is required', () => {
        const empty = { name: '', address: '  ', totalSlots: '', hourlyRate: '', latitude: '', longitude: '' };
        const errors = validateZoneForm(empty);
        expect(Object.keys(errors).sort()).toEqual(['address', 'hourlyRate', 'latitude', 'longitude', 'name', 'totalSlots']);
        expect(errors.name).toBe('Este campo es obligatorio.');
    });

    test.each(['0', '501', '2.5'])('capacity %s is outside 1 to 500 or not a whole number', (totalSlots) => {
        const errors = validateZoneForm({ ...validForm(), totalSlots });
        expect(errors.totalSlots).toBe('La capacidad debe ser un número entero entre 1 y 500.');
    });

    test.each(['1', '500'])('capacity %s is accepted (limits)', (totalSlots) => {
        expect(validateZoneForm({ ...validForm(), totalSlots })).toEqual({});
    });

    test('capacity below the spots in use is rejected when editing', () => {
        const errors = validateZoneForm({ ...validForm(), totalSlots: '3' }, { spotsInUse: 4 });
        expect(errors.totalSlots).toBe('Hay 4 cupos en uso por reservas pendientes o activas. La capacidad no puede ser menor.');
    });

    test('capacity equal to the spots in use is accepted', () => {
        expect(validateZoneForm({ ...validForm(), totalSlots: '4' }, { spotsInUse: 4 })).toEqual({});
    });

    test.each([
        ['latitude', '90.1', 'La latitud debe estar entre -90 y 90.'],
        ['longitude', '-180.5', 'La longitud debe estar entre -180 y 180.'],
        ['latitude', '4,8133', 'Ingresa la latitud en grados decimales, por ejemplo 4.8284.'],
        ['longitude', '1e2', 'Ingresa la longitud en grados decimales, por ejemplo -75.6912.'],
    ])('%s "%s" is rejected', (field, value, message) => {
        const errors = validateZoneForm({ ...validForm(), [field]: value });
        expect(errors[field]).toBe(message);
    });

    // #232: the zone has to be inside the Colombia rectangle (San Andrés and Leticia included)
    test.each([['13.5', '-66.8'], ['-4.3', '-82']])('coordinates %s, %s on the edges of Colombia are accepted', (latitude, longitude) => {
        expect(validateZoneForm({ ...validForm(), latitude, longitude })).toEqual({});
    });

    test.each([['90', '180'], ['40.4168', '-3.7038'], ['13.51', '-75'], ['4.8', '-66.79']])('coordinates %s, %s outside Colombia show the Colombia message on both fields', (latitude, longitude) => {
        const errors = validateZoneForm({ ...validForm(), latitude, longitude });
        expect(errors).toEqual({
            latitude: 'La ubicación de la zona debe estar dentro de Colombia',
            longitude: 'La ubicación de la zona debe estar dentro de Colombia',
        });
    });
});

describe('buildZonePayload', () => {
    test('trims the texts and sends the numbers as numbers', () => {
        // Arrange
        const form = { ...validForm(), name: '  Parque Olaya  ', address: ' Carrera 7 ' };
        // Act
        const payload = buildZonePayload(form);
        // Assert
        expect(payload).toEqual({
            name: 'Parque Olaya',
            address: 'Carrera 7',
            totalSlots: 20,
            hourlyRate: 2500,
            latitude: 4.8133,
            longitude: -75.6961,
        });
    });

    test('keeps at most 7 decimals in the coordinates, like the database', () => {
        const payload = buildZonePayload({ ...validForm(), latitude: '4.123456789', longitude: '-75.987654321' });
        expect(payload.latitude).toBe(4.1234568);
        expect(payload.longitude).toBe(-75.9876543);
    });
});

describe('mapZoneApiError', () => {
    test('a code with a field puts its message under that field', () => {
        const result = mapZoneApiError(apiError({ code: 'ZONE_NAME_TAKEN' }));
        expect(Object.keys(result.fields)).toEqual(['name']);
        expect(result.general).toBeUndefined();
    });

    test('INVALID_COORDINATES goes under both coordinates', () => {
        const result = mapZoneApiError(apiError({ code: 'INVALID_COORDINATES' }));
        expect(result.fields.latitude).toBe('Las coordenadas ingresadas no son válidas');
        expect(result.fields.longitude).toBe('Las coordenadas ingresadas no son válidas');
    });

    test('CAPACITY_BELOW_IN_USE says how many spots are in use', () => {
        const result = mapZoneApiError(apiError({ code: 'CAPACITY_BELOW_IN_USE', spotsInUse: 1 }));
        expect(result.fields.totalSlots).toBe('Hay 1 cupo en uso por una reserva pendiente o activa. La capacidad no puede ser menor.');
    });

    test('VALIDATION_ERROR maps each known path to its field', () => {
        const result = mapZoneApiError(apiError({ code: 'VALIDATION_ERROR', errors: [{ path: 'name' }, { path: 'hourlyRate' }] }));
        expect(result.fields).toEqual({
            name: 'El nombre puede tener máximo 100 caracteres.',
            hourlyRate: 'Ingresa una tarifa válida en pesos.',
        });
    });

    test('a code without a field becomes a general message', () => {
        const result = mapZoneApiError(apiError({ code: 'FORBIDDEN_ROLE' }));
        expect(result).toEqual({ general: 'No tienes permiso para realizar esta acción' });
    });

    test('an error without a response (no connection) becomes the generic message', () => {
        const result = mapZoneApiError(new Error('Network Error'));
        expect(result).toEqual({ general: 'Ocurrió un error inesperado. Intenta de nuevo' });
    });
});

describe('parseCoordinatePair', () => {
    test.each(['4.8284, -75.6912', '4.8284 -75.6912', ' 4.8284;-75.6912 '])('reads "%s"', (text) => {
        expect(parseCoordinatePair(text)).toEqual({ latitude: '4.8284', longitude: '-75.6912' });
    });

    test.each(['', '4.8284', 'Pereira'])('returns null for "%s"', (text) => {
        expect(parseCoordinatePair(text)).toBeNull();
    });
});

describe('zoneToForm', () => {
    test('drops the zeros the database adds and keeps every decimal', () => {
        const form = zoneToForm({ name: 'Parque Olaya', address: 'Carrera 7', totalSlots: 20, hourlyRate: '2500.00', latitude: '4.8284000', longitude: '-75.6912000' });
        expect(form).toEqual({ name: 'Parque Olaya', address: 'Carrera 7', totalSlots: '20', hourlyRate: '2500', latitude: '4.8284', longitude: '-75.6912' });
    });
});
