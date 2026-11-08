// HU-28: extending a stay. Same rules as the backend's PATCH
// /reservations/:id/extend; the backend always has the last word, this only
// decides what the screens offer and show.
import { MAX_OPEN_STAY_MS } from './openStay';
import { translateError } from './errorMessages';

const HOUR_MS = 60 * 60 * 1000;

// Longest delay a browser timer accepts (about 24 days). The screens that
// update themselves at the exit time wait longer in steps.
export const MAX_TIMER_MS = 2 ** 31 - 1;

// Codes after which this extension cannot go on: the reservation changed,
// ended or the chosen time is no longer valid. A declined payment is not one
// of them, the user can try again.
export const EXTEND_FINAL_CODES = [
    'RESERVATION_NOT_FOUND',
    'STAY_NOT_ACTIVE',
    'ALREADY_OPEN_STAY',
    'EXIT_TIME_PASSED',
    'RESERVATION_CHANGED',
    'EXTENSION_NOT_LATER',
    'EXTENSION_TOO_LONG',
    'VEHICLE_RESERVATION_OVERLAP',
];

// AC-03: the latest exit time a stay can have, 24 hours after the entry.
export const extendLimitMs = (reservation) => new Date(reservation.startTime).getTime() + MAX_OPEN_STAY_MS;

// AC-01: "Ampliar estadía" is offered for a paid reservation with an exit
// time, from the payment (also before the entry) until that exit time, while
// it is still under the 24-hour limit.
export const canExtendStay = (reservation, nowMs) => {
    if (reservation?.status !== 'Active' || reservation.openEnded || !reservation.endTime || nowMs === null) {
        return false;
    }
    const endMs = new Date(reservation.endTime).getTime();
    return endMs > nowMs && endMs < extendLimitMs(reservation);
};

// AC-06: every started hour of the extra time, at the reservation's rate.
// 20 minutes more are charged as 1 hour.
export function extensionCharge(fromIso, toIso, hourlyRate) {
    const hours = Math.max(1, Math.ceil((new Date(toIso) - new Date(fromIso)) / HOUR_MS));
    return { hours, amount: Math.round(hours * Number(hourlyRate) * 100) / 100 };
}

// AC-02: the exit times offered, one every hour after the current one, up to
// 24 hours from the entry. If the limit is not a whole number of hours away,
// the limit itself is the last one.
export function extensionOptions(reservation) {
    const fromMs = new Date(reservation.endTime).getTime();
    const limitMs = extendLimitMs(reservation);
    const options = [];
    let lastMs = fromMs;
    for (let t = fromMs + HOUR_MS; t <= limitMs; t += HOUR_MS) {
        options.push(new Date(t).toISOString());
        lastMs = t;
    }
    if (lastMs < limitMs) options.push(new Date(limitMs).toISOString());
    return options;
}

// "+3 h", "+30 min", "+22 h 30 min": the time added to the stay.
export function formatAddedTime(fromIso, toIso) {
    const minutes = Math.round((new Date(toIso) - new Date(fromIso)) / 60000);
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    if (hours === 0) return `+${rest} min`;
    return rest === 0 ? `+${hours} h` : `+${hours} h ${String(rest).padStart(2, '0')} min`;
}

// Why the stay cannot be extended to `toIso` right now, as the backend's error
// code (null when it can). `fromIso` is the exit time the user saw.
export function extensionProblem(reservation, fromIso, toIso, nowMs) {
    if (reservation.status !== 'Active') return 'STAY_NOT_ACTIVE';
    if (reservation.openEnded) return 'ALREADY_OPEN_STAY';
    const endMs = new Date(reservation.endTime).getTime();
    if (endMs <= nowMs) return 'EXIT_TIME_PASSED';
    if (new Date(fromIso).getTime() !== endMs) return 'RESERVATION_CHANGED';
    const toMs = new Date(toIso).getTime();
    if (Number.isNaN(toMs) || toMs <= endMs) return 'EXTENSION_NOT_LATER';
    if (toMs > extendLimitMs(reservation)) return 'EXTENSION_TOO_LONG';
    return null;
}

// The general texts, with two that say more in an extension: AC-04, the
// overlap is with the time being added, and AC-06, a declined payment leaves
// the exit time as it was.
export function extendErrorMessage(code, toOpenStay = false) {
    if (code === 'VEHICLE_RESERVATION_OVERLAP') {
        return toOpenStay
            ? 'Este vehículo tiene otra reserva más adelante, así que esta no puede quedar en tiempo indefinido. Amplíala con una hora de salida anterior a esa reserva'
            : 'Este vehículo ya tiene otra reserva en el tiempo que quieres agregar. Elige una hora de salida más temprana';
    }
    if (code === 'PAYMENT_DECLINED') {
        return 'Pago rechazado. Tu hora de salida no cambió. Intenta con otro método de pago';
    }
    return translateError(code);
}
