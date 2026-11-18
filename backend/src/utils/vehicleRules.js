// The rules of the brand, the model and the color of a vehicle (#234).
// The frontend has the same rules in frontend/src/utils/vehicleRules.js, so a
// value is accepted or rejected the same way on both sides.

// Letters (any language, with accents and ñ), numbers, spaces, hyphens and
// periods: "Chevrolet", "Spark GT", "Mazda 3", "Gris plata", "Mercedes-Benz".
// Symbols such as < > @ # and emojis are not allowed.
const VEHICLE_TEXT_PATTERN = /^[\p{L}\p{N} .-]+$/u;

// At least one letter or number, so "...", "---" or ". -" are not a brand.
const LETTER_OR_NUMBER = /[\p{L}\p{N}]/u;

// The text as it is checked and saved. NFKC turns letters written with special
// fonts or full width ("Ｍａｚｄａ") into normal letters, joins an accent
// written apart with its letter and turns the no-break space of some keyboards
// into a normal space. Then the spaces at the ends go away and several spaces
// between words become one. A value that is not text is returned as it is,
// and isValidVehicleText rejects it.
function normalizeVehicleText(value) {
    if (typeof value !== 'string') return value;
    return value.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
}

function isValidVehicleText(value) {
    if (typeof value !== 'string') return false;
    const text = normalizeVehicleText(value);
    return VEHICLE_TEXT_PATTERN.test(text) && LETTER_OR_NUMBER.test(text);
}

module.exports = { normalizeVehicleText, isValidVehicleText };
