const { normalizeVehicleText, isValidVehicleText } = require('../src/utils/vehicleRules');

// The rules of the brand, the model and the color of a vehicle (#234). The
// frontend has a copy of this file with the same cases, because both sides must
// give the same answer.
describe('isValidVehicleText', () => {
    test.each([
        ['Chevrolet', 'a brand'],
        ['Spark GT', 'a model with a space'],
        ['Mazda 3', 'a model with a number'],
        ['Gris plata', 'a color with a space'],
        ['Mercedes-Benz', 'a hyphen'],
        ['Clase A 2.0', 'a period'],
        ['Citroën', 'a diaeresis'],
        ['Peña', 'the letter ñ'],
        ['Citroe\u0308n', 'an accent written as a separate mark'],
        ['  Spark   GT  ', 'spaces at the ends and several spaces between the words'],
        ['Ｍａｚｄａ　３', 'full width letters and digits'],
        ['Rojo\u00a0vino', 'a no-break space'],
        ['Тойота', 'letters of another alphabet'],
        ['3', 'only a number'],
    ])('accepts "%s" (%s)', (text) => {
        // Act
        const result = isValidVehicleText(text);

        // Assert
        expect(result).toBe(true);
    });

    test.each([
        ['Mazda <b>', 'angle brackets'],
        ['Mazda@', 'an @'],
        ['Rojo #1', 'a #'],
        ['Mazda 🚗', 'an emoji'],
        ['Mazda_3', 'an underscore'],
        ["Mazda'3", 'an apostrophe'],
        ['Mazda/3', 'a slash'],
        ['Mazda, 3', 'a comma'],
        ['...', 'only periods'],
        ['---', 'only hyphens'],
        ['. -', 'only periods, hyphens and a space'],
        ['', 'an empty text'],
        ['   ', 'only spaces'],
        ['\u200b', 'a zero width space'],
        ['Ⓜ', 'a circled letter, which NFKC would write as M'],
        ['Gris™', 'a trade mark sign, which NFKC would write as TM'],
        ['㎏', 'a square symbol, which NFKC would write as kg'],
        ['\u3164', 'only the Hangul filler, which is drawn as nothing'],
        ['Mazda\u3164', 'a Hangul filler after the brand'],
        ['\u115F', 'the Hangul choseong filler'],
        ['\uFFA0', 'the half width Hangul filler'],
    ])('rejects "%s" (%s)', (text) => {
        // Act
        const result = isValidVehicleText(text);

        // Assert
        expect(result).toBe(false);
    });

    test.each([
        [5, 'a number'],
        [null, 'null'],
        [undefined, 'a missing value'],
        [['Mazda'], 'a list'],
        [{}, 'an object'],
    ])('rejects %s, which is not text (%s)', (value) => {
        // Act
        const result = isValidVehicleText(value);

        // Assert
        expect(result).toBe(false);
    });
});

describe('normalizeVehicleText', () => {
    test('it takes off the spaces at the ends and joins the ones between the words', () => {
        // Act
        const result = normalizeVehicleText('  Land   Rover ');

        // Assert
        expect(result).toBe('Land Rover');
    });

    test('it joins an accent written apart with its letter', () => {
        // Act
        const result = normalizeVehicleText('Citroe\u0308n');

        // Assert
        expect(result).toBe('Citroën');
    });

    test('it writes full width letters and a no-break space as normal ones', () => {
        // Act
        const result = normalizeVehicleText('Ｍａｚｄａ\u00a0３');

        // Assert
        expect(result).toBe('Mazda 3');
    });

    test.each([[5], [null], [undefined]])('a value that is not text (%s) is returned as it is', (value) => {
        // Act
        const result = normalizeVehicleText(value);

        // Assert
        expect(result).toBe(value);
    });
});
