const { getRangoFecha } = require('../src/controllers/admin.controller');

// Colombia is always UTC-5 (no daylight saving time), so midnight in Colombia
// is 05:00 UTC. The moments are written in UTC, so the tests give the same
// answer whatever the time zone of the machine that runs them.
const at = (iso) => new Date(iso);
const startOf = (range, iso) => getRangoFecha(range, at(iso)).inicio.toISOString();

// HU-22 AC-03: the ranges of the admin dashboard (#298)
describe('getRangoFecha', () => {
    describe('today (Hoy)', () => {
        test('at 11:59 p. m. in Colombia it still starts at midnight of that day', () => {
            // Arrange: November 9, 11:59 p. m. in Colombia
            const now = '2026-11-10T04:59:00Z';

            // Act
            const start = startOf('today', now);

            // Assert
            expect(start).toBe('2026-11-09T05:00:00.000Z');
        });

        test('at 12:01 a. m. in Colombia it starts at midnight of the new day', () => {
            // Arrange: November 10, 12:01 a. m. in Colombia
            const now = '2026-11-10T05:01:00Z';

            // Act
            const start = startOf('today', now);

            // Assert
            expect(start).toBe('2026-11-10T05:00:00.000Z');
        });

        test('at exactly midnight in Colombia it starts at that moment', () => {
            // Act
            const start = startOf('today', '2026-11-10T05:00:00Z');

            // Assert
            expect(start).toBe('2026-11-10T05:00:00.000Z');
        });

        test('at 8:00 p. m. in Colombia it does not start at 7:00 p. m. (midnight in UTC)', () => {
            // Arrange: November 9, 8:00 p. m. in Colombia, already November 10 in UTC
            const now = '2026-11-10T01:00:00Z';

            // Act
            const start = startOf('today', now);

            // Assert
            expect(start).toBe('2026-11-09T05:00:00.000Z');
        });
    });

    describe('week (Últimos 7 días)', () => {
        test('starts at midnight 6 days ago: today and the 6 days before', () => {
            // Arrange: November 10, 10:00 a. m. in Colombia
            const now = '2026-11-10T15:00:00Z';

            // Act
            const start = startOf('week', now);

            // Assert
            expect(start).toBe('2026-11-04T05:00:00.000Z');
        });

        test('moves to the next day exactly at midnight in Colombia', () => {
            // Assert: 11:59 p. m. and 12:01 a. m. around the midnight of November 10
            expect(startOf('week', '2026-11-10T04:59:00Z')).toBe('2026-11-03T05:00:00.000Z');
            expect(startOf('week', '2026-11-10T05:01:00Z')).toBe('2026-11-04T05:00:00.000Z');
        });
    });

    describe('month (Últimos 30 días)', () => {
        test('starts at midnight 29 days ago: today and the 29 days before', () => {
            // Arrange: November 10, 10:00 a. m. in Colombia
            const now = '2026-11-10T15:00:00Z';

            // Act
            const start = startOf('month', now);

            // Assert
            expect(start).toBe('2026-10-12T05:00:00.000Z');
        });

        test('is always 30 days, also after a short month (February 2026 has 28 days)', () => {
            // Arrange: March 1, 10:00 a. m. in Colombia. A calendar month back would be February 1.
            const now = '2026-03-01T15:00:00Z';

            // Act
            const start = startOf('month', now);

            // Assert
            expect(start).toBe('2026-01-31T05:00:00.000Z');
        });

        test('is always 30 days, also after a long month (October has 31 days)', () => {
            // Arrange: November 1, 10:00 a. m. in Colombia. A calendar month back would be October 1.
            const now = '2026-11-01T15:00:00Z';

            // Act
            const start = startOf('month', now);

            // Assert
            expect(start).toBe('2026-10-03T05:00:00.000Z');
        });
    });

    test('every range ends at the moment it is asked', () => {
        // Arrange
        const now = at('2026-11-10T15:00:00Z');

        // Act
        const { fin } = getRangoFecha('week', now);

        // Assert
        expect(fin).toBe(now);
    });

    test('a range that does not exist throws instead of answering a wrong date', () => {
        // Assert
        expect(() => getRangoFecha('year', at('2026-11-10T15:00:00Z'))).toThrow('Unknown range: year');
    });
});
