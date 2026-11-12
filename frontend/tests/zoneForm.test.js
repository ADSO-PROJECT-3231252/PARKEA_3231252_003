import {
    validateZoneForm,
    buildZonePayload,
    mapZoneApiError,
    parseCoordinatePair,
    zoneToForm,
    emptyWeek,
} from '../src/utils/zoneForm';

// A form that passes every rule; each test changes only what it checks.
const validForm = () => ({
    name: 'Parque Olaya',
    address: 'Carrera 7 # 20-15, Pereira',
    totalSlots: '20',
    hourlyRate: '2500',
    latitude: '4.8133',
    longitude: '-75.6961',
    open24h: true,
    schedule: emptyWeek(),
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
        const empty = { name: '', address: '  ', totalSlots: '', hourlyRate: '', latitude: '', longitude: '', open24h: null, schedule: emptyWeek() };
        const errors = validateZoneForm(empty);
        expect(Object.keys(errors).sort()).toEqual(['address', 'hourlyRate', 'latitude', 'longitude', 'name', 'open24h', 'totalSlots']);
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
        const form = zoneToForm({ name: 'Parque Olaya', address: 'Carrera 7', totalSlots: 20, hourlyRate: '2500.00', latitude: '4.8284000', longitude: '-75.6912000', open24h: true, schedule: [] });
        expect(form).toEqual({ name: 'Parque Olaya', address: 'Carrera 7', totalSlots: '20', hourlyRate: '2500', latitude: '4.8284', longitude: '-75.6912', open24h: true, schedule: emptyWeek() });
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
        const form = zoneToForm({ name: 'Centro', totalSlots: 10, hourlyRate: '2000.00', latitude: '4.8', longitude: '-75.6' });
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
