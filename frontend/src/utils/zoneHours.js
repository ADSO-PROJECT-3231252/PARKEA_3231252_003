// HU-29: the opening hours of a zone, as the screens show and check them.
// Same rules as the backend's utils/zoneHours.js; the backend always has the
// last word, this only decides what the screens show and offer.
//
// A zone has `open24h` and `schedule`: one item for each day it opens,
// { day, opensAt, closesAt }, with day 1 = Monday ... 7 = Sunday and the times
// as "HH:MM" in Colombia time. A day that is not in the list is closed.
// Colombia is always UTC-5 (no daylight saving time), so the day and the time
// are calculated the same way whatever the time zone of the browser.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const COLOMBIA_OFFSET_MS = 5 * HOUR_MS;

// The entry must be at least 30 minutes before the closing time (decision 4)
export const MIN_OPEN_MINUTES = 30;

export const DAYS = [1, 2, 3, 4, 5, 6, 7];

const DAY_NAMES = { 1: 'lunes', 2: 'martes', 3: 'miércoles', 4: 'jueves', 5: 'viernes', 6: 'sábado', 7: 'domingo' };
// "Esta zona no abre los sábados": the days that end in -s stay the same
const DAY_PLURALS = { ...DAY_NAMES, 6: 'sábados', 7: 'domingos' };

export const dayName = (day) => DAY_NAMES[day];
export const capitalized = (text) => text.charAt(0).toUpperCase() + text.slice(1);

// A time and its "a. m." / "p. m." never split across two lines
const NBSP = ' ';

// "8:00 p. m." already ends with a period, which also closes the sentence
const sentence = (text) => (text.endsWith('.') ? text : `${text}.`);

// "06:00" -> 360
export const minutesOf = (time) => {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
};

// 1170 -> "19:30"
export const timeOf = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

// "06:00" -> "6:00 a. m.", "20:00" -> "8:00 p. m.", "00:00" -> "12:00 a. m."
export function formatHour(time) {
    const minutes = minutesOf(time);
    const hours = Math.floor(minutes / 60);
    const suffix = hours < 12 ? 'a.' : 'p.';
    const hours12 = hours % 12 === 0 ? 12 : hours % 12;
    return `${hours12}:${String(minutes % 60).padStart(2, '0')}${NBSP}${suffix}${NBSP}m.`;
}

// The day of the week in Colombia (1 = Monday ... 7 = Sunday) and the moment
// that day starts (midnight in Colombia)
export function colombiaDay(date) {
    const local = new Date(new Date(date).getTime() - COLOMBIA_OFFSET_MS);
    const weekDay = local.getUTCDay();
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + COLOMBIA_OFFSET_MS;
    return { day: weekDay === 0 ? 7 : weekDay, midnight };
}

// The time of a date in Colombia, as "HH:MM"
export function colombiaTime(date) {
    const { midnight } = colombiaDay(date);
    return timeOf(Math.floor((new Date(date).getTime() - midnight) / MINUTE_MS));
}

// The hours of one day, or null when the zone does not open that day
export const hoursOfDay = (zone, day) => (zone.schedule ?? []).find((s) => s.day === day) ?? null;

// The day of `date` and, when the zone opens that day, its hours and the
// opening and closing moments (hours is null on a closed day)
export function openingOfDay(zone, date) {
    const { day, midnight } = colombiaDay(date);
    const hours = hoursOfDay(zone, day);
    if (!hours) return { day, hours: null };
    return {
        day,
        hours,
        opensAt: new Date(midnight + minutesOf(hours.opensAt) * MINUTE_MS),
        closesAt: new Date(midnight + minutesOf(hours.closesAt) * MINUTE_MS),
    };
}

// "6:00 a. m. – 8:00 p. m."
export const hoursRange = (hours) => `${formatHour(hours.opensAt)} – ${formatHour(hours.closesAt)}`;

// AC-06: the hours of today, as the zone list and the map show them.
// "Abierta 24 horas", "Hoy: 6:00 a. m. – 8:00 p. m." or, on a closed day,
// "Cerrada hoy · Abre mañana a las 6:00 a. m." (decision 7).
export function todayHoursLabel(zone, now = Date.now()) {
    if (zone.open24h) return 'Abierta 24 horas';
    const { day } = colombiaDay(now);
    const today = hoursOfDay(zone, day);
    if (today) return `Hoy: ${hoursRange(today)}`;

    for (let ahead = 1; ahead <= 6; ahead++) {
        const next = ((day - 1 + ahead) % 7) + 1;
        const hours = hoursOfDay(zone, next);
        if (hours) {
            const when = ahead === 1 ? 'mañana' : `el ${dayName(next)}`;
            return `Cerrada hoy · Abre ${when} a las ${formatHour(hours.opensAt)}`;
        }
    }
    return 'Cerrada hoy';
}

// AC-06: the hours of the week, Monday to Sunday, for the reserve screen
export const weekHours = (zone) =>
    DAYS.map((day) => {
        const hours = hoursOfDay(zone, day);
        return { day, name: capitalized(dayName(day)), text: hours ? hoursRange(hours) : 'Cerrada' };
    });

// AC-03: the sentence for the hours of one day, as the API sends them in
// OUTSIDE_ZONE_HOURS and ZONE_CLOSED_THAT_DAY ({ day, opensAt, closesAt } or
// { day, closed: true }). Null when there are no hours to show.
export function hoursSentence(hours) {
    if (!hours || !DAY_NAMES[hours.day]) return null;
    if (hours.closed) return `Esta zona no abre los ${DAY_PLURALS[hours.day]}.`;
    return sentence(`El ${dayName(hours.day)} esta zona abre de ${formatHour(hours.opensAt)} a ${formatHour(hours.closesAt)}`);
}

// The latest entry of a day: 30 minutes before the closing time
export const lastEntry = (hours) => timeOf(minutesOf(hours.closesAt) - MIN_OPEN_MINUTES);

// AC-03 / AC-04: why the entry does not fit the hours of its day, or null.
// The whole day is closed, it is before the opening time, or it is less than
// 30 minutes before the closing time.
export function entryProblem(zone, start) {
    if (zone.open24h) return null;
    const opening = openingOfDay(zone, start);
    if (!opening.hours) return hoursSentence({ day: opening.day, closed: true });
    const startMs = new Date(start).getTime();
    if (startMs < opening.opensAt.getTime() || startMs > opening.closesAt.getTime() - MIN_OPEN_MINUTES * MINUTE_MS) {
        return `${hoursSentence({ day: opening.day, ...opening.hours })} ${sentence(`La entrada puede ser hasta las ${formatHour(lastEntry(opening.hours))}`)}`;
    }
    return null;
}

// AC-03: why the exit does not fit, or null. It must be on the same day as
// the entry, at the closing time at the latest. Only checked once the entry
// fits.
export function exitProblem(zone, start, end) {
    if (zone.open24h) return null;
    const opening = openingOfDay(zone, start);
    if (!opening.hours) return null;
    if (new Date(end).getTime() > opening.closesAt.getTime()) {
        return `${sentence(`El ${dayName(opening.day)} esta zona cierra a las ${formatHour(opening.hours.closesAt)}`)} La salida debe ser hasta esa hora.`;
    }
    return null;
}

// AC-04: when an open stay that starts at `start` ends by itself: the closing
// time of its day, or null in a zone open 24 hours (it lasts up to 24 hours).
export function closingOf(zone, start) {
    if (zone.open24h) return null;
    const opening = openingOfDay(zone, start);
    return opening.hours ? opening.closesAt : null;
}

// AC-03: the message of OUTSIDE_ZONE_HOURS or ZONE_CLOSED_THAT_DAY, with the
// hours of that day when the API sends them
export function hoursErrorMessage(code, hours) {
    const sentence = hoursSentence(hours);
    if (!sentence) return null;
    if (code === 'ZONE_CLOSED_THAT_DAY' || hours.closed) return sentence;
    return `${sentence} La reserva debe quedar dentro de ese horario, con la entrada al menos 30 minutos antes del cierre.`;
}
