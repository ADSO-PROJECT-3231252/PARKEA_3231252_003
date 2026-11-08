const { chargedHours, provisionalEndTime, openStayCharge, paidBeforeBalance, extensionCharge } = require('../src/utils/stayPricing');

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
        expect(charge).toMatchObject({ usedMinutes: 70, chargedHours: 2, total: 5000, paid: 2500, balance: 2500 });
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

describe('openStayCharge with what was already paid (HU-28 AC-07)', () => {
    const reserva = { startTime: START, appliedHourlyRate: '2500.00' };

    test('a reservation of 1.5 hours switched to an open stay subtracts everything it paid', () => {
        // Act
        const charge = openStayCharge(reserva, after(190), 3750);

        // Assert
        expect(charge).toMatchObject({ chargedHours: 4, total: 10000, paid: 3750, balance: 6250 });
    });

    test('ending before the time already paid charges nothing more and refunds nothing', () => {
        // Act
        const charge = openStayCharge(reserva, after(40), 7500);

        // Assert
        expect(charge).toMatchObject({ chargedHours: 1, total: 7500, paid: 7500, balance: 0 });
    });

    test('without the third argument it assumes the first hour, as in HU-27', () => {
        // Act
        const charge = openStayCharge(reserva, after(130));

        // Assert
        expect(charge).toMatchObject({ chargedHours: 3, total: 7500, paid: 2500, balance: 5000 });
    });
});

describe('paidBeforeBalance (HU-28)', () => {
    const reserva = { appliedHourlyRate: '2500.00' };

    test('adds the approved initial and extension payments only', () => {
        // Arrange
        const payments = [
            { type: 'initial', paymentStatus: 'Paid', amount: '3750.00' },
            { type: 'extension', paymentStatus: 'Paid', amount: '2500.00' },
            { type: 'extension', paymentStatus: 'Refunded', amount: '2500.00' },
            { type: 'balance', paymentStatus: 'Paid', amount: '9999.00' },
        ];

        // Act
        const paid = paidBeforeBalance(reserva, payments);

        // Assert
        expect(paid).toBe(6250);
    });

    test('a reservation of 30 minutes switched to an open stay counts only what it paid', () => {
        // Arrange
        const payments = [{ type: 'initial', paymentStatus: 'Paid', amount: '1250.00' }];

        // Act
        const paid = paidBeforeBalance(reserva, payments);

        // Assert
        expect(paid).toBe(1250);
    });

    test('without any payment it counts the first hour, as HU-27 did', () => {
        // Act / Assert
        expect(paidBeforeBalance(reserva, [])).toBe(2500);
        expect(paidBeforeBalance(reserva)).toBe(2500);
    });
});

describe('extensionCharge: every started hour of the extra time (HU-28 AC-06)', () => {
    const reserva = { startTime: START, appliedHourlyRate: '1500.55' };

    test.each([
        ['20 minutes', 20, 1, 1500.55],
        ['exactly 1 hour', 60, 1, 1500.55],
        ['1 hour and 1 minute', 61, 2, 3001.1],
        ['5 hours', 300, 5, 7502.75],
    ])('%s more is charged as %i hour(s)', (_label, minutes, hours, amount) => {
        // Act
        const charge = extensionCharge(reserva, after(120), after(120 + minutes));

        // Assert
        expect(charge).toEqual({ hours, amount });
    });
});
