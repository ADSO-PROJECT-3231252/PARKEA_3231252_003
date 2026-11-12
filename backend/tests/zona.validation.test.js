const { validarZona, validarHorario } = require('../src/controllers/zona.controller');

// A zone that passes every rule; each test changes only the hourly rate
const validZone = {
    name: 'Zone A',
    address: 'Street 1 # 2-3',
    latitude: 4.8133,
    longitude: -75.6961,
    totalSlots: 10,
    hourlyRate: 2500,
};

// The hourly rate is DECIMAL(10, 2): a third decimal would be rounded by the
// database without a warning (HU-20, HU-21)
describe('validarZona: decimals of the hourly rate', () => {
    test.each([
        ['zero (HU-20 AC-04)', 0],
        ['a whole number', 3500],
        ['one decimal', 3500.5],
        ['two decimals', 3500.12],
        ['the largest rate the column holds', 99999999.99],
    ])('accepts %s', (_label, hourlyRate) => {
        // Act
        const error = validarZona({ ...validZone, hourlyRate });

        // Assert
        expect(error).toBeNull();
    });

    test.each([
        ['three decimals', 3500.123],
        ['more than three decimals', 3500.1234],
        ['a third decimal that floating point hides', 1.005],
        ['a tiny fraction', 0.001],
    ])('rejects %s with VALIDATION_ERROR on hourlyRate', (_label, hourlyRate) => {
        // Act
        const error = validarZona({ ...validZone, hourlyRate });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.code).toBe('VALIDATION_ERROR');
        expect(error.body.errors[0]).toMatchObject({
            path: 'hourlyRate',
            msg: 'hourlyRate must have at most 2 decimals',
        });
    });

    test('a negative rate still answers NEGATIVE_VALUE, even with many decimals', () => {
        // Act
        const error = validarZona({ ...validZone, hourlyRate: -1.234 });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.code).toBe('NEGATIVE_VALUE');
    });
});

// A zone can only be inside Colombia (HU-20 AC-05, audit of Oct 20, 2026): a
// rectangle with latitude -4.3 to 13.5 and longitude -82 to -66.8. The edges
// count as inside. The same function validates create and edit.
describe('validarZona: location inside Colombia', () => {
    test.each([
        ['the seeded zone Centro (Dosquebradas)', 4.8375, -75.6689],
        ['the seeded zone Parque Olaya', 4.8398, -75.6721],
        ['the seeded zone La Popa', 4.8291, -75.6645],
        ['the seeded zone Av. Simón Bolívar', 4.8156, -75.6934],
        ['Bogotá', 4.711, -74.0721],
        ['San Andrés island', 12.5847, -81.7006],
        ['Leticia', -4.2153, -69.9406],
        ['the south-west corner of the rectangle', -4.3, -82],
        ['the north-east corner of the rectangle', 13.5, -66.8],
        ['the south-east corner of the rectangle', -4.3, -66.8],
        ['the north-west corner of the rectangle', 13.5, -82],
    ])('accepts %s', (_label, latitude, longitude) => {
        // Act
        const error = validarZona({ ...validZone, latitude, longitude });

        // Assert
        expect(error).toBeNull();
    });

    test.each([
        ['Madrid', 40.4168, -3.7038],
        ['Miami', 25.7617, -80.1918],
        ['the point 0, 0', 0, 0],
        ['just south of the rectangle', -4.31, -70],
        ['just north of the rectangle', 13.51, -75],
        ['just west of the rectangle', 4.8, -82.01],
        ['just east of the rectangle', 4.8, -66.79],
    ])('rejects %s with COORDINATES_OUTSIDE_COLOMBIA', (_label, latitude, longitude) => {
        // Act
        const error = validarZona({ ...validZone, latitude, longitude });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.code).toBe('COORDINATES_OUTSIDE_COLOMBIA');
    });

    test.each([
        ['a latitude above 90', 95, -75],
        ['a latitude below -90', -91, -75],
        ['a longitude above 180', 4.8, 200],
        ['a longitude below -180', 4.8, -181],
        ['a latitude sent as text', '4.8', -75.7],
    ])('still answers INVALID_COORDINATES for %s', (_label, latitude, longitude) => {
        // Act
        const error = validarZona({ ...validZone, latitude, longitude });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.code).toBe('INVALID_COORDINATES');
    });
});

// HU-29 (AC-01, AC-02): the admin must choose "Abierta 24 horas" or a custom
// schedule. The rules of each day are tested in zoneHours.test.js.
describe('validarHorario: the opening hours of a zone', () => {
    test('accepts a zone open 24 hours, without a schedule', () => {
        // Act
        const error = validarHorario({ open24h: true });

        // Assert
        expect(error).toBeNull();
    });

    test('accepts a custom schedule', () => {
        // Act
        const error = validarHorario({ open24h: false, schedule: [{ day: 1, opensAt: '06:00', closesAt: '20:00' }] });

        // Assert
        expect(error).toBeNull();
    });

    test.each([
        ['missing', undefined],
        ['sent as text', 'true'],
        ['sent as a number', 1],
    ])('rejects open24h %s with VALIDATION_ERROR on open24h', (_label, open24h) => {
        // Act
        const error = validarHorario({ open24h });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body).toEqual({ code: 'VALIDATION_ERROR', errors: [{ path: 'open24h', msg: 'open24h must be true or false' }] });
    });

    test('a custom schedule without open days answers VALIDATION_ERROR on schedule', () => {
        // Act
        const error = validarHorario({ open24h: false, schedule: [] });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.errors).toEqual([{ path: 'schedule', msg: 'At least one day must be open' }]);
    });

    test('a wrong day answers VALIDATION_ERROR naming that day', () => {
        // Act
        const error = validarHorario({ open24h: false, schedule: [{ day: 5, opensAt: '20:00', closesAt: '08:00' }] });

        // Assert
        expect(error.status).toBe(400);
        expect(error.body.errors[0]).toMatchObject({ path: 'schedule', day: 5 });
    });
});
