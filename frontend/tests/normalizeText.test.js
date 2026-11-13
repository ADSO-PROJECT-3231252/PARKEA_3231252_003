import { normalizeText } from '../src/utils/normalizeText';

describe('normalizeText', () => {
    test.each(['simon', 'SIMON', 'Simón', 'SIMÓN'])('"%s" becomes "simon"', (text) => {
        // Act
        const result = normalizeText(text);

        // Assert
        expect(result).toBe('simon');
    });

    test('an accent written as a separate mark is removed too', () => {
        // Act: "o" followed by the combining acute accent, as some keyboards send it
        const result = normalizeText('Simo\u0301n');

        // Assert
        expect(result).toBe('simon');
    });

    test('a search for "simon" finds "Av. Simón Bolívar"', () => {
        // Act
        const found = normalizeText('Av. Simón Bolívar').includes(normalizeText('simon'));

        // Assert
        expect(found).toBe(true);
    });

    test('removes the Spanish accents, the diaeresis and the tilde of ñ', () => {
        // Act
        const result = normalizeText('áéíóú ÁÉÍÓÚ üÜ ñÑ');

        // Assert
        expect(result).toBe('aeiou aeiou uu nn');
    });

    test('keeps text without accents, numbers and symbols as they are', () => {
        // Act
        const result = normalizeText('Zona 5 - Centro #2');

        // Assert
        expect(result).toBe('zona 5 - centro #2');
    });

    test.each([null, undefined])('%s becomes an empty text', (value) => {
        // Act
        const result = normalizeText(value);

        // Assert
        expect(result).toBe('');
    });
});
