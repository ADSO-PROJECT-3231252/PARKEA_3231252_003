import { isValidEmail, isValidPlate, normalizePhone, isNotEmpty, isValidPassword } from '../src/utils/validators';

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

describe('isNotEmpty', () => {
    test('accepts text and numbers, including 0', () => {
        expect(isNotEmpty('a')).toBe(true);
        expect(isNotEmpty(0)).toBe(true);
    });

    test.each([undefined, null, '', '   '])('rejects %p', (value) => {
        expect(isNotEmpty(value)).toBe(false);
    });
});

// #313: the same rule as the backend (auth.validator.js), which counts the
// characters with isLength of express-validator
describe('isValidPassword', () => {
    test.each([
        ['A1!aaaaa', 'exactly 8 characters'],
        ['A1!' + 'a'.repeat(17), 'exactly 20 characters'],
        ['A1!aaaa😀', '8 characters, one of them an emoji'],
        ['A1!' + 'a'.repeat(16) + '😀', '20 characters, one of them an emoji'],
        ['Ab1!' + '😀'.repeat(16), '20 characters, 16 of them emojis'],
        ['A1!aaaa❤\uFE0F', '8 characters, with an emoji and its variation selector'],
        ['A1\u2028aaaaa', 'a line separator (U+2028) as the special character'],
        ['A1\u2029aaaaa', 'a paragraph separator (U+2029) as the special character'],
    ])('accepts %j (%s)', (password) => {
        expect(isValidPassword(password)).toBe(true);
    });

    test.each([
        ['A1!aaaa', '7 characters'],
        ['A1!' + 'a'.repeat(18), '21 characters'],
        ['A1!aaa😀', '7 characters, one of them an emoji'],
        ['A1!' + 'a'.repeat(17) + '😀', '21 characters, one of them an emoji'],
        ['A1!aaa❤\uFE0F', '7 characters, with an emoji and its variation selector'],
        ['a1!aaaaa', 'no uppercase letter'],
        ['Aa!aaaaa', 'no number'],
        ['A1aaaaaa', 'no special character'],
        ['', 'an empty text'],
    ])('rejects %j (%s)', (password) => {
        expect(isValidPassword(password)).toBe(false);
    });

    test.each([undefined, null, 12345678, ['A1!aaaaa']])('rejects %p, which is not text', (value) => {
        expect(isValidPassword(value)).toBe(false);
    });
});
