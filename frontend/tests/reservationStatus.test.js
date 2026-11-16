import { canCancelReservation } from '../src/utils/reservationStatus';

// HU-16 (#316): when the "Cancelar reserva" button is shown. "now" is Monday
// 2026-11-16 at 8:00 a. m. in Colombia (UTC-5).
const NOW = new Date('2026-11-16T08:00:00-05:00').getTime();
const reservation = (status, startTime) => ({ status, startTime: `2026-11-16T${startTime}:00-05:00` });

describe('canCancelReservation (HU-16, #316)', () => {
    test.each([
        ['before its start time', '10:00'],
        ['at its start time', '08:00'],
        ['after its start time', '07:50'],
    ])('a reservation that is not paid yet (Pending) can be cancelled %s', (_label, startTime) => {
        expect(canCancelReservation(reservation('Pending', startTime), NOW)).toBe(true);
    });

    test('a paid reservation (Active) can be cancelled before its start time', () => {
        expect(canCancelReservation(reservation('Active', '08:01'), NOW)).toBe(true);
    });

    test.each([
        ['at its start time', '08:00'],
        ['after its start time', '07:50'],
    ])('a paid reservation (Active) cannot be cancelled %s', (_label, startTime) => {
        expect(canCancelReservation(reservation('Active', startTime), NOW)).toBe(false);
    });

    test.each(['Finished', 'Cancelled', 'Expired'])('a reservation with status %s cannot be cancelled', (status) => {
        expect(canCancelReservation(reservation(status, '10:00'), NOW)).toBe(false);
    });

    test('before the clock of the screen starts, the button is not shown', () => {
        expect(canCancelReservation(reservation('Pending', '10:00'), null)).toBe(false);
    });
});
