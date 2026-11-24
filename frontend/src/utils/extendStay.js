// HU-28: extending a stay. Same rules as the backend's PATCH
// /reservations/:id/extend; the backend always has the last word, this only
// decides what the screens offer and show.
import { MAX_OPEN_STAY_MS } from './openStay';
import { translateError } from './errorMessages';
import { hoursSentence } from './zoneHours';
import { formatDate, formatTime, keepTogether } from './format';

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
    // HU-29: past the closing time of the zone, or the zone no longer opens
    'OUTSIDE_ZONE_HOURS',
    'ZONE_CLOSED_THAT_DAY',
    // #373: the spot has another reservation in the added time
    'SPOT_RESERVED_LATER',
];

// AC-03: the latest exit time a stay can have, 24 hours after the entry.
// HU-29: in a zone that is not open 24 hours, the closing time of the day of
// the entry, which the API sends as latestEndTime.
export const extendLimitMs = (reservation) => {
    const maxMs = new Date(reservation.startTime).getTime() + MAX_OPEN_STAY_MS;
    return reservation.latestEndTime ? Math.min(maxMs, new Date(reservation.latestEndTime).getTime()) : maxMs;
};

// HU-29: true when the limit is the closing time of the zone, not the 24 hours
export const limitedByClosing = (reservation) =>
    extendLimitMs(reservation) < new Date(reservation.startTime).getTime() + MAX_OPEN_STAY_MS;

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
// the limit itself is the last one. #373: `freeUntil`, when the API said
// until when the spot is free (SPOT_RESERVED_LATER), is a limit too.
export function extensionOptions(reservation, freeUntil = null) {
    const fromMs = new Date(reservation.endTime).getTime();
    const freeMs = freeUntil ? new Date(freeUntil).getTime() : NaN;
    const limitMs = Number.isNaN(freeMs) ? extendLimitMs(reservation) : Math.min(extendLimitMs(reservation), freeMs);
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
    if (toMs > extendLimitMs(reservation)) return limitedByClosing(reservation) ? 'OUTSIDE_ZONE_HOURS' : 'EXTENSION_TOO_LONG';
    return null;
}

// #373: until when the spot is free, as the API sends it in
// SPOT_RESERVED_LATER (`freeUntil`), compared with the current exit time
// (`from`). Null when the spot is not free after that exit time, or the time
// is missing.
export function spotFreeUntil(freeUntil, from) {
    const freeMs = freeUntil ? new Date(freeUntil).getTime() : NaN;
    if (Number.isNaN(freeMs) || freeMs <= new Date(from).getTime()) return null;
    return new Date(freeMs).toISOString();
}

// "las 03:50 p. m.", or "el 23 nov. 2026 a las 01:50 a. m." when it is not
// the day of the current exit time, kept on one line.
export function untilText(iso, from) {
    const time = `las ${keepTogether(formatTime(iso))}`;
    return formatDate(iso) === formatDate(from) ? time : `el ${keepTogether(formatDate(iso))} a ${time}`;
}

// SPOT_RESERVED_LATER: the stay keeps its spot, which has another reservation
// later, so it can be extended only until 10 minutes before it.
function spotReservedLaterMessage(toOpenStay, freeUntil, from) {
    const freeMs = freeUntil ? new Date(freeUntil).getTime() : NaN;
    if (!Number.isNaN(freeMs) && freeMs <= new Date(from).getTime()) {
        return 'Tu cupo tiene otra reserva poco después de tu salida, así que esta estadía no se puede ampliar';
    }
    const until = spotFreeUntil(freeUntil, from);
    if (toOpenStay) {
        const first = 'Tu cupo tiene otra reserva más tarde, así que esta reserva no puede quedar en tiempo indefinido';
        return until ? `${first}. Puedes ampliarla hasta ${untilText(until, from)}` : first;
    }
    return until
        ? `Tu cupo tiene otra reserva más tarde. Puedes ampliar hasta ${untilText(until, from)}`
        : translateError('SPOT_RESERVED_LATER');
}

// The general texts, with some that say more in an extension: AC-04, the
// overlap is with the time being added; AC-06, a declined payment leaves the
// exit time as it was; HU-29, the closing time of the zone, with the hours of
// that day when the API sends them (`hours`); and #373, until when the spot
// is free (`spot`: the `freeUntil` of the API and the current exit, `from`).
export function extendErrorMessage(code, toOpenStay = false, hours = null, spot = {}) {
    if (code === 'SPOT_RESERVED_LATER') {
        return spotReservedLaterMessage(toOpenStay, spot.freeUntil, spot.from);
    }
    if (code === 'OUTSIDE_ZONE_HOURS' || code === 'ZONE_CLOSED_THAT_DAY') {
        const sentence = hoursSentence(hours);
        if (code === 'ZONE_CLOSED_THAT_DAY' || hours?.closed) {
            return `${sentence ?? 'La zona ya no abre el día de esta reserva.'} Por eso esta reserva ya no se puede ampliar`;
        }
        return `${sentence ? `${sentence} ` : ''}La salida no puede pasar de la hora de cierre de la zona`;
    }
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
