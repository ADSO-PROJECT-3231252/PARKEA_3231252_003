// #306: the "Reservas" card of the home shows the stay that is running now;
// if there is none, the next one that starts; if there is none, the last one
// that finished; and, as before, the latest one of any status.
// Only confirmed reservations (Active) count as running or next: a pending
// one is not confirmed yet, and a cancelled or expired one never will be.

const time = (value) => new Date(value).getTime();

// It already started and has not ended. An open stay comes with endTime null
// and runs until the person leaves.
const isRunning = (reservation, now) =>
    reservation.status === 'Active' &&
    time(reservation.startTime) <= now &&
    (!reservation.endTime || time(reservation.endTime) > now);

const isNext = (reservation, now) => reservation.status === 'Active' && time(reservation.startTime) > now;

// `active`: the confirmed reservations. `lastFinished`: the most recent
// finished one. `latest`: the latest one of any status.
export function pickHomeReservation({ active = [], lastFinished = null, latest = null }, now = Date.now()) {
    // If two are running at once, the one that started last
    const running = active.filter((r) => isRunning(r, now)).sort((a, b) => time(b.startTime) - time(a.startTime));
    if (running.length > 0) return running[0];

    const next = active.filter((r) => isNext(r, now)).sort((a, b) => time(a.startTime) - time(b.startTime));
    if (next.length > 0) return next[0];

    return lastFinished ?? latest ?? null;
}
