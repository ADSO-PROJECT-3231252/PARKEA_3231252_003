const { chargedHours, provisionalEndTime, openStayCharge } = require('../src/utils/stayPricing');

// HU-27: open stays are charged per started hour, with the first hour as the
// minimum and 24 hours as the maximum.
const START = new Date('2026-11-10T08:00:00.000Z');
const after = (minutes) => new Date(START.getTime() + minutes * 60 * 1000);

describe('chargedHours: every started hour counts (AC-07, AC-08)', () => {
    test.each([
        ['1 minute', 1, 1],
        ['59 minutes', 59, 1],
        ['exactly 60 minutes', 60, 1],
        ['61 minutes', 61, 2],
        ['1 hour and 59 minutes', 119, 2],
        ['exactly 2 hours', 120, 2],
        ['23 hours and 1 minute', 23 * 60 + 1, 24],
    ])('%s is charged as %i hour(s)', (_label, minutes, hours) => {
        // Act
        const result = chargedHours(START, after(minutes));

        // Assert
        expect(result).toBe(hours);
    });

    test('ending at the same moment it started still charges the first hour', () => {
        // Act
        const result = chargedHours(START, START);

        // Assert
        expect(result).toBe(1);
    });
});

describe('provisionalEndTime', () => {
    test('is 24 hours after the entry', () => {
        // Act
        const end = provisionalEndTime(START);

        // Assert
        expect(end.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    });
});

describe('openStayCharge', () => {
    const reserva = { startTime: START, appliedHourlyRate: '2500.00' };

    test('1 hour and 10 minutes: 2 hours, the first one already paid', () => {
        // Act
        const charge = openStayCharge(reserva, after(70));

        // Assert
        expect(charge).toMatchObject({ usedMinutes: 70, chargedHours: 2, total: 5000, firstHour: 2500, balance: 2500 });
    });

    test('less than one hour: the first hour is the minimum and nothing is owed (AC-08)', () => {
        // Act
        const charge = openStayCharge(reserva, after(20));

        // Assert
        expect(charge).toMatchObject({ chargedHours: 1, total: 2500, balance: 0 });
    });

    test('never charges more than 24 hours, even if it ends later (AC-10)', () => {
        // Act
        const charge = openStayCharge(reserva, after(30 * 60));

        // Assert
        expect(charge).toMatchObject({ chargedHours: 24, total: 60000, balance: 57500 });
        expect(charge.endTime.toISOString()).toBe('2026-11-11T08:00:00.000Z');
    });

    test('keeps two decimals with a rate that has cents', () => {
        // Act
        const charge = openStayCharge({ startTime: START, appliedHourlyRate: '1500.55' }, after(130));

        // Assert
        expect(charge).toMatchObject({ chargedHours: 3, total: 4501.65, balance: 3001.1 });
    });
});
