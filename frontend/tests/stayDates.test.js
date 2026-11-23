import { endsAnotherDay, formatDate, formatStay, formatStayHours, formatTime } from '../src/utils/format';

// #357: the home shows the dates of a stay that ends on another day. The
// dates are built in the local time of the computer, the same time the screen
// shows, so the tests do not depend on its time zone.
const local = (year, month, day, hours, minutes = 0) => new Date(year, month - 1, day, hours, minutes).toISOString();

// What the helpers write: a time or a date never splits across two lines
// (its spaces are non-breaking), only a date may break before its year, and
// the dash stays with the entry
const NBSP = '\u00a0';
const together = (text) => text.replace(/ /g, NBSP);
const time = (iso) => together(formatTime(iso));
const dayAndMonth = (iso) => together(formatDate(iso).replace(/ de \d{4}$/, ''));
const withYear = (iso) => `${dayAndMonth(iso)} ${together(`de ${new Date(iso).getFullYear()}`)}`;
const dash = `${NBSP}– `;

describe('A stay that ends on another day (#357)', () => {
    test.each([
        ['on the same day', false, local(2026, 11, 16, 13, 8), local(2026, 11, 16, 15, 0)],
        ['until one minute before midnight', false, local(2026, 11, 16, 22, 0), local(2026, 11, 16, 23, 59)],
        ['until midnight', true, local(2026, 11, 16, 22, 0), local(2026, 11, 17, 0, 0)],
        ['into the next morning', true, local(2026, 11, 16, 13, 8), local(2026, 11, 17, 11, 18)],
        ['into the next year', true, local(2026, 12, 31, 23, 0), local(2027, 1, 1, 1, 0)],
    ])('a stay %s ends on another day: %s', (_case, expected, start, end) => {
        expect(endsAnotherDay(start, end)).toBe(expected);
    });

    test('on one day, the hours of the card look as before', () => {
        // Arrange
        const start = local(2026, 11, 16, 13, 8);
        const end = local(2026, 11, 16, 15, 0);

        // Act + Assert
        expect(formatStayHours(start, end)).toBe(`${time(start)}${dash}${time(end)}`);
    });

    test('on one day, the line of the history keeps its date and both times', () => {
        const start = local(2026, 11, 16, 13, 8);
        const end = local(2026, 11, 16, 15, 0);

        expect(formatStay(start, end)).toBe(`${withYear(start)} · ${time(start)}${dash}${time(end)}`);
    });

    test('crossing midnight, the hours of the card say the day of the exit', () => {
        // Arrange: from 1:08 p. m. to 11:18 a. m. of the next day
        const start = local(2026, 11, 16, 13, 8);
        const end = local(2026, 11, 17, 11, 18);

        // Act
        const text = formatStayHours(start, end);

        // Assert: "01:08 p. m. – 17 de nov, 11:18 a. m."
        expect(text).toBe(`${time(start)}${dash}${dayAndMonth(end)}, ${time(end)}`);
        expect(text.replace(/\s/g, ' ')).toBe(`${formatTime(start)} – ${dayAndMonth(end).replace(/\s/g, ' ')}, ${formatTime(end)}`);
    });

    test('the text reads as in the card: "30 de nov, 10:00 p. m. – 01 de dic, 01:30 a. m."', () => {
        // Arrange: the day keeps its two digits, as in formatDate
        const start = local(2026, 11, 30, 22, 0);
        const end = local(2026, 12, 1, 1, 30);

        // Act + Assert
        const read = (text) => text.replace(/\s/g, ' ');
        expect(read(formatStay(start, end))).toBe('30 de nov, 10:00 p. m. – 01 de dic, 01:30 a. m.');
        expect(read(formatStayHours(start, end))).toBe('10:00 p. m. – 01 de dic, 01:30 a. m.');
        expect(read(formatStay(start, local(2026, 11, 30, 23, 0)))).toBe('30 de nov de 2026 · 10:00 p. m. – 11:00 p. m.');
    });

    test('crossing midnight, the line of the history gives each time its day', () => {
        const start = local(2026, 11, 16, 13, 8);
        const end = local(2026, 11, 17, 11, 18);

        // "16 de nov, 01:08 p. m. – 17 de nov, 11:18 a. m."
        expect(formatStay(start, end)).toBe(`${dayAndMonth(start)}, ${time(start)}${dash}${dayAndMonth(end)}, ${time(end)}`);
    });

    test('into the next year, both days say their year', () => {
        // Arrange
        const start = local(2026, 12, 31, 23, 0);
        const end = local(2027, 1, 1, 1, 0);

        // Act + Assert
        expect(formatStayHours(start, end)).toBe(`${time(start)}${dash}${withYear(end)}, ${time(end)}`);
        expect(formatStay(start, end)).toBe(`${withYear(start)}, ${time(start)}${dash}${withYear(end)}, ${time(end)}`);
        // The text is the one of formatDate: "31 de dic de 2026"
        expect(formatStay(start, end).replace(/\s/g, ' ')).toBe(`${formatDate(start)}, ${formatTime(start)} – ${formatDate(end)}, ${formatTime(end)}`);
    });

    test('a line can only break after the dash, the comma or the dot between the parts, or before a year', () => {
        // Arrange
        const start = local(2026, 11, 16, 13, 8);
        const nextDay = local(2026, 11, 17, 11, 18);
        const sameDay = local(2026, 11, 16, 15, 0);
        const newYearStart = local(2026, 12, 31, 23, 0);
        const newYearEnd = local(2027, 1, 1, 1, 0);

        // Act: the pieces between the normal spaces
        const pieces = (text) => text.split(' ');

        // Assert: no time ("01:08 p. m.") and no date ("17 de nov") is cut, and
        // a year ("de 2026") only goes to the next line whole
        expect(pieces(formatStay(start, nextDay))).toEqual([`${dayAndMonth(start)},`, `${time(start)}${NBSP}–`, `${dayAndMonth(nextDay)},`, time(nextDay)]);
        expect(pieces(formatStay(start, sameDay))).toEqual([dayAndMonth(start), `de${NBSP}2026`, '·', `${time(start)}${NBSP}–`, time(sameDay)]);
        expect(pieces(formatStayHours(start, nextDay))).toEqual([`${time(start)}${NBSP}–`, `${dayAndMonth(nextDay)},`, time(nextDay)]);
        expect(pieces(formatStay(newYearStart, newYearEnd))).toEqual([
            dayAndMonth(newYearStart), `de${NBSP}2026,`, `${time(newYearStart)}${NBSP}–`, dayAndMonth(newYearEnd), `de${NBSP}2027,`, time(newYearEnd),
        ]);
    });
});
