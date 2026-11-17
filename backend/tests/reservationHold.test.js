const { countsAsExpired, RESERVATION_EXPIRED } = require('../src/utils/reservationHold');

// #347: when the 15 minutes to pay a Pending reservation end, it counts as
// expired for everything, even before the job marks it Expired. The times are
// in Colombia (UTC-5), and "now" is Monday 2026-11-16 at 8:00 a. m.
const colombia = (time) => new Date(`2026-11-16T${time}:00-05:00`);
const NOW = colombia('08:00');

describe('When a reservation counts as expired (#347)', () => {
    test.each([
        ['when its 15 minutes end', 'Pending', colombia('08:00')],
        ['after its 15 minutes end, before the job marks it', 'Pending', colombia('07:59')],
        ['once the job marked it Expired', 'Expired', colombia('07:59')],
    ])('it counts as expired %s', (name, status, holdExpiresAt) => {
        expect(countsAsExpired({ status, holdExpiresAt }, NOW)).toBe(true);
    });

    test.each([
        ['while its 15 minutes last', 'Pending', new Date(NOW.getTime() + 1)],
        ['a Pending one without a deadline', 'Pending', null],
        ['a paid one (Active), even with an old deadline left', 'Active', colombia('07:00')],
        ['a Cancelled one, even after its deadline', 'Cancelled', colombia('07:00')],
        ['a Finished one', 'Finished', null],
    ])('it does not count as expired: %s', (name, status, holdExpiresAt) => {
        expect(countsAsExpired({ status, holdExpiresAt }, NOW)).toBe(false);
    });

    test('the deadline can come as text, like in a JSON answer', () => {
        expect(countsAsExpired({ status: 'Pending', holdExpiresAt: colombia('07:59').toISOString() }, NOW)).toBe(true);
    });

    test('without a "now", it compares with the current time', () => {
        // Arrange
        jest.useFakeTimers({ now: NOW });

        // Act
        const atTheEnd = countsAsExpired({ status: 'Pending', holdExpiresAt: colombia('08:00') });
        const before = countsAsExpired({ status: 'Pending', holdExpiresAt: new Date(NOW.getTime() + 1) });
        jest.useRealTimers();

        // Assert
        expect(atTheEnd).toBe(true);
        expect(before).toBe(false);
    });

    test('the answer is the same one the payment gives', () => {
        expect(RESERVATION_EXPIRED).toEqual({
            code: 'RESERVATION_EXPIRED',
            message: 'This reservation expired because it was not paid in time. Please make a new reservation.',
        });
    });
});

