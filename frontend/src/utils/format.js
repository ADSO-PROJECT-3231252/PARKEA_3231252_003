export function getInitials(fullName) {
    if (!fullName) return '?';
    return fullName
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((palabra) => palabra[0].toUpperCase())
        .join('');
}

export function formatDate(isoString) {
    return new Date(isoString).toLocaleDateString('es-CO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
    });
}

export function formatTime(isoString) {
    return new Date(isoString).toLocaleTimeString('es-CO', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
    });
}

export function formatCurrency(amount) {
    // Non-breaking space: "$" never ends a line apart from the number (#261)
    return `$\u00a0${Math.round(Number(amount)).toLocaleString('es-CO')}`;
}

// "2 horas 30 minutos" / "1 hora 00 minutos" / "30 minutos".
export const formatDuration = (startIso, endIso) => {
    const totalMinutes = Math.max(0, Math.round((new Date(endIso) - new Date(startIso)) / 60000));
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    const paddedMinutes = String(minutes).padStart(2, '0');
    if (hours === 0) return `${minutes} minutos`;
    return `${hours} ${hours === 1 ? 'hora' : 'horas'} ${paddedMinutes} minutos`;
};

// "mm:ss" for the 15-minute payment hold (HU-15, HU-17).
export function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

// The backend has no human-readable reservation code, only the UUID. The first
// 8 characters are shown as a short code (a prefix of the full ID that the
// confirmation screen displays). Shared by HU-16 and HU-18.
export const formatReservationCode = (id) => String(id).slice(0, 8).toUpperCase();

const pad = (n) => String(n).padStart(2, '0');

// "10/06/2026 08:30", 24-hour clock, in the user's local time (mockup format of
// the booking history). Shared by HU-18 and the HU-16 cancel dialog.
export function formatDateTime(isoString) {
    const d = new Date(isoString);
    const fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${fecha} ${hora}`;
}

// A time or an amount inside a sentence ("03:00 p. m.", "$ 2.500"), with its
// spaces made non-breaking so a line never splits it (HU-28 dialogs).
export const keepTogether = (text) => String(text).replace(/ /g, '\u00a0');

// #357: the date of formatDate ("16 de nov de 2026") that never splits across
// two lines, except before its year ("16 de nov" and "de 2026" in a narrow
// column). Without the year: "16 de nov", with the same day ("01 de dic").
function dayAndMonth(isoString, withYear) {
    const date = keepTogether(formatDate(isoString));
    if (withYear) return date.replace(/\u00a0(?=de\u00a0\d{4}$)/, ' ');
    return date.replace(/\u00a0de\u00a0\d{4}$/, '');
}

const yearOf = (isoString) => new Date(isoString).getFullYear();

// #357: the exit is on another day than the entry, in the time zone the
// dates are shown in (the one of the browser: in Colombia, Colombia time)
export const endsAnotherDay = (startIso, endIso) => formatDate(startIso) !== formatDate(endIso);

// #357: the dash between the entry and the exit. It stays with the entry, so
// a line that breaks there never starts with it.
const RANGE_DASH = '\u00a0– ';

// #357: the hours of a stay, for a line that already says the day of the
// entry: "01:08 p. m. – 03:00 p. m.". When the exit is on another day, it says
// that day too: "01:08 p. m. – 17 de nov, 11:18 a. m." (with the year when it
// is another year). A time never splits across two lines; the line can only
// break after the dash, after the comma and before a year.
export function formatStayHours(startIso, endIso) {
    const exitTime = keepTogether(formatTime(endIso));
    const exit = endsAnotherDay(startIso, endIso)
        ? `${dayAndMonth(endIso, yearOf(endIso) !== yearOf(startIso))}, ${exitTime}`
        : exitTime;
    return `${keepTogether(formatTime(startIso))}${RANGE_DASH}${exit}`;
}

// #357: a stay in one line, with its day: "16 de nov de 2026 · 01:08 p. m. –
// 03:00 p. m.". When the exit is on another day, each time goes with its own
// day: "16 de nov, 01:08 p. m. – 17 de nov, 11:18 a. m." (with the year in both
// when they are in different years).
export function formatStay(startIso, endIso) {
    if (!endsAnotherDay(startIso, endIso)) {
        return `${dayAndMonth(startIso, true)} · ${formatStayHours(startIso, endIso)}`;
    }
    const withYear = yearOf(endIso) !== yearOf(startIso);
    const at = (isoString) => `${dayAndMonth(isoString, withYear)}, ${keepTogether(formatTime(isoString))}`;
    return `${at(startIso)}${RANGE_DASH}${at(endIso)}`;
}
