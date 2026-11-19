// The rules of the brand, the model and the color of a vehicle (#234).
// The frontend has the same rules in frontend/src/utils/vehicleRules.js, so a
// value is accepted or rejected the same way on both sides.

// Letters (any language, with accents and ñ), numbers, spaces, hyphens and
// periods: "Chevrolet", "Spark GT", "Mazda 3", "Gris plata", "Mercedes-Benz".
// Symbols such as < > @ # and emojis are not allowed.
const VEHICLE_TEXT_PATTERN = /^[\p{L}\p{N} .-]+$/u;

// The same, for the text as the user typed it, before normalizing: it also
// lets through the accent marks written apart ("e" and "¨") and the spaces of
// other keyboards (no-break, full width). It must run before NFKC, because NFKC
// turns some symbols into letters: "Ⓜ" becomes "M" and "™" becomes "TM", and
// after that they would pass VEHICLE_TEXT_PATTERN. Numbers are only digits
// (\p{Nd}): \p{N} would also let through "①", "²" and "Ⅲ", which NFKC writes as
// "1", "2" and "III".
const TYPED_TEXT_PATTERN = /^[\p{L}\p{Nd}\p{M}\p{Zs}.-]+$/u;

// Small letters written above another ("ᵀᴹ", "ª") and letters that look like
// a sign ("ʼ", "ˆ"). NFKC would turn the small ones into normal letters, like
// "™" into "TM".
const MODIFIER_LETTER = /[\p{Lm}ªº]/u;

// At least one letter or number, so "...", "---" or ". -" are not a brand.
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

// Characters that are drawn as nothing, like the Hangul filler "ㅤ" (U+3164).
// They count as letters, but a brand made of them looks empty. It is the same
// check as personRules.js.
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;

// The text as it is saved. NFKC turns letters written with special fonts or
// full width ("Ｍａｚｄａ") into normal letters, joins an accent written apart
// with its letter and turns the no-break space of some keyboards into a normal
// space. Then the spaces at the ends go away and several spaces between words
// become one. A value that is not text is returned as it is, and
// isValidVehicleText rejects it.
function normalizeVehicleText(value) {
    if (typeof value !== 'string') return value;
    return value.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
}

// It takes the text as typed: first the typed text is checked, then the
// normalized one, which is the one that is saved.
function isValidVehicleText(value) {
    if (typeof value !== 'string') return false;
    if (INVISIBLE.test(value) || MODIFIER_LETTER.test(value) || !TYPED_TEXT_PATTERN.test(value.trim())) return false;

    const text = normalizeVehicleText(value);
    return !INVISIBLE.test(text) && VEHICLE_TEXT_PATTERN.test(text) && LETTER_OR_NUMBER.test(text);
}

module.exports = { normalizeVehicleText, isValidVehicleText };
