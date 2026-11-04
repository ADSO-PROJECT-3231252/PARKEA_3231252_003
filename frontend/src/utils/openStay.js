// HU-27: how an open stay (a reservation without an exit time) is charged.
// Same rule as the backend's utils/stayPricing.js: every started hour counts,
// the first hour is the minimum and the stay lasts at most 24 hours. The
// backend always has the last word; this only shows the amount on screen.

const HOUR_MS = 60 * 60 * 1000;
export const MAX_OPEN_STAY_MS = 24 * HOUR_MS;

// What the stay costs if it ends at `nowMs`.
export function openStayCharge(startIso, hourlyRate, nowMs) {
    const startMs = new Date(startIso).getTime();
    const usedMs = Math.min(Math.max(0, nowMs - startMs), MAX_OPEN_STAY_MS);
    const chargedHours = Math.max(1, Math.ceil(usedMs / HOUR_MS));
    const rate = Number(hourlyRate);
    const total = Math.round(chargedHours * rate * 100) / 100;
    return {
        usedMinutes: Math.floor(usedMs / 60000),
        chargedHours,
        total,
        balance: Math.round((total - rate) * 100) / 100,
    };
}

// The time used so far never goes past 24 hours: right after that, the
// backend job ends the stay by itself (AC-10).
export const stayEndSoFar = (startIso, nowMs) => Math.min(nowMs, new Date(startIso).getTime() + MAX_OPEN_STAY_MS);

// The stay is running: paid, already started and not finished yet.
export const isRunningStay = (reservation, nowMs) =>
    Boolean(reservation?.openEnded) &&
    reservation.status === 'Active' &&
    nowMs !== null &&
    new Date(reservation.startTime).getTime() <= nowMs;

// "Terminar estadía" (AC-05) is only offered while the stay is running.
export const canFinishStay = isRunningStay;

// What an open stay still owes after it ended (AC-07); 0 when nothing.
export const pendingBalanceOf = (reservation) => Number(reservation?.openStay?.pendingBalance ?? 0);

// "1 hora" / "3 horas"
export const hoursLabel = (hours) => `${hours} ${hours === 1 ? 'hora' : 'horas'}`;

// "1 h 05 min" / "45 min": short form for the time used so far.
export function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}
