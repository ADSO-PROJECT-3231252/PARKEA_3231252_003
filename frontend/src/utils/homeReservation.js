// #306: the "Reservas" card of the home shows the stay that is running now;
// if there is none, the next one that starts; if there is none, the last one
// that finished; and, as before, the latest one of any status.
// A confirmed reservation (Active) can be running or next. One waiting for
// payment (Pending) can only be next: it is held for a few minutes, so it is
// the most urgent for the person, even if its start time has already passed.
// A cancelled or expired one never counts.

const time = (value) => new Date(value).getTime();

// It already started and has not ended. An open stay comes with endTime null
// and runs until the person leaves.
const isRunning = (reservation, now) =>
    reservation.status === 'Active' &&
    time(reservation.startTime) <= now &&
    (!reservation.endTime || time(reservation.endTime) > now);

const isNext = (reservation, now) =>
    (reservation.status === 'Active' && time(reservation.startTime) > now) || reservation.status === 'Pending';

// `reservations`: all of them, the latest first, as the list answers.
// `lastFinished`: the most recent finished one.
export function pickHomeReservation({ reservations = [], lastFinished = null }, now = Date.now()) {
    // If two are running at once, the one that started last
    const running = reservations.filter((r) => isRunning(r, now)).sort((a, b) => time(b.startTime) - time(a.startTime));
    if (running.length > 0) return running[0];

    // The confirmed ones and the ones waiting for payment, by start time
    const next = reservations.filter((r) => isNext(r, now)).sort((a, b) => time(a.startTime) - time(b.startTime));
    if (next.length > 0) return next[0];

    return lastFinished ?? reservations[0] ?? null;
}
