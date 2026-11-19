import { normalizeVehicleText, isValidVehicleText, VEHICLE_TEXT_RULE_MESSAGE } from '../src/utils/vehicleRules';

// The rules of the brand, the model and the color of a vehicle (#234). The
// backend has a copy of this file with the same cases, because both sides must
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
        ['Mazda ①', 'a circled number, which NFKC would write as 1'],
        ['Mazda²', 'a superscript number, which NFKC would write as 2'],
        ['Ⅲ Serie', 'a Roman numeral, which NFKC would write as III'],
        ['Mazdaᵀᴹ', 'small letters, which NFKC would write as TM'],
        ['Mazdaʼ3', 'a modifier letter that looks like an apostrophe'],
        ['3ª', 'an ordinal indicator, which NFKC would write as a'],
        ['2º', 'a masculine ordinal indicator, which NFKC would write as o'],
        ['㎏', 'a square symbol, which NFKC would write as kg'],
        ['\u3164', 'only the Hangul filler, which is drawn as nothing'],
        ['Mazda\u3164', 'a Hangul filler after the brand'],
        ['\u115F', 'the Hangul choseong filler'],
        ['\uFFA0', 'the half width Hangul filler'],
        ['A\u20DD', 'a letter inside a combining circle, which looks like Ⓐ'],
        ['Maz\u0334\u0322da', 'marks piled on a letter, which do not join it'],
        ['Spark\u1680GT', 'the Ogham space mark, a space that is drawn as a line'],
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

describe('VEHICLE_TEXT_RULE_MESSAGE', () => {
    test('there is one message for the brand, the model and the color, each one names its field', () => {
        // Assert
        expect(Object.keys(VEHICLE_TEXT_RULE_MESSAGE)).toEqual(['brand', 'model', 'color']);
        expect(VEHICLE_TEXT_RULE_MESSAGE.brand).toMatch(/^La marca/);
        expect(VEHICLE_TEXT_RULE_MESSAGE.model).toMatch(/^El modelo/);
        expect(VEHICLE_TEXT_RULE_MESSAGE.color).toMatch(/^El color/);
    });
});
