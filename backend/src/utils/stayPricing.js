// HU-27: how an open stay is charged. Shared by the reservations controller,
// the payments controller and the job that closes stays at their exit time
// (24 hours, or the closing time of the zone, HU-29), so the amount is always
// calculated the same way.

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
// after the entry, nor than its saved exit time: in a zone that is not open
// 24 hours that is the closing time, HU-29 AC-04). `paid` is what the
// reservation already paid before the stay ends: the first hour for a stay
// booked without an exit time (AC-03), or more for a reservation switched to
// an open stay (HU-28 AC-07). What was paid is never refunded, so the total is
// at least `paid`, and the balance is the rest.
function openStayCharge(reserva, endTime = new Date(), paid = Number(reserva.appliedHourlyRate)) {
    const start = new Date(reserva.startTime);
    const limits = [new Date(endTime).getTime(), start.getTime() + MAX_OPEN_STAY_MS];
    if (reserva.endTime) limits.push(new Date(reserva.endTime).getTime());
    const cappedEnd = new Date(Math.min(...limits));
    const rate = Number(reserva.appliedHourlyRate);
    const hours = chargedHours(start, cappedEnd);
    const alreadyPaid = money(Number(paid));
    const total = Math.max(money(hours * rate), alreadyPaid);
    return {
        endTime: cappedEnd,
        usedMinutes: Math.max(0, Math.floor((cappedEnd - start) / 60000)),
        chargedHours: hours,
        total,
        paid: alreadyPaid,
        balance: money(total - alreadyPaid),
    };
}

// What an open stay paid before it ends: the initial payment and the
// extensions that were approved (HU-28). A balance is what is still owed, so
// it is not part of it. A reservation of 30 minutes switched to an open stay
// paid less than one hour, so the real amount is used. Without any payment
// it counts the first hour, as HU-27 always did (AC-03).
function paidBeforeBalance(reserva, payments = []) {
    const approved = payments.filter((p) => p.paymentStatus === 'Paid' && p.type !== 'balance');
    if (approved.length === 0) return money(Number(reserva.appliedHourlyRate));
    return money(approved.reduce((sum, p) => sum + Number(p.amount), 0));
}

// HU-28 AC-06: extending the exit time charges every started hour of the
// extra time at the reservation's stored rate. 20 minutes are 1 hour.
function extensionCharge(reserva, fromEndTime, toEndTime) {
    const hours = chargedHours(fromEndTime, toEndTime);
    return { hours, amount: money(hours * Number(reserva.appliedHourlyRate)) };
}

module.exports = { chargedHours, provisionalEndTime, openStayCharge, paidBeforeBalance, extensionCharge, MAX_OPEN_STAY_MS };
