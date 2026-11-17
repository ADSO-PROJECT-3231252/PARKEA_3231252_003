import { pickHomeReservation } from '../src/utils/homeReservation';

// #306: the "Reservas" card of the home shows the stay running now, else the
// next one (confirmed or waiting for payment), else the last finished one,
// else the latest of any status.
const HOUR = 60 * 60 * 1000;
const NOW = new Date('2026-11-16T12:00:00-05:00').getTime();
const at = (hours) => new Date(NOW + hours * HOUR).toISOString();

const reservation = (id, status, startHours, endHours) => ({
    id,
    status,
    startTime: at(startHours),
    endTime: endHours === null ? null : at(endHours),
});

describe('Reservation shown on the home (#306)', () => {
    test('with a stay running now and another one tomorrow, it shows the one running', () => {
        // Arrange
        const tomorrow = reservation('tomorrow', 'Active', 24, 26);
        const running = reservation('running', 'Active', -1, 2);
        // Act
        const shown = pickHomeReservation({ reservations: [tomorrow, running] }, NOW);
        // Assert
        expect(shown.id).toBe('running');
    });

    test('with only future reservations, it shows the nearest one', () => {
        // Arrange
        const far = reservation('far', 'Active', 72, 74);
        const near = reservation('near', 'Active', 3, 5);
        const middle = reservation('middle', 'Active', 24, 26);
        // Act
        const shown = pickHomeReservation({ reservations: [far, near, middle] }, NOW);
        // Assert
        expect(shown.id).toBe('near');
    });

    test('with none running or coming, it shows the last finished one', () => {
        // Arrange
        const cancelled = reservation('cancelled', 'Cancelled', -5, -3);
        const lastFinished = reservation('finished', 'Finished', -30, -28);
        // Act
        const shown = pickHomeReservation({ reservations: [cancelled], lastFinished }, NOW);
        // Assert
        expect(shown.id).toBe('finished');
    });

    test('with only a cancelled one, it shows it like before', () => {
        // Arrange
        const cancelled = reservation('cancelled', 'Cancelled', -5, -3);
        // Act
        const shown = pickHomeReservation({ reservations: [cancelled], lastFinished: null }, NOW);
        // Assert
        expect(shown.id).toBe('cancelled');
    });

    test('with no reservations at all, it shows nothing (the empty state stays)', () => {
        // Act + Assert
        expect(pickHomeReservation({}, NOW)).toBeNull();
        expect(pickHomeReservation({ reservations: [], lastFinished: null }, NOW)).toBeNull();
    });

    test('an open stay, with no exit time yet, counts as running', () => {
        // Arrange
        const open = reservation('open', 'Active', -4, null);
        const next = reservation('next', 'Active', 5, 7);
        // Act
        const shown = pickHomeReservation({ reservations: [next, open] }, NOW);
        // Assert
        expect(shown.id).toBe('open');
    });

    test('if two are running at once, it shows the one that started last', () => {
        // Arrange
        const older = reservation('older', 'Active', -6, 3);
        const newer = reservation('newer', 'Active', -1, 4);
        // Act
        const shown = pickHomeReservation({ reservations: [older, newer] }, NOW);
        // Assert
        expect(shown.id).toBe('newer');
    });

    test('a confirmed stay that already ended is neither running nor next', () => {
        // Arrange
        const ended = reservation('ended', 'Active', -5, -1);
        const lastFinished = reservation('finished', 'Finished', -30, -28);
        // Act
        const shown = pickHomeReservation({ reservations: [ended], lastFinished }, NOW);
        // Assert
        expect(shown.id).toBe('finished');
    });

    test('a stay that starts at this very moment is running', () => {
        // Arrange
        const now = reservation('now', 'Active', 0, 2);
        const next = reservation('next', 'Active', 1, 3);
        // Act
        const shown = pickHomeReservation({ reservations: [next, now] }, NOW);
        // Assert
        expect(shown.id).toBe('now');
    });

    test('a cancelled reservation is never taken as running or next', () => {
        // Arrange
        const cancelled = reservation('cancelled', 'Cancelled', 3, 5);
        const next = reservation('next', 'Active', 10, 12);
        // Act
        const shown = pickHomeReservation({ reservations: [cancelled, next] }, NOW);
        // Assert
        expect(shown.id).toBe('next');
    });

    test('the running one wins over the last finished and the latest', () => {
        // Arrange
        const latest = reservation('latest', 'Active', 48, 50);
        const running = reservation('running', 'Active', -1, 1);
        const lastFinished = reservation('finished', 'Finished', -30, -28);
        // Act
        const shown = pickHomeReservation({ reservations: [latest, running], lastFinished }, NOW);
        // Assert
        expect(shown.id).toBe('running');
    });

    test('a new pending reservation and an old finished one: it shows the pending', () => {
        // Arrange
        const pending = reservation('pending', 'Pending', 6, 8);
        const lastFinished = reservation('finished', 'Finished', -30, -28);
        // Act
        const shown = pickHomeReservation({ reservations: [pending], lastFinished }, NOW);
        // Assert
        expect(shown.id).toBe('pending');
    });

    test('a pending one in 2 hours and a confirmed one in 30 hours: it shows the pending', () => {
        // Arrange
        const confirmed = reservation('confirmed', 'Active', 30, 32);
        const pending = reservation('pending', 'Pending', 2, 4);
        // Act
        const shown = pickHomeReservation({ reservations: [confirmed, pending] }, NOW);
        // Assert
        expect(shown.id).toBe('pending');
    });

    test('a pending one for later than a confirmed one: it shows the confirmed one (by start time)', () => {
        // Arrange
        const pending = reservation('pending', 'Pending', 30, 32);
        const confirmed = reservation('confirmed', 'Active', 5, 7);
        // Act
        const shown = pickHomeReservation({ reservations: [pending, confirmed] }, NOW);
        // Assert
        expect(shown.id).toBe('confirmed');
    });

    test('a stay running and a pending one for later: it shows the one running', () => {
        // Arrange
        const pending = reservation('pending', 'Pending', 5, 7);
        const running = reservation('running', 'Active', -1, 2);
        // Act
        const shown = pickHomeReservation({ reservations: [pending, running] }, NOW);
        // Assert
        expect(shown.id).toBe('running');
    });

    test('a pending one whose start time already passed and an old finished one: it shows the pending', () => {
        // Arrange
        const pending = reservation('pending', 'Pending', -0.1, 1);
        const lastFinished = reservation('finished', 'Finished', -30, -28);
        // Act
        const shown = pickHomeReservation({ reservations: [pending], lastFinished }, NOW);
        // Assert
        expect(shown.id).toBe('pending');
    });

    test('a pending reservation is never running, even if its start time has passed', () => {
        // Arrange
        const pending = reservation('pending', 'Pending', -2, 1);
        const running = reservation('running', 'Active', -1, 2);
        // Act
        const shown = pickHomeReservation({ reservations: [pending, running] }, NOW);
        // Assert
        expect(shown.id).toBe('running');
    });
});
