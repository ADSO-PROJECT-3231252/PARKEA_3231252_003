import { canCancelReservation, canPayReservation, holdHasEnded } from '../src/utils/reservationStatus';

// HU-16 (#316): when the "Cancelar reserva" button is shown. #347: when the
// 15 minutes to pay a Pending reservation end. "now" is Monday 2026-11-16 at
// 8:00 a. m. in Colombia (UTC-5).
const NOW = new Date('2026-11-16T08:00:00-05:00').getTime();
const colombia = (time) => `2026-11-16T${time}:00-05:00`;
const reservation = (status, startTime, holdExpiresAt) => ({ status, startTime: colombia(startTime), holdExpiresAt });

// A Pending reservation made at 7:55 a. m.: its 15 minutes end at 8:10 a. m.
const waitingForPayment = (startTime) => reservation('Pending', startTime, colombia('08:10'));

describe('canCancelReservation (HU-16, #316)', () => {
    test.each([
        ['before its start time', '10:00'],
        ['at its start time', '08:00'],
        ['after its start time', '07:50'],
    ])('a reservation that is not paid yet (Pending) can be cancelled %s', (_label, startTime) => {
        expect(canCancelReservation(waitingForPayment(startTime), NOW)).toBe(true);
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
        expect(canCancelReservation(waitingForPayment('10:00'), null)).toBe(false);
    });
});

describe('When the 15 minutes to pay end (#347)', () => {
    test.each([
        ['at that very moment', '08:00'],
        ['after them, while the job has not marked it Expired', '07:59'],
    ])('a Pending reservation can no longer be paid or cancelled %s', (_label, holdEnd) => {
        // Arrange
        const pending = reservation('Pending', '10:00', colombia(holdEnd));

        // Act and assert
        expect(holdHasEnded(pending, NOW)).toBe(true);
        expect(canPayReservation(pending, NOW)).toBe(false);
        expect(canCancelReservation(pending, NOW)).toBe(false);
    });

    test('a millisecond before they end, it can still be paid and cancelled', () => {
        // Arrange
        const pending = reservation('Pending', '10:00', new Date(NOW + 1).toISOString());

        // Act and assert
        expect(holdHasEnded(pending, NOW)).toBe(false);
        expect(canPayReservation(pending, NOW)).toBe(true);
        expect(canCancelReservation(pending, NOW)).toBe(true);
    });

    test('also when its start time already passed (#316)', () => {
        // Arrange: entry at 7:50 a. m., made at 7:44 a. m. and never paid
        const pending = reservation('Pending', '07:50', colombia('07:59'));

        // Act and assert
        expect(canPayReservation(pending, NOW)).toBe(false);
        expect(canCancelReservation(pending, NOW)).toBe(false);
    });

    test.each([null, undefined])('without a deadline (%s) the screen does not cut it short: the backend decides', (holdExpiresAt) => {
        // Arrange
        const pending = reservation('Pending', '10:00', holdExpiresAt);

        // Act and assert
        expect(holdHasEnded(pending, NOW)).toBe(false);
        expect(canPayReservation(pending, NOW)).toBe(true);
        expect(canCancelReservation(pending, NOW)).toBe(true);
    });

    test('a paid reservation (Active) does not depend on them, even with an old deadline left', () => {
        // Arrange
        const paid = reservation('Active', '10:00', colombia('07:00'));

        // Act and assert
        expect(holdHasEnded(paid, NOW)).toBe(false);
        expect(canPayReservation(paid, NOW)).toBe(false);
        expect(canCancelReservation(paid, NOW)).toBe(true);
    });

    test.each(['Active', 'Finished', 'Cancelled', 'Expired'])('a reservation with status %s cannot be paid', (status) => {
        expect(canPayReservation(reservation(status, '10:00', null), NOW)).toBe(false);
    });

    test('before the clock of the screen starts, "Pagar" is not shown', () => {
        expect(canPayReservation(waitingForPayment('10:00'), null)).toBe(false);
    });
});
