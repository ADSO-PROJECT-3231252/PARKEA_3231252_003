import {
    ZONE_AXIS_LABEL_WIDTH,
    ZONE_AXIS_MAX_CHARS,
    ZONE_CHART_ROW_HEIGHT,
    ZONE_TOOLTIP_STYLE,
    fitZoneName,
    shortZoneName,
    zoneChartHeight,
    zoneTooltipPosition,
} from '../src/utils/zoneChart';

// #309: the "Reservas por zona" chart of the admin panel
describe('zoneChartHeight', () => {
    test.each([
        [0, 260],
        [1, 260],
        [6, 260],
        [7, 292],
        [20, 760],
    ])('with %i zones the chart is %i px high', (zoneCount, height) => {
        expect(zoneChartHeight(zoneCount)).toBe(height);
    });

    test('every zone more adds one row', () => {
        expect(zoneChartHeight(11) - zoneChartHeight(10)).toBe(ZONE_CHART_ROW_HEIGHT);
    });
});

describe('shortZoneName', () => {
    test.each([
        ['Centro', 'Centro'],
        ['Zona Industrial', 'Zona Industrial'],
        ['A'.repeat(ZONE_AXIS_MAX_CHARS), 'A'.repeat(ZONE_AXIS_MAX_CHARS)],
    ])('a name that fits stays as it is: "%s"', (name, shown) => {
        expect(shortZoneName(name)).toBe(shown);
    });

    test.each([
        ['A'.repeat(ZONE_AXIS_MAX_CHARS + 1), `${'A'.repeat(ZONE_AXIS_MAX_CHARS - 1)}…`],
        ['Parqueadero Público Municipal', 'Parqueadero Púb…'],
        ['Centro Comercial Unicentro', 'Centro Comercia…'],
    ])('a longer name is cut with "…" and keeps 16 letters at most: "%s"', (name, shown) => {
        // Act
        const result = shortZoneName(name);

        // Assert
        expect(result).toBe(shown);
        expect(Array.from(result)).toHaveLength(ZONE_AXIS_MAX_CHARS);
    });

    test('it can cut at fewer letters', () => {
        expect(shortZoneName('Parqueadero Público Municipal', 13)).toBe('Parqueadero…');
        expect(shortZoneName('Centro', 13)).toBe('Centro');
    });

    test('a space just before the cut is not left before "…"', () => {
        // Arrange: the 15th character is a space
        const name = 'Avenida Ferroc Sur Oriente';
        expect(Array.from(name)[ZONE_AXIS_MAX_CHARS - 2]).toBe(' ');

        // Act and assert
        expect(shortZoneName(name)).toBe('Avenida Ferroc…');
    });

    test.each([
        ['a letter written with two code units', '𝓐'.repeat(20), `${'𝓐'.repeat(15)}…`],
        ['an accent written as a second character', 'Pe\u0301rez '.repeat(4), 'Pe\u0301rez Pe\u0301rez Pe\u0301r…'],
        ['a flag (two characters)', '🇨🇴'.repeat(20), `${'🇨🇴'.repeat(15)}…`],
        ['an emoji joined from several', '👨‍👩‍👧'.repeat(20), `${'👨‍👩‍👧'.repeat(15)}…`],
    ])('%s is never split in half', (_label, name, shown) => {
        expect(shortZoneName(name)).toBe(shown);
    });

    test('a missing name shows nothing instead of breaking the chart', () => {
        expect(shortZoneName(undefined)).toBe('');
        expect(shortZoneName(null)).toBe('');
    });
});

// #309: a letter that is more than one character, right at the cut of 16
// letters (14 "A", the letter, and the rest of the name). An older browser has
// no Intl.Segmenter, so the module is loaded again without it.
describe('the cut never splits a letter, with and without Intl.Segmenter', () => {
    const before = 'A'.repeat(14);
    const CUT_CASES = [
        ['an accent written as a second character', `${before}e\u0301 Centro`, `${before}e\u0301…`],
        ['a flag (two characters)', `${before}🇨🇴 Centro`, `${before}🇨🇴…`],
        ['two flags in a row, which are two letters', `${before}🇨🇴🇨🇴 Centro`, `${before}🇨🇴…`],
        ['a flag written with tags', `${before}🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F} Centro`, `${before}🏴\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}…`],
        ['an emoji joined from several', `${before}👨‍👩‍👧 Centro`, `${before}👨‍👩‍👧…`],
        ['an emoji with a skin tone', `${before}👍🏽 Centro`, `${before}👍🏽…`],
        ['a letter written with two code units', `${before}𝓐 Centro`, `${before}𝓐…`],
    ];

    let shortZoneNameWithoutSegmenter;

    beforeAll(async () => {
        const { Segmenter } = Intl;
        delete Intl.Segmenter;
        try {
            await jest.isolateModulesAsync(async () => {
                ({ shortZoneName: shortZoneNameWithoutSegmenter } = await import('../src/utils/zoneChart'));
            });
        } finally {
            Intl.Segmenter = Segmenter;
        }
    });

    test.each(CUT_CASES)('with Intl.Segmenter: %s', (_label, name, shown) => {
        expect(shortZoneName(name)).toBe(shown);
    });

    test.each(CUT_CASES)('without Intl.Segmenter (an older browser): %s', (_label, name, shown) => {
        expect(shortZoneNameWithoutSegmenter(name)).toBe(shown);
    });

    test('without Intl.Segmenter, a name that fits stays as it is', () => {
        expect(shortZoneNameWithoutSegmenter('Pe\u0301rez 🇨🇴')).toBe('Pe\u0301rez 🇨🇴');
        expect(shortZoneNameWithoutSegmenter('A'.repeat(16))).toBe('A'.repeat(16));
        // A mark with no letter before it is a letter of its own
        expect(shortZoneNameWithoutSegmenter('\u0301Centro')).toBe('\u0301Centro');
    });
});

describe('fitZoneName', () => {
    // Each letter as wide as the test says, "…" included
    const lettersOf = (px) => (text) => Array.from(text).length * px;

    test('the names in the axis have 102 px: the 110 of the axis less its small line and gap', () => {
        expect(ZONE_AXIS_LABEL_WIDTH).toBe(102);
    });

    test('a name that fits with 16 letters stays as shortZoneName leaves it', () => {
        // 16 letters of 6 px = 96 px
        expect(fitZoneName('Parqueadero Público Municipal', lettersOf(6))).toBe('Parqueadero Púb…');
        expect(fitZoneName('Centro', lettersOf(6))).toBe('Centro');
    });

    test('wider letters are cut more, until they fit in the 102 px', () => {
        // Letters of 8 px: 12 letters (96 px) fit, 13 (104 px) do not
        expect(fitZoneName('PARQUEADERO MUNICIPAL DEL CENTRO', lettersOf(8))).toBe('PARQUEADERO…');
    });

    test('a name of 16 letters or fewer that does not fit is cut too', () => {
        expect(fitZoneName('W'.repeat(16), lettersOf(10))).toBe(`${'W'.repeat(9)}…`);
    });

    test('a name exactly as wide as the space fits', () => {
        // 17 px * 6 letters = 102 px
        expect(fitZoneName('Centro', lettersOf(17))).toBe('Centro');
    });

    test('it never goes below two letters ("A…")', () => {
        expect(fitZoneName('Parqueadero', lettersOf(200))).toBe('P…');
    });

    test('the space can be another one', () => {
        expect(fitZoneName('Parqueadero Público', lettersOf(10), 60)).toBe('Parqu…');
    });
});

describe('The tooltip of a bar', () => {
    test('the complete name wraps inside 200 px instead of going out of a phone screen', () => {
        expect(ZONE_TOOLTIP_STYLE).toEqual({ maxWidth: 200, whiteSpace: 'normal', overflowWrap: 'anywhere' });
    });

    test.each([
        ['before the chart is measured', 0, undefined],
        ['a chart of a 320 px screen', 220, { x: 0 }],
        ['the widest chart where it does not fit after the names', 343, { x: 0 }],
        ['the narrowest chart where it fits after the names', 344, undefined],
        ['the chart of a computer', 640, undefined],
    ])('%s (%i px): %o', (_label, width, position) => {
        expect(zoneTooltipPosition(width)).toEqual(position);
    });
});
