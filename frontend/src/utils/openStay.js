// HU-27: how an open stay (a reservation without an exit time) is charged.
// Same rule as the backend's utils/stayPricing.js: every started hour counts,
// the first hour is the minimum and the stay lasts at most 24 hours. The
// backend always has the last word; this only shows the amount on screen.

const HOUR_MS = 60 * 60 * 1000;
export const MAX_OPEN_STAY_MS = 24 * HOUR_MS;

const money = (value) => Math.round(value * 100) / 100;

// HU-29: the moment an open stay ends at the latest: its latestEndTime (the
// closing time of its zone, or entry + 24 hours), never more than 24 hours
const stayLimitMs = (startIso, latestEndIso) => {
    const maxMs = new Date(startIso).getTime() + MAX_OPEN_STAY_MS;
    return latestEndIso ? Math.min(maxMs, new Date(latestEndIso).getTime()) : maxMs;
};

// What the stay costs if it ends at `nowMs`. `paid` is what it paid before
// it ends: the first hour for a stay booked without an exit time, or more (or
// less) for a reservation switched to an open stay (HU-28). What was paid is
// never refunded, so the total is at least `paid`. `latestEndIso` is the
// latestEndTime of the reservation: it is never charged past it (HU-29).
export function openStayCharge(startIso, hourlyRate, nowMs, paid = Number(hourlyRate), latestEndIso = null) {
    const startMs = new Date(startIso).getTime();
    const usedMs = Math.max(0, Math.min(nowMs, stayLimitMs(startIso, latestEndIso)) - startMs);
    const chargedHours = Math.max(1, Math.ceil(usedMs / HOUR_MS));
    const total = Math.max(money(chargedHours * Number(hourlyRate)), money(paid));
    return {
        usedMinutes: Math.floor(usedMs / 60000),
        chargedHours,
        total,
        paid: money(paid),
        balance: money(total - paid),
    };
}

// HU-28: what an open stay paid before it ends, the same rule as the
// backend's paidBeforeBalance: the payments approved so far, or the first
// hour when there are none.
export const paidBeforeEnd = (reservation, hourlyRate) => {
    const paid = Number(reservation?.openStay?.paid ?? 0);
    return paid > 0 ? paid : Number(hourlyRate);
};

// True when what was paid is just the first hour (a stay booked without an
// exit time), so the screens can keep saying "la primera hora".
export const paidOnlyFirstHour = (paid, hourlyRate) => Math.abs(paid - Number(hourlyRate)) < 0.005;

// The time used so far never goes past 24 hours, nor the closing time of the
// zone (HU-29): right after that, the backend job ends the stay by itself
// (AC-10).
export const stayEndSoFar = (startIso, nowMs, latestEndIso = null) => Math.min(nowMs, stayLimitMs(startIso, latestEndIso));

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

// "1 hora" / "3 horas". With an adjective it agrees too: "1 hora cobrada",
// "3 horas cobradas".
export const hoursLabel = (hours, adjective) => {
    const plural = hours !== 1;
    const label = `${hours} ${plural ? 'horas' : 'hora'}`;
    return adjective ? `${label} ${adjective}${plural ? 's' : ''}` : label;
};

// "1 h 05 min" / "45 min": short form for the time used so far.
export function formatMinutes(totalMinutes) {
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    if (hours === 0) return `${minutes} min`;
    return `${hours} h ${String(minutes).padStart(2, '0')} min`;
}
