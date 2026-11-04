// HU-27: how an open stay is charged. Shared by the reservations controller,
// the payments controller and the job that closes stays after 24 hours, so
// the amount is always calculated the same way.

const HOUR_MS = 60 * 60 * 1000;

// An open stay lasts at most 24 hours (AC-10)
const MAX_OPEN_STAY_MS = 24 * HOUR_MS;

// Rounds money the same way as the rest of the API (two decimals)
const money = (value) => Number(value.toFixed(2));

// Hours charged for a stay: every started hour counts, and the first hour is
// the minimum (AC-07, AC-08). 60 minutes are 1 hour; 61 minutes are 2.
function chargedHours(startTime, endTime) {
    const usedMs = new Date(endTime) - new Date(startTime);
    return Math.max(1, Math.ceil(usedMs / HOUR_MS));
}

// The provisional exit time saved for an open stay: entry + 24 hours
function provisionalEndTime(startTime) {
    return new Date(new Date(startTime).getTime() + MAX_OPEN_STAY_MS);
}

// What an open stay costs if it ends at `endTime` (never later than 24 hours
// after the entry). The first hour was already paid to confirm it (AC-03), so
// the balance is the rest.
function openStayCharge(reserva, endTime = new Date()) {
    const start = new Date(reserva.startTime);
    const cappedEnd = new Date(Math.min(new Date(endTime).getTime(), start.getTime() + MAX_OPEN_STAY_MS));
    const rate = Number(reserva.appliedHourlyRate);
    const hours = chargedHours(start, cappedEnd);
    const total = money(hours * rate);
    const firstHour = money(rate);
    return {
        endTime: cappedEnd,
        usedMinutes: Math.max(0, Math.floor((cappedEnd - start) / 60000)),
        chargedHours: hours,
        total,
        firstHour,
        balance: money(total - firstHour),
    };
}

module.exports = { chargedHours, provisionalEndTime, openStayCharge, MAX_OPEN_STAY_MS };
