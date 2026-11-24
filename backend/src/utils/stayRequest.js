// HU-14: the entry and exit times asked for a stay, checked in one place, so
// creating a reservation (POST /reservations) and asking how many spots are
// free for those hours (GET /zones/:id/availability, #375) accept the same
// times and answer the same errors.
const ErrorCodes = require('../constants/errorCodes');
const { provisionalEndTime } = require('./stayPricing');

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;

// AC-07: a stay lasts from 30 minutes to 24 hours
const STAY_MIN_MS = 30 * MINUTE_MS;
const STAY_MAX_MS = 24 * HOUR_MS;
// AC-19: up to 48 hours in advance
const MAX_ADVANCE_MS = 48 * HOUR_MS;

const fail = (status, code, message) => ({ error: { status, body: { code, message } } });

// Checks `startTime` and `endTime` (any value new Date() takes; the routes let
// only text through) for a stay that starts after `now`. An open stay
// (`openEnded` true, HU-27) has no exit time: it keeps the provisional one,
// entry + 24 hours, which the caller shortens to the closing time of a zone
// that is not open 24 hours (HU-29). Returns { start, end }, or { error } with
// the status and the body of the answer.
function checkStayTimes({ startTime, endTime, openEnded = false }, now = new Date()) {
    if (!startTime || (!openEnded && !endTime)) {
        return fail(400, ErrorCodes.MISSING_REQUIRED_FIELDS, openEnded ? 'startTime is required' : 'startTime and endTime are required');
    }

    const start = new Date(startTime);
    const end = openEnded ? provisionalEndTime(start) : new Date(endTime);
    // A value that is not a date ("abc") gives an invalid Date, and every
    // comparison below would let it through until the database rejects it
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
        return fail(400, ErrorCodes.INVALID_DATE, 'startTime and endTime must be valid dates');
    }

    if (start <= now) {
        return fail(400, ErrorCodes.START_TIME_IN_PAST, 'The start time must be in the future');
    }
    if (start - now > MAX_ADVANCE_MS) {
        return fail(400, ErrorCodes.RESERVATION_TOO_FAR_AHEAD, 'Reservations can only be made up to 48 hours in advance');
    }
    if (!openEnded && end <= start) {
        return fail(400, ErrorCodes.END_BEFORE_START, 'The end time must be after the start time');
    }
    if (!openEnded && (end - start < STAY_MIN_MS || end - start > STAY_MAX_MS)) {
        return fail(400, ErrorCodes.INVALID_DURATION, 'The reservation must last between 30 minutes and 24 hours');
    }

    return { start, end };
}

// HU-29 (AC-03, AC-05): a stay that does not fit the hours of its day. The
// answer carries the hours of that day ({ day, opensAt, closesAt } or
// { day, closed: true }), so the screen can show them.
function outsideHoursError(hours) {
    if (hours.closed) {
        return { status: 400, body: { code: ErrorCodes.ZONE_CLOSED_THAT_DAY, message: 'This zone does not open on that day', hours } };
    }
    return {
        status: 400,
        body: {
            code: ErrorCodes.OUTSIDE_ZONE_HOURS,
            message: `On that day this zone opens from ${hours.opensAt} to ${hours.closesAt}, and the entry must be at least 30 minutes before closing`,
            hours,
        },
    };
}

module.exports = { STAY_MIN_MS, STAY_MAX_MS, MAX_ADVANCE_MS, checkStayTimes, outsideHoursError };
