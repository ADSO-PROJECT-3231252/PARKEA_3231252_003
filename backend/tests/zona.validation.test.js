const { validarZona } = require('../src/controllers/zona.controller');

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
