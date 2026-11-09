import { isValidEmail, isValidPlate, isValidPhone, normalizePhone, isNotEmpty } from '../src/utils/validators';

describe('isValidEmail', () => {
    test('accepts a normal email', () => {
        // Arrange
        const email = 'laura.gomez@correo.com';
        // Act
        const result = isValidEmail(email);
        // Assert
        expect(result).toBe(true);
    });

    test.each(['', 'laura', 'laura@', 'laura@correo', '@correo.com', 'laura gomez@correo.com'])(
        'rejects "%s"',
        (email) => {
            expect(isValidEmail(email)).toBe(false);
        },
    );
});

describe('isValidPlate', () => {
    test('accepts a car and a truck plate: 3 letters and 3 numbers', () => {
        expect(isValidPlate('ABC123', 'car')).toBe(true);
        expect(isValidPlate('ABC123', 'truck')).toBe(true);
    });

    test('accepts a motorcycle plate: 3 letters, 2 numbers and a letter', () => {
        expect(isValidPlate('ABC12D', 'motorcycle')).toBe(true);
    });

    test('accepts lowercase letters, because the plate is compared in uppercase', () => {
        expect(isValidPlate('abc123', 'car')).toBe(true);
    });

    test('rejects a motorcycle plate for a car and a car plate for a motorcycle', () => {
        expect(isValidPlate('ABC12D', 'car')).toBe(false);
        expect(isValidPlate('ABC123', 'motorcycle')).toBe(false);
    });

    test.each(['', 'AB123', 'ABC1234', 'ABC-123', '123ABC'])('rejects "%s" for a car', (plate) => {
        expect(isValidPlate(plate, 'car')).toBe(false);
    });

    test('rejects an unknown vehicle type', () => {
        expect(isValidPlate('ABC123', 'bus')).toBe(false);
    });
});

describe('normalizePhone', () => {
    test('removes spaces, dashes, parentheses and dots', () => {
        expect(normalizePhone('(300) 123-45.67')).toBe('3001234567');
    });

    test('returns an empty text for null or undefined', () => {
        expect(normalizePhone(null)).toBe('');
        expect(normalizePhone(undefined)).toBe('');
    });
});

describe('isValidPhone', () => {
    test('accepts 10 digits, also written with spaces or dashes', () => {
        expect(isValidPhone('3001234567')).toBe(true);
        expect(isValidPhone('300 123 4567')).toBe(true);
        expect(isValidPhone('300-123-4567')).toBe(true);
    });

    test.each(['', '300123456', '30012345678', '300123456a', '+573001234567'])('rejects "%s"', (phone) => {
        expect(isValidPhone(phone)).toBe(false);
    });
});

describe('isNotEmpty', () => {
    test('accepts text and numbers, including 0', () => {
        expect(isNotEmpty('a')).toBe(true);
        expect(isNotEmpty(0)).toBe(true);
    });

    test.each([undefined, null, '', '   '])('rejects %p', (value) => {
        expect(isNotEmpty(value)).toBe(false);
    });
});
