import { COLOMBIA_TIME_ZONE, endsAnotherDay, formatDate, formatStay, formatStayHours, formatTime } from '../src/utils/format';

// #357: the home shows the dates of a stay that ends on another day, in
// Colombia time (UTC-5), whatever the time zone of the computer. The stays
// are fixed instants (UTC), so each test checks the same text in any zone.
// What a person reads: the non-breaking spaces as spaces
const read = (text) => text.replace(/\s/g, ' ');

// Two stays that cross midnight only on one side:
// - 04:30 to 05:30 UTC on the 17th is 11:30 p. m. of the 16th to 12:30 a. m.
//   of the 17th in Colombia (UTC keeps it on one day)
// - 23:00 UTC of the 16th to 01:00 UTC of the 17th is 6:00 to 8:00 p. m. of
//   the 16th in Colombia (only UTC crosses midnight)
const ONLY_IN_COLOMBIA = ['2026-11-17T04:30:00.000Z', '2026-11-17T05:30:00.000Z'];
const ONLY_IN_UTC = ['2026-11-16T23:00:00.000Z', '2026-11-17T01:00:00.000Z'];
// 11:00 p. m. of December 31 to 12:30 a. m. of January 1 in Colombia
const NEW_YEAR = ['2027-01-01T04:00:00.000Z', '2027-01-01T05:30:00.000Z'];

describe('A stay that ends on another day, in Colombia time (#357)', () => {
    test('the dates and times can be asked in Colombia time, and without it they stay in the browser time', () => {
        // Act + Assert: the entry of ONLY_IN_COLOMBIA
        expect(read(formatDate(ONLY_IN_COLOMBIA[0], COLOMBIA_TIME_ZONE))).toBe('16 de nov de 2026');
        expect(read(formatTime(ONLY_IN_COLOMBIA[0], COLOMBIA_TIME_ZONE))).toBe('11:30 p. m.');
        expect(formatDate(ONLY_IN_COLOMBIA[0])).toBe(new Date(ONLY_IN_COLOMBIA[0]).toLocaleDateString('es-CO', { day: '2-digit', month: 'short', year: 'numeric' }));
    });

    test.each([
        ['on the same day', false, '2026-11-16T18:08:00.000Z', '2026-11-16T20:00:00.000Z'],
        ['until one minute before midnight', false, '2026-11-17T03:00:00.000Z', '2026-11-17T04:59:00.000Z'],
        ['until midnight', true, '2026-11-17T03:00:00.000Z', '2026-11-17T05:00:00.000Z'],
        ['across midnight only in Colombia', true, ...ONLY_IN_COLOMBIA],
        ['across midnight only in UTC', false, ...ONLY_IN_UTC],
        ['into the next year', true, ...NEW_YEAR],
    ])('a stay %s ends on another day: %s', (_case, expected, start, end) => {
        expect(endsAnotherDay(start, end)).toBe(expected);
    });

    test.each([
        ['on one day', '01:08 p. m. – 03:00 p. m.', '2026-11-16T18:08:00.000Z', '2026-11-16T20:00:00.000Z'],
        ['across midnight only in Colombia', '11:30 p. m. – 17 de nov, 12:30 a. m.', ...ONLY_IN_COLOMBIA],
        ['across midnight only in UTC', '06:00 p. m. – 08:00 p. m.', ...ONLY_IN_UTC],
        ['into the next year', '11:00 p. m. – 01 de ene de 2027, 12:30 a. m.', ...NEW_YEAR],
    ])('the hours of the card %s read "%s"', (_case, expected, start, end) => {
        expect(read(formatStayHours(start, end))).toBe(expected);
    });

    test.each([
        ['on one day', '16 de nov de 2026 · 01:08 p. m. – 03:00 p. m.', '2026-11-16T18:08:00.000Z', '2026-11-16T20:00:00.000Z'],
        ['across midnight only in Colombia', '16 de nov, 11:30 p. m. – 17 de nov, 12:30 a. m.', ...ONLY_IN_COLOMBIA],
        ['across midnight only in UTC', '16 de nov de 2026 · 06:00 p. m. – 08:00 p. m.', ...ONLY_IN_UTC],
        ['into the next year', '31 de dic de 2026, 11:00 p. m. – 01 de ene de 2027, 12:30 a. m.', ...NEW_YEAR],
    ])('the line of the history %s reads "%s"', (_case, expected, start, end) => {
        expect(read(formatStay(start, end))).toBe(expected);
    });

    test('a line can only break after the dash, the comma or the dot between the parts, or before a year', () => {
        // Arrange: the pieces between the normal spaces; inside each piece
        // the spaces do not break ("·" stands for them here)
        const pieces = (text) => text.split(' ').map((piece) => piece.replace(/\u00a0/g, '·'));

        // Act + Assert: no time ("01:08 p. m.") and no date ("17 de nov") is
        // cut, and a year ("de 2026") only goes to the next line whole
        expect(pieces(formatStay(...ONLY_IN_COLOMBIA))).toEqual(['16·de·nov,', '11:30·p.·m.·–', '17·de·nov,', '12:30·a.·m.']);
        expect(pieces(formatStay(...ONLY_IN_UTC))).toEqual(['16·de·nov', 'de·2026', '·', '06:00·p.·m.·–', '08:00·p.·m.']);
        expect(pieces(formatStayHours(...ONLY_IN_COLOMBIA))).toEqual(['11:30·p.·m.·–', '17·de·nov,', '12:30·a.·m.']);
        expect(pieces(formatStay(...NEW_YEAR))).toEqual(['31·de·dic', 'de·2026,', '11:00·p.·m.·–', '01·de·ene', 'de·2027,', '12:30·a.·m.']);
    });
});
