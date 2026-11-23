const { STAY_MIN_MS, STAY_MAX_MS, MAX_ADVANCE_MS, checkStayTimes, outsideHoursError } = require('../src/utils/stayRequest');

// HU-14 and #375: the entry and exit times of a stay, checked in one place
// for POST /reservations and GET /zones/:id/availability. "Now" is Monday
// 2026-11-16 at 8:00 a. m. in Colombia (13:00 UTC).
const NOW = new Date('2026-11-16T13:00:00Z');
const MINUTE = 60 * 1000;
const HOUR = 60 * MINUTE;
const at = (ms) => new Date(NOW.getTime() + ms).toISOString();

const codeOf = (result) => result.error?.body.code ?? 'no error';

describe('checkStayTimes (HU-14, #375)', () => {
    test('the limits are 30 minutes to 24 hours, up to 48 hours ahead', () => {
        expect([STAY_MIN_MS, STAY_MAX_MS, MAX_ADVANCE_MS]).toEqual([30 * MINUTE, 24 * HOUR, 48 * HOUR]);
    });

    test('a valid stay gives its entry and exit as dates', () => {
        // Act
        const result = checkStayTimes({ startTime: at(HOUR), endTime: at(3 * HOUR) }, NOW);

        // Assert
        expect(result).toEqual({ start: new Date(at(HOUR)), end: new Date(at(3 * HOUR)) });
    });

    test('an open stay keeps entry + 24 hours as its provisional exit, and needs no endTime', () => {
        // Act
        const result = checkStayTimes({ startTime: at(HOUR), openEnded: true }, NOW);

        // Assert
        expect(result).toEqual({ start: new Date(at(HOUR)), end: new Date(at(HOUR + STAY_MAX_MS)) });
    });

    test.each([
        ['without startTime', { endTime: at(2 * HOUR) }, 'startTime and endTime are required'],
        ['without endTime', { startTime: at(HOUR) }, 'startTime and endTime are required'],
        ['with empty texts', { startTime: '', endTime: '' }, 'startTime and endTime are required'],
        ['an open stay without startTime', { openEnded: true }, 'startTime is required'],
    ])('%s it answers 400 MISSING_REQUIRED_FIELDS: "%s"', (_case, times, message) => {
        expect(checkStayTimes(times, NOW)).toEqual({ error: { status: 400, body: { code: 'MISSING_REQUIRED_FIELDS', message } } });
    });

    test.each([
        ['an entry that is not a date', { startTime: 'abc', endTime: at(2 * HOUR) }],
        ['an exit that is not a date', { startTime: at(HOUR), endTime: 'mañana' }],
        ['an open stay whose entry is not a date', { startTime: 'abc', openEnded: true }],
    ])('%s answers INVALID_DATE', (_case, times) => {
        expect(codeOf(checkStayTimes(times, NOW))).toBe('INVALID_DATE');
    });

    test.each([
        ['now', 0],
        ['a minute ago', -MINUTE],
    ])('an entry %s answers START_TIME_IN_PAST', (_case, ms) => {
        expect(codeOf(checkStayTimes({ startTime: at(ms), endTime: at(ms + HOUR) }, NOW))).toBe('START_TIME_IN_PAST');
    });

    test('an entry up to 48 hours ahead is accepted, and one minute later answers RESERVATION_TOO_FAR_AHEAD', () => {
        expect(codeOf(checkStayTimes({ startTime: at(48 * HOUR), endTime: at(49 * HOUR) }, NOW))).toBe('no error');
        expect(codeOf(checkStayTimes({ startTime: at(48 * HOUR + MINUTE), endTime: at(49 * HOUR) }, NOW))).toBe('RESERVATION_TOO_FAR_AHEAD');
    });

    test.each([
        ['at the entry', HOUR],
        ['before the entry', 30 * MINUTE],
    ])('an exit %s answers END_BEFORE_START', (_case, ms) => {
        expect(codeOf(checkStayTimes({ startTime: at(HOUR), endTime: at(ms) }, NOW))).toBe('END_BEFORE_START');
    });

    test.each([
        ['29 minutes', 'INVALID_DURATION', 29 * MINUTE],
        ['30 minutes', 'no error', 30 * MINUTE],
        ['24 hours', 'no error', 24 * HOUR],
        ['24 hours and a minute', 'INVALID_DURATION', 24 * HOUR + MINUTE],
    ])('a stay of %s gives %s', (_case, code, duration) => {
        expect(codeOf(checkStayTimes({ startTime: at(HOUR), endTime: at(HOUR + duration) }, NOW))).toBe(code);
    });

    test('an open stay ignores the endTime it may carry', () => {
        expect(checkStayTimes({ startTime: at(HOUR), endTime: at(HOUR + MINUTE), openEnded: true }, NOW)).toEqual({
            start: new Date(at(HOUR)),
            end: new Date(at(HOUR + STAY_MAX_MS)),
        });
    });

    test('without a "now" it uses the current time', () => {
        expect(codeOf(checkStayTimes({ startTime: '2020-01-01T10:00:00Z', endTime: '2020-01-01T12:00:00Z' }))).toBe('START_TIME_IN_PAST');
    });
});

describe('outsideHoursError (HU-29)', () => {
    test('outside the hours of an open day: OUTSIDE_ZONE_HOURS with those hours', () => {
        const hours = { day: 1, opensAt: '06:00', closesAt: '20:00' };
        expect(outsideHoursError(hours)).toEqual({
            status: 400,
            body: {
                code: 'OUTSIDE_ZONE_HOURS',
                message: 'On that day this zone opens from 06:00 to 20:00, and the entry must be at least 30 minutes before closing',
                hours,
            },
        });
    });

    test('a day the zone does not open: ZONE_CLOSED_THAT_DAY', () => {
        const hours = { day: 7, closed: true };
        expect(outsideHoursError(hours)).toEqual({
            status: 400,
            body: { code: 'ZONE_CLOSED_THAT_DAY', message: 'This zone does not open on that day', hours },
        });
    });
});
