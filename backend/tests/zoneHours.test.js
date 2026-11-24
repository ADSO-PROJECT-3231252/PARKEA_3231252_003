const { checkStay, latestExit, hoursOfStart, scheduleErrors, colombiaDay } = require('../src/utils/zoneHours');

// HU-29: the hours are in Colombia time (UTC-5). 2026-11-16 is a Monday.
// "2026-11-16T15:00:00Z" is 10:00 a. m. in Colombia, and 8:00 p. m. in
// Colombia is already the next day in UTC.
const colombia = (date, time) => new Date(`${date}T${time}:00-05:00`);
const MONDAY = '2026-11-16';
const TUESDAY = '2026-11-17';
const WEDNESDAY = '2026-11-18';

// Open Monday and Tuesday from 6:00 a. m. to 8:00 p. m.; closed the other days
const custom = {
    open24h: false,
    schedule: [
        { day: 1, opensAt: '06:00', closesAt: '20:00' },
        { day: 2, opensAt: '06:00', closesAt: '20:00' },
    ],
};
const open24h = { open24h: true, schedule: [] };
const MONDAY_HOURS = { day: 1, opensAt: '06:00', closesAt: '20:00' };

describe('colombiaDay: the day of the week in Colombia', () => {
    test.each([
        ['Monday at midnight', colombia(MONDAY, '00:00'), 1],
        ['Monday at 11:59 p. m. (already Tuesday in UTC)', colombia(MONDAY, '23:59'), 1],
        ['Tuesday at midnight', colombia(TUESDAY, '00:00'), 2],
        ['Sunday', colombia('2026-11-22', '12:00'), 7],
    ])('%s', (_label, date, day) => {
        // Act
        const result = colombiaDay(date);

        // Assert
        expect(result.day).toBe(day);
    });

    test('the day starts at midnight in Colombia (05:00 UTC)', () => {
        // Act
        const result = colombiaDay(colombia(MONDAY, '21:30'));

        // Assert
        expect(new Date(result.midnight).toISOString()).toBe('2026-11-16T05:00:00.000Z');
    });
});

describe('checkStay: a stay with an exit time (AC-03)', () => {
    test.each([
        ['inside the hours', '10:00', '12:00'],
        ['entering at the opening time', '06:00', '08:00'],
        ['leaving at the closing time', '18:00', '20:00'],
        ['the whole day, from opening to closing', '06:00', '20:00'],
        ['entering 30 minutes before closing', '19:30', '20:00'],
    ])('accepts %s', (_label, start, end) => {
        // Act
        const result = checkStay(custom, colombia(MONDAY, start), colombia(MONDAY, end));

        // Assert
        expect(result.problem).toBeUndefined();
        expect(result.closesAt.toISOString()).toBe(colombia(MONDAY, '20:00').toISOString());
    });

    test.each([
        ['entering before the opening time', '05:59', '08:00'],
        ['leaving after the closing time', '18:00', '20:01'],
        ['entering 29 minutes before closing', '19:31', '20:00'],
        ['entering after the closing time', '20:30', '21:30'],
    ])('rejects %s with the hours of that day', (_label, start, end) => {
        // Act
        const result = checkStay(custom, colombia(MONDAY, start), colombia(MONDAY, end));

        // Assert
        expect(result.problem).toEqual(MONDAY_HOURS);
    });

    test('rejects a stay that goes on into the next day', () => {
        // Act
        const result = checkStay(custom, colombia(MONDAY, '19:00'), colombia(TUESDAY, '07:00'));

        // Assert
        expect(result.problem).toEqual(MONDAY_HOURS);
    });

    test('rejects a closed day', () => {
        // Act
        const result = checkStay(custom, colombia(WEDNESDAY, '10:00'), colombia(WEDNESDAY, '12:00'));

        // Assert
        expect(result.problem).toEqual({ day: 3, closed: true });
    });

    test('a zone open 24 hours accepts any time, also across midnight', () => {
        // Act
        const result = checkStay(open24h, colombia(WEDNESDAY, '23:00'), colombia('2026-11-19', '03:00'));

        // Assert
        expect(result).toEqual({ closesAt: null });
    });
});

describe('checkStay: an open stay ends at the closing time (AC-04)', () => {
    test('30 minutes before closing is the last entry, and it ends at the closing time', () => {
        // Act
        const result = checkStay(custom, colombia(MONDAY, '19:30'));

        // Assert
        expect(result.closesAt.toISOString()).toBe('2026-11-17T01:00:00.000Z');
    });

    test('29 minutes before closing is rejected', () => {
        // Act
        const result = checkStay(custom, colombia(MONDAY, '19:31'));

        // Assert
        expect(result.problem).toEqual(MONDAY_HOURS);
    });

    test('a zone open 24 hours has no closing time', () => {
        // Act
        const result = checkStay(open24h, colombia(MONDAY, '23:50'));

        // Assert
        expect(result.closesAt).toBeNull();
    });
});

describe('latestExit: how far a stay can be extended (AC-05)', () => {
    test('the closing time of the day of the entry', () => {
        // Act
        const result = latestExit(custom, colombia(MONDAY, '10:00'));

        // Assert
        expect(result.toISOString()).toBe(colombia(MONDAY, '20:00').toISOString());
    });

    test('24 hours after the entry in a zone open 24 hours', () => {
        // Act
        const result = latestExit(open24h, colombia(MONDAY, '10:00'));

        // Assert
        expect(result.toISOString()).toBe(colombia(TUESDAY, '10:00').toISOString());
    });

    test('null when the zone no longer opens on the day of the entry', () => {
        // Act
        const result = latestExit(custom, colombia(WEDNESDAY, '10:00'));

        // Assert
        expect(result).toBeNull();
    });

    test('hoursOfStart gives the hours of the day of the entry for the error', () => {
        // Act + Assert
        expect(hoursOfStart(custom, colombia(MONDAY, '10:00'))).toEqual(MONDAY_HOURS);
        expect(hoursOfStart(custom, colombia(WEDNESDAY, '10:00'))).toEqual({ day: 3, closed: true });
    });
});

describe('A zone read without its schedules', () => {
    test('stops with an error instead of treating every day as closed', () => {
        // Act + Assert
        expect(() => checkStay({ open24h: false }, colombia(MONDAY, '10:00'))).toThrow('without its schedules');
    });
});

describe('scheduleErrors: the hours an admin saves (AC-02)', () => {
    test('accepts a valid week', () => {
        // Act
        const errors = scheduleErrors([
            { day: 1, opensAt: '06:00', closesAt: '20:00' },
            { day: 6, opensAt: '00:00', closesAt: '23:59' },
            { day: 7, opensAt: '08:00', closesAt: '08:30' },
        ]);

        // Assert
        expect(errors).toEqual([]);
    });

    test.each([
        ['no days', []],
        ['no list', undefined],
        ['a list that is not an array', { day: 1 }],
    ])('needs at least one open day: %s', (_label, schedule) => {
        // Act
        const errors = scheduleErrors(schedule);

        // Assert
        expect(errors).toEqual([{ path: 'schedule', msg: 'At least one day must be open' }]);
    });

    test('rejects more than 7 days', () => {
        // Act
        const errors = scheduleErrors(Array.from({ length: 8 }, (_, i) => ({ day: (i % 7) + 1, opensAt: '06:00', closesAt: '20:00' })));

        // Assert
        expect(errors[0].msg).toBe('schedule can have at most 7 days');
    });

    test.each([
        ['less than 30 minutes open', { day: 2, opensAt: '06:00', closesAt: '06:29' }],
        ['closing before opening (crossing midnight)', { day: 2, opensAt: '22:00', closesAt: '02:00' }],
        ['a time without two digits', { day: 2, opensAt: '6:00', closesAt: '20:00' }],
        ['24:00 as closing time', { day: 2, opensAt: '06:00', closesAt: '24:00' }],
        ['a missing time', { day: 2, opensAt: '06:00' }],
    ])('rejects %s, naming the day', (_label, item) => {
        // Act
        const errors = scheduleErrors([{ day: 1, opensAt: '06:00', closesAt: '20:00' }, item]);

        // Assert
        expect(errors).toHaveLength(1);
        expect(errors[0]).toMatchObject({ path: 'schedule', day: 2 });
    });

    test('rejects a repeated day', () => {
        // Act
        const errors = scheduleErrors([
            { day: 4, opensAt: '06:00', closesAt: '20:00' },
            { day: 4, opensAt: '07:00', closesAt: '21:00' },
        ]);

        // Assert
        expect(errors).toEqual([{ path: 'schedule', day: 4, msg: 'Day 4 appears more than once' }]);
    });

    test.each([0, 8, '1', 1.5, null])('rejects the day %p', (day) => {
        // Act
        const errors = scheduleErrors([{ day, opensAt: '06:00', closesAt: '20:00' }]);

        // Assert
        expect(errors).toEqual([{ path: 'schedule', msg: 'Each day must be a whole number from 1 (Monday) to 7 (Sunday)' }]);
    });

    test('gives one error for each wrong day', () => {
        // Act
        const errors = scheduleErrors([
            { day: 1, opensAt: '06:00', closesAt: '06:10' },
            { day: 2, opensAt: '06:00', closesAt: '20:00' },
            { day: 3, opensAt: '21:00', closesAt: '20:00' },
        ]);

        // Assert
        expect(errors.map((e) => e.day)).toEqual([1, 3]);
    });
});
