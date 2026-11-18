const { normalizeName, isValidName, isValidPhone } = require('../src/utils/personRules');

// The rules of the full name and the phone (#312). The frontend has a copy of
// this file with the same cases, because both sides must give the same answer.
describe('isValidName', () => {
    test.each([
        ["Ana María Pérez-O'Neil", 'the example of the card'],
        ['Ana María Pérez-O’Neil', 'a curly apostrophe, as a phone keyboard writes it'],
        ['José', 'an accent'],
        ['Ñandú Güemes', 'the letter ñ and a diaeresis'],
        ['Jo', 'the shortest name, 2 letters'],
        ['Simo\u0301n', 'an accent written as a separate mark'],
        ['  Ana  ', 'spaces at the start and at the end'],
        ['Ana    María', 'several spaces between the words'],
        ['Ana\u00a0María', 'a no-break space'],
        ['Ａｎａ', 'full width letters'],
        ['Ана Иванова', 'letters of another alphabet'],
        ['A'.repeat(70), 'the longest name, 70 letters'],
        [`  ${'A'.repeat(70)}  `, '70 letters with spaces at the ends'],
        ['A\u0332\u0332na', 'two marks written apart on the first letter'],
    ])('accepts "%s" (%s)', (name) => {
        // Act
        const result = isValidName(name);

        // Assert
        expect(result).toBe(true);
    });

    test.each([
        ['12345 @@@', 'the example of the card'],
        ['Ana1', 'a digit'],
        ['1Ana', 'it starts with a digit'],
        ['Ana_Pérez', 'an underscore'],
        ['Ana@Pérez', 'a symbol'],
        ['<script>', 'a tag'],
        ['Ana 😀', 'an emoji'],
        ['Ana\tMaría', 'a tab'],
        ['Ana\u200bMaría', 'an invisible space'],
        ['A', 'only 1 letter'],
        ['', 'an empty text'],
        ['   ', 'only spaces'],
        ['-Ana', 'it starts with a hyphen'],
        ["'Ana", 'it starts with an apostrophe'],
        ['Ana-', 'it ends with a hyphen'],
        ['Ana--María', 'two hyphens together'],
        ['Ana - María', 'a hyphen between spaces'],
        ['--', 'only hyphens'],
        ['Ana\u0332\u0332\u0332', 'three marks on one letter that do not join it'],
        ['A\u0332\u0332\u0332na', 'three marks on the first letter'],
        ['A'.repeat(71), '71 letters'],
        ['\u3164\u3164', 'only Hangul fillers, drawn as nothing'],
        ['Ana\u3164', 'a Hangul filler after the name'],
    ])('rejects "%s" (%s)', (name) => {
        // Act
        const result = isValidName(name);

        // Assert
        expect(result).toBe(false);
    });

    test.each([[null], [undefined], [12345], [{}], [['Ana']]])('rejects a value that is not a text: %p', (value) => {
        // Act
        const result = isValidName(value);

        // Assert
        expect(result).toBe(false);
    });
});

describe('normalizeName', () => {
    test.each([
        ['  Ana   María  ', 'Ana María', 'the spaces at the ends go away and several become one'],
        ['Simo\u0301n', 'Simón', 'an accent written apart joins its letter'],
        ['𝓐𝓷𝓪', 'Ana', 'letters of a special font become normal letters'],
        ['Ａｎａ', 'Ana', 'full width letters become normal letters'],
        ['Ana\u00a0María', 'Ana María', 'a no-break space becomes a normal space'],
        ["Ana Pérez-O'Neil", "Ana Pérez-O'Neil", 'a valid name stays the same'],
    ])('turns "%s" into "%s" (%s)', (value, expected) => {
        // Act
        const result = normalizeName(value);

        // Assert
        expect(result).toBe(expected);
    });

    test.each([[null], [undefined], [12345]])('returns a value that is not a text as it is: %p', (value) => {
        // Act
        const result = normalizeName(value);

        // Assert
        expect(result).toBe(value);
    });
});

describe('isValidPhone', () => {
    test.each([
        ['3001234567', 'the example of the card'],
        ['3999999999', 'the last number that starts with 3'],
        [' 3001234567 ', 'spaces at the start and at the end'],
    ])('accepts "%s" (%s)', (phone) => {
        // Act
        const result = isValidPhone(phone);

        // Assert
        expect(result).toBe(true);
    });

    test.each([
        ['0000000000', 'the example of the card'],
        ['2001234567', 'it does not start with 3'],
        ['300123456', '9 digits'],
        ['30012345678', '11 digits'],
        ['300 123 4567', 'spaces inside'],
        ['+573001234567', 'the country code'],
        ['300123456a', 'a letter'],
        ['٣٠٠١٢٣٤٥٦٧', 'digits of another alphabet'],
        ['３００１２３４５６７', 'full width digits'],
        ['', 'an empty text'],
    ])('rejects "%s" (%s)', (phone) => {
        // Act
        const result = isValidPhone(phone);

        // Assert
        expect(result).toBe(false);
    });

    test.each([[null], [undefined], [3001234567], [{}]])('rejects a value that is not a text: %p', (value) => {
        // Act
        const result = isValidPhone(value);

        // Assert
        expect(result).toBe(false);
    });
});
