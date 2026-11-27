import { act, renderHook } from '@testing-library/react';
import useZoneForm from '../src/hooks/useZoneForm';

import {
    validateZoneForm,
    buildZonePayload,
    mapZoneApiError,
    parseCoordinatePair,
    zoneToForm,
    emptyWeek,
    emptyVehicleTypes,
} from '../src/utils/zoneForm';

// HU-31: the types of a form; [type, totalSlots, hourlyRate] are checked
const types = (...checked) => {
    const form = emptyVehicleTypes();
    for (const [type, totalSlots, hourlyRate] of checked) form[type] = { checked: true, totalSlots, hourlyRate };
    return form;
};

// A form that passes every rule, with 20 car spots at $ 2.500; each test
// changes only what it checks.
const validForm = () => ({
    name: 'Parque Olaya',
    address: 'Carrera 7 # 20-15, Pereira',
    vehicleTypes: types(['car', '20', '2500']),
    latitude: '4.8133',
    longitude: '-75.6961',
    open24h: true,
    schedule: emptyWeek(),
});

// What axios gives the screen when the API answers with an error
const apiError = (data) => ({ response: { data } });

describe('coordinate errors after editing a zone (#308)', () => {
    test.each([
        ['41, -3', '41', '-3', true],
        ['4.8133, -75.6961', '4.8133', '-75.6961', false],
    ])('updates both Colombia errors after pasting %s', (text, latitude, longitude, outside) => {
        const form = { ...validForm(), latitude: '40' };
        const { result } = renderHook(() => useZoneForm(form));
        const message = 'La ubicación de la zona debe estar dentro de Colombia';
        const colombiaErrors = { latitude: message, longitude: message };

        act(() => result.current.showErrors(validateZoneForm(form)));
        expect(result.current.errors).toEqual(colombiaErrors);

        act(() => result.current.handleCoordinatePaste({
            clipboardData: { getData: () => text },
            preventDefault: jest.fn(),
        }));

        expect(result.current.form).toMatchObject({ latitude, longitude });
        expect(result.current.errors).toEqual(outside ? colombiaErrors : {});
    });

    test.each([
        ['latitude', '40', '4.8133'],
        ['longitude', '-3', '-75.6961'],
    ])('correcting only %s clears the Colombia error from both fields', (field, outside, inside) => {
        const form = { ...validForm(), [field]: outside };
        const { result } = renderHook(() => useZoneForm(form));
        const message = 'La ubicación de la zona debe estar dentro de Colombia';

        act(() => result.current.showErrors(validateZoneForm(form)));
        expect(result.current.errors).toEqual({ latitude: message, longitude: message });

        act(() => result.current.setField(field, inside));
        expect(result.current.errors).toEqual({});
    });

    test('without a coordinate error on screen, typing a coordinate shows no error yet', () => {
        // Arrange: a new form, nothing saved yet
        const { result } = renderHook(() => useZoneForm({ ...validForm(), latitude: '', longitude: '' }));

        // Act: the first coordinate, still without the other one
        act(() => result.current.setField('latitude', '41'));

        // Assert: the errors come out when saving
        expect(result.current.errors).toEqual({});
    });

    test.each([
        ['correcting the latitude keeps the error of the name', 'latitude', '4.8133', ['name']],
        ['writing the name keeps the warning of the location', 'name', 'Centro', ['latitude', 'longitude']],
    ])('%s', (_label, field, value, kept) => {
        // Arrange: no name and a location outside Colombia, after saving
        const form = { ...validForm(), name: '', latitude: '40' };
        const { result } = renderHook(() => useZoneForm(form));
        act(() => result.current.showErrors(validateZoneForm(form)));
        const shown = result.current.errors;
        expect(Object.keys(shown).sort()).toEqual(['latitude', 'longitude', 'name']);

        // Act
        act(() => result.current.setField(field, value));

        // Assert
        expect(result.current.errors).toEqual(Object.fromEntries(kept.map((name) => [name, shown[name]])));
    });
});

describe('validateZoneForm', () => {
    test('a complete, valid form has no errors', () => {
        // Arrange
        const form = validForm();
        // Act
        const errors = validateZoneForm(form);
        // Assert
        expect(errors).toEqual({});
    });

    test('every empty field is required, and at least one vehicle type', () => {
        const empty = { name: '', address: '  ', vehicleTypes: emptyVehicleTypes(), latitude: '', longitude: '', open24h: null, schedule: emptyWeek() };
        const errors = validateZoneForm(empty);
        expect(Object.keys(errors).sort()).toEqual(['address', 'latitude', 'longitude', 'name', 'open24h', 'vehicleTypes']);
        expect(errors.name).toBe('Este campo es obligatorio.');
        expect(errors.vehicleTypes).toBe('Marca al menos un tipo de vehículo.');
    });
});

// HU-31 AC-02: the spots and the rate of each checked type
describe('The vehicle types of the zone form (HU-31)', () => {
    const withTypes = (...checked) => ({ ...validForm(), vehicleTypes: types(...checked) });

    test('a checked type needs its spots and its rate, each error next to its field', () => {
        // Act
        const errors = validateZoneForm(withTypes(['car', '20', '2500'], ['motorcycle', '', '']));

        // Assert
        expect(errors).toEqual({
            'motorcycle.totalSlots': 'Este campo es obligatorio.',
            'motorcycle.hourlyRate': 'Este campo es obligatorio.',
        });
    });

    test('an unchecked type is not checked, even with values that are not valid', () => {
        // Arrange: trucks unchecked, with values kept from before
        const form = withTypes(['car', '20', '2500']);
        form.vehicleTypes.truck = { checked: false, totalSlots: '0', hourlyRate: '0' };

        // Act + Assert
        expect(validateZoneForm(form)).toEqual({});
    });

    test.each(['0', '501', '2.5'])('%s spots are outside 1 to 500 or not a whole number', (totalSlots) => {
        const errors = validateZoneForm(withTypes(['motorcycle', totalSlots, '1000']));
        expect(errors).toEqual({ 'motorcycle.totalSlots': 'Los cupos deben ser un número entero entre 1 y 500.' });
    });

    test.each(['1', '500'])('%s spots are accepted (limits)', (totalSlots) => {
        expect(validateZoneForm(withTypes(['truck', totalSlots, '5000']))).toEqual({});
    });

    // #316: every type charges for its hours
    test.each(['0', '000'])('a rate of %s is rejected: it must be more than $ 0', (hourlyRate) => {
        const errors = validateZoneForm(withTypes(['car', '20', hourlyRate]));
        expect(errors).toEqual({ 'car.hourlyRate': 'La tarifa por hora debe ser mayor que $ 0.' });
    });

    test('a rate of $ 1 is accepted', () => {
        expect(validateZoneForm(withTypes(['car', '20', '1']))).toEqual({});
    });

    test('the zone has at most 500 spots, all its types together', () => {
        // Act
        const over = validateZoneForm(withTypes(['car', '400', '2000'], ['motorcycle', '101', '1000']));
        const limit = validateZoneForm(withTypes(['car', '400', '2000'], ['motorcycle', '100', '1000']));

        // Assert
        expect(over).toEqual({ vehicleTypes: 'La zona puede tener máximo 500 cupos entre todos los tipos. Ahora suma 501.' });
        expect(limit).toEqual({});
    });

    test('the total is not checked while the spots of a type are not valid', () => {
        const errors = validateZoneForm(withTypes(['car', '500', '2000'], ['motorcycle', '600', '1000']));
        expect(errors).toEqual({ 'motorcycle.totalSlots': 'Los cupos deben ser un número entero entre 1 y 500.' });
    });

    test('AC-04: the spots of a type below its spots in use are rejected when editing', () => {
        // Act
        const errors = validateZoneForm(withTypes(['car', '20', '2000'], ['motorcycle', '3', '1000']), { spotsInUse: { motorcycle: 4, car: 25 } });

        // Assert: the cars have 25 in use, but the form already has 20 more
        expect(errors).toEqual({
            'car.totalSlots': 'Mínimo 25: hay 25 cupos de carros con reservas pendientes o activas.',
            'motorcycle.totalSlots': 'Mínimo 4: hay 4 cupos de motos con reservas pendientes o activas.',
        });
    });

    test('AC-04: down to exactly the spots in use is accepted, and 1 spot in use is said once', () => {
        expect(validateZoneForm(withTypes(['motorcycle', '4', '1000']), { spotsInUse: { motorcycle: 4 } })).toEqual({});
        expect(validateZoneForm(withTypes(['truck', '0', '5000']), { spotsInUse: { truck: 1 } })['truck.totalSlots'])
            .toBe('Los cupos deben ser un número entero entre 1 y 500.');
    });

    test('the payload has the checked types only, in the order car, motorcycle, truck, with numbers', () => {
        // Arrange: trucks typed first, motorcycles unchecked with a kept value
        const form = withTypes(['truck', '4', '5000'], ['car', '20', '2500']);
        form.vehicleTypes.motorcycle = { checked: false, totalSlots: '8', hourlyRate: '900' };

        // Act + Assert
        expect(buildZonePayload(form).vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 20, hourlyRate: 2500 },
            { vehicleType: 'truck', totalSlots: 4, hourlyRate: 5000 },
        ]);
    });

    test('editing shows every type of the admin list: the ones turned off unchecked, with their values', () => {
        // Act
        const form = zoneToForm({ ...validForm(), vehicleTypes: undefined }, [
            { vehicleType: 'car', totalSlots: 30, hourlyRate: 2000, isAccepting: true, spotsInUse: 3 },
            { vehicleType: 'truck', totalSlots: 4, hourlyRate: 5000.5, isAccepting: false },
        ]);

        // Assert
        expect(form.vehicleTypes).toEqual({
            car: { checked: true, totalSlots: '30', hourlyRate: '2000' },
            motorcycle: { checked: false, totalSlots: '', hourlyRate: '' },
            truck: { checked: false, totalSlots: '4', hourlyRate: '5000.5' },
        });
    });

    test('without the admin list, the types the zone takes are checked', () => {
        // Act
        const form = zoneToForm({ ...validForm(), vehicleTypes: [{ vehicleType: 'motorcycle', totalSlots: 8, availableSlots: 8, hourlyRate: 900 }] });

        // Assert
        expect(form.vehicleTypes.motorcycle).toEqual({ checked: true, totalSlots: '8', hourlyRate: '900' });
        expect(form.vehicleTypes.car.checked).toBe(false);
    });

    describe('errors of the API', () => {
        const sent = withTypes(['car', '20', '2000'], ['truck', '4', '5000']);

        test('"vehicleTypes[1].totalSlots" goes next to the spots of the second type sent', () => {
            // Act
            const result = mapZoneApiError(apiError({
                code: 'VALIDATION_ERROR',
                errors: [
                    { path: 'vehicleTypes[1].totalSlots', msg: '...' },
                    { path: 'vehicleTypes[0].hourlyRate', msg: '...' },
                ],
            }), sent);

            // Assert
            expect(result.fields).toEqual({
                'truck.totalSlots': 'Los cupos deben ser un número entero entre 1 y 500.',
                'car.hourlyRate': 'Ingresa una tarifa válida en pesos.',
            });
        });

        test.each([
            ['the whole list', 'vehicleTypes'],
            ['a repeated type', 'vehicleTypes[1].vehicleType'],
            ['a type that was not sent', 'vehicleTypes[5].totalSlots'],
        ])('an error of %s goes above the types', (_case, path) => {
            const result = mapZoneApiError(apiError({ code: 'VALIDATION_ERROR', errors: [{ path, msg: '...' }] }), sent);
            expect(result.fields).toEqual({ vehicleTypes: 'Revisa los tipos de vehículo: marca al menos uno, con máximo 500 cupos entre todos.' });
        });

        test('CAPACITY_BELOW_IN_USE goes next to the spots of its type, with the spots in use', () => {
            const result = mapZoneApiError(apiError({ code: 'CAPACITY_BELOW_IN_USE', vehicleType: 'truck', spotsInUse: 1 }), sent);
            expect(result.fields).toEqual({ 'truck.totalSlots': 'Mínimo 1: hay 1 cupo de camiones con reservas pendientes o activas.' });
        });

        test('INSUFFICIENT_AVAILABLE_SPOTS goes next to the spots of its type', () => {
            const result = mapZoneApiError(apiError({ code: 'INSUFFICIENT_AVAILABLE_SPOTS', vehicleType: 'car' }), sent);
            expect(result.fields).toEqual({ 'car.totalSlots': 'No hay suficientes cupos disponibles para reducir la capacidad' });
        });

        test('a capacity error without its type goes above the types', () => {
            const result = mapZoneApiError(apiError({ code: 'CAPACITY_BELOW_IN_USE', spotsInUse: 2 }), sent);
            expect(result.fields).toEqual({ vehicleTypes: 'No puedes reducir la capacidad por debajo de los cupos en uso' });
        });
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
            vehicleTypes: [{ vehicleType: 'car', totalSlots: 20, hourlyRate: 2500 }],
            latitude: 4.8133,
            longitude: -75.6961,
            open24h: true,
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

    test('VALIDATION_ERROR maps each known path to its field', () => {
        const result = mapZoneApiError(apiError({ code: 'VALIDATION_ERROR', errors: [{ path: 'name' }, { path: 'address' }] }));
        expect(result.fields).toEqual({
            name: 'El nombre puede tener máximo 100 caracteres.',
            address: 'La dirección puede tener máximo 255 caracteres.',
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
        const form = zoneToForm({ name: 'Parque Olaya', address: 'Carrera 7', vehicleTypes: [{ vehicleType: 'car', totalSlots: 20, hourlyRate: 2500 }], latitude: '4.8284000', longitude: '-75.6912000', open24h: true, schedule: [] });
        expect(form).toEqual({ name: 'Parque Olaya', address: 'Carrera 7', vehicleTypes: types(['car', '20', '2500']), latitude: '4.8284', longitude: '-75.6912', open24h: true, schedule: emptyWeek() });
    });
});

// HU-29: the opening hours of the zone (AC-01, AC-02, AC-07)
describe('Opening hours of the zone form (HU-29)', () => {
    // Open Monday to Friday from 6:00 a. m. to 8:00 p. m.; closed on weekends
    const weekdays = () => emptyWeek().map((row) => (row.day <= 5
        ? { ...row, opensAt: '06:00', closesAt: '20:00' }
        : { ...row, open: false }));
    const customForm = (schedule = weekdays()) => ({ ...validForm(), open24h: false, schedule });

    test('AC-01: a new zone must choose "Abierta 24 horas" or a custom schedule', () => {
        // Act
        const errors = validateZoneForm({ ...validForm(), open24h: null });
        // Assert
        expect(errors).toEqual({ open24h: 'Elige si la zona abre las 24 horas o tiene un horario personalizado.' });
    });

    test('a valid custom schedule has no errors', () => {
        expect(validateZoneForm(customForm())).toEqual({});
    });

    test('AC-02: at least one day must be open', () => {
        // Arrange
        const allClosed = emptyWeek().map((row) => ({ ...row, open: false }));
        // Act
        const errors = validateZoneForm(customForm(allClosed));
        // Assert
        expect(errors).toEqual({ schedule: 'Marca al menos un día como abierto.' });
    });

    test('AC-02: an open day without its times shows the error next to that day', () => {
        // Arrange
        const schedule = weekdays().map((row) => (row.day === 3 ? { ...row, closesAt: '' } : row));
        // Act
        const errors = validateZoneForm(customForm(schedule));
        // Assert
        expect(errors).toEqual({ day3: 'Escribe la hora de apertura y la de cierre.' });
    });

    test.each([
        ['less than 30 minutes', '06:00', '06:29'],
        ['closing before opening (crossing midnight)', '22:00', '02:00'],
    ])('AC-02: %s open is rejected on that day', (_label, opensAt, closesAt) => {
        // Arrange
        const schedule = weekdays().map((row) => (row.day === 1 ? { ...row, opensAt, closesAt } : row));
        // Act
        const errors = validateZoneForm(customForm(schedule));
        // Assert
        expect(Object.keys(errors)).toEqual(['day1']);
        expect(errors.day1).toMatch(/al menos 30 minutos antes del cierre/);
    });

    test('exactly 30 minutes open is accepted', () => {
        const schedule = weekdays().map((row) => (row.day === 1 ? { ...row, opensAt: '06:00', closesAt: '06:30' } : row));
        expect(validateZoneForm(customForm(schedule))).toEqual({});
    });

    test('a zone open 24 hours ignores the rows of the schedule', () => {
        const errors = validateZoneForm({ ...validForm(), open24h: true, schedule: emptyWeek() });
        expect(errors).toEqual({});
    });

    test('the payload of a custom schedule sends only the open days', () => {
        // Act
        const payload = buildZonePayload(customForm());
        // Assert
        expect(payload.open24h).toBe(false);
        expect(payload.schedule).toEqual([1, 2, 3, 4, 5].map((day) => ({ day, opensAt: '06:00', closesAt: '20:00' })));
    });

    test('the payload of a zone open 24 hours has no schedule', () => {
        const payload = buildZonePayload(validForm());
        expect(payload.open24h).toBe(true);
        expect(payload).not.toHaveProperty('schedule');
    });

    test('AC-01: editing shows the current hours, and the days not listed are closed', () => {
        // Act
        const form = zoneToForm({
            ...validForm(),
            open24h: false,
            schedule: [{ day: 2, opensAt: '07:00', closesAt: '19:00' }],
        });
        // Assert
        expect(form.open24h).toBe(false);
        expect(form.schedule[1]).toEqual({ day: 2, open: true, opensAt: '07:00', closesAt: '19:00' });
        expect(form.schedule.filter((row) => row.open)).toHaveLength(1);
    });

    test('a zone from an older API, without open24h, starts with nothing chosen', () => {
        const form = zoneToForm({ name: 'Centro', latitude: '4.8', longitude: '-75.6' });
        expect(form.open24h).toBeNull();
    });

    test('the errors of the API go next to the day, or to the choice', () => {
        // Act
        const result = mapZoneApiError(apiError({
            code: 'VALIDATION_ERROR',
            errors: [
                { path: 'schedule', day: 4, msg: 'On day 4, ...' },
                { path: 'open24h', msg: 'open24h must be true or false' },
            ],
        }));
        // Assert
        expect(result.fields).toEqual({
            day4: 'Revisa las horas de este día.',
            open24h: 'Elige si la zona abre las 24 horas o tiene un horario personalizado.',
        });
    });

    test('an error about the whole schedule goes above the days', () => {
        const result = mapZoneApiError(apiError({ code: 'VALIDATION_ERROR', errors: [{ path: 'schedule', msg: 'At least one day must be open' }] }));
        expect(result.fields).toEqual({ schedule: 'Revisa el horario: marca al menos un día como abierto.' });
    });
});
