// HU-29: the opening hours of a zone. Shared by the zones controller (to
// check the hours an admin saves) and the reservations controller (to check
// that a stay fits inside the hours), so the rules are always the same.
//
// The hours are in Colombia time. Colombia is always UTC-5 (it has no
// daylight saving time), so the day and the time are calculated from UTC and
// do not depend on the time zone of the server.

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const COLOMBIA_OFFSET_MS = 5 * HOUR_MS;

// The entry must be at least 30 minutes before the closing time (decision 4)
const MIN_BEFORE_CLOSING_MS = 30 * MINUTE_MS;
// An open stay in a zone open 24 hours ends 24 hours after the entry (HU-27)
const MAX_STAY_MS = 24 * HOUR_MS;

// "HH:MM" from 00:00 to 23:59
const TIME_FORMAT = /^([01]\d|2[0-3]):[0-5]\d$/;

const isTime = (value) => typeof value === 'string' && TIME_FORMAT.test(value);

// "06:30" -> 390
function minutesOf(time) {
    const [hours, minutes] = time.split(':').map(Number);
    return hours * 60 + minutes;
}

// The day of the week in Colombia (1 = Monday ... 7 = Sunday) and the moment
// that day starts (midnight in Colombia), for any date
function colombiaDay(date) {
    const local = new Date(new Date(date).getTime() - COLOMBIA_OFFSET_MS);
    const weekDay = local.getUTCDay();
    const midnight = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + COLOMBIA_OFFSET_MS;
    return { day: weekDay === 0 ? 7 : weekDay, midnight };
}

// The hours of one day ({ day, opensAt, closesAt }), or null when the zone
// does not open that day. `schedule` is the list the API sends (Zona.toJSON).
function hoursOfDay(schedule, day) {
    return (schedule || []).find((s) => s.day === day) || null;
}

// The schedule of a zone as the API sends it (Zona.toJSON). The zone must be
// read with its schedules: without them every day would look closed, so that
// mistake stops here instead of rejecting every reservation.
function scheduleOf(zona) {
    const { schedule } = typeof zona.toJSON === 'function' ? zona.toJSON() : zona;
    if (!Array.isArray(schedule)) throw new Error('The zone was read without its schedules');
    return schedule;
}

// The day of `date` and, when the zone opens that day, its hours and the
// opening and closing moments (hours is null on a closed day)
function openingOfDay(schedule, date) {
    const { day, midnight } = colombiaDay(date);
    const hours = hoursOfDay(schedule, day);
    if (!hours) return { day, hours: null };
    return {
        day,
        hours,
        opensAt: new Date(midnight + minutesOf(hours.opensAt) * MINUTE_MS),
        closesAt: new Date(midnight + minutesOf(hours.closesAt) * MINUTE_MS),
    };
}

// What the API answers when a stay does not fit: the hours of the day of the
// entry, so the screen can show them (AC-03)
function hoursProblem(day, hours) {
    return hours
        ? { day, opensAt: hours.opensAt, closesAt: hours.closesAt }
        : { day, closed: true };
}

// Checks a stay that starts at `start` and ends at `end` (null for an open
// stay). Returns { problem } when it does not fit the hours of its day, or
// { closesAt } with the closing time of that day (null in a zone open 24
// hours), which is where an open stay ends (decisions 3, 4 and 6).
function checkStay(zona, start, end = null) {
    if (zona.open24h) return { closesAt: null };

    const opening = openingOfDay(scheduleOf(zona), start);
    if (!opening.hours) return { problem: hoursProblem(opening.day, null) };

    const startMs = new Date(start).getTime();
    const fits = startMs >= opening.opensAt.getTime()
        && startMs <= opening.closesAt.getTime() - MIN_BEFORE_CLOSING_MS
        && (end === null || new Date(end).getTime() <= opening.closesAt.getTime());
    if (!fits) return { problem: hoursProblem(opening.day, opening.hours) };

    return { closesAt: opening.closesAt };
}

// The latest exit time a stay that started at `start` can have now: 24 hours
// after the entry in a zone open 24 hours, or the closing time of the day of
// the entry with the current hours (decision 8: new hours apply to
// extensions). Null when the zone no longer opens that day.
function latestExit(zona, start) {
    if (zona.open24h) return new Date(new Date(start).getTime() + MAX_STAY_MS);
    const opening = openingOfDay(scheduleOf(zona), start);
    return opening.hours ? opening.closesAt : null;
}

// The hours of the day of `start`, in the shape of hoursProblem, for the
// errors of the extensions
function hoursOfStart(zona, start) {
    const opening = openingOfDay(scheduleOf(zona), start);
    return hoursProblem(opening.day, opening.hours);
}

// Checks the hours an admin sends for a zone that is not open 24 hours
// (AC-02). Returns the list of errors, empty when the schedule is valid. An
// error about one day carries that day, so the form can show it next to it.
function scheduleErrors(schedule) {
    if (!Array.isArray(schedule) || schedule.length === 0) {
        return [{ path: 'schedule', msg: 'At least one day must be open' }];
    }
    if (schedule.length > 7) {
        return [{ path: 'schedule', msg: 'schedule can have at most 7 days' }];
    }

    const errors = [];
    const seen = new Set();
    for (const item of schedule) {
        const day = item?.day;
        if (!Number.isInteger(day) || day < 1 || day > 7) {
            errors.push({ path: 'schedule', msg: 'Each day must be a whole number from 1 (Monday) to 7 (Sunday)' });
            continue;
        }
        if (seen.has(day)) {
            errors.push({ path: 'schedule', day, msg: `Day ${day} appears more than once` });
            continue;
        }
        seen.add(day);
        if (!isTime(item.opensAt) || !isTime(item.closesAt)) {
            errors.push({ path: 'schedule', day, msg: `On day ${day}, opensAt and closesAt must be times from 00:00 to 23:59` });
            continue;
        }
        if (minutesOf(item.closesAt) - minutesOf(item.opensAt) < 30) {
            errors.push({ path: 'schedule', day, msg: `On day ${day}, the opening time must be at least 30 minutes before the closing time` });
        }
    }
    return errors;
}

module.exports = {
    checkStay,
    latestExit,
    hoursOfStart,
    scheduleErrors,
    colombiaDay,
};
