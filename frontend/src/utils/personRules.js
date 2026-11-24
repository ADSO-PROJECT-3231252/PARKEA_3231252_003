// The rules of the full name and the phone of a person (HU-01, HU-08, #312).
// The backend has the same rules in backend/src/utils/personRules.js, so a
// value is accepted or rejected the same way on both sides.

export const NAME_MIN_LENGTH = 2;
export const NAME_MAX_LENGTH = 70;

// Words of letters (any language, with accents) joined by one space, hyphen or
// apostrophe (straight or curly, as phone keyboards write it). It starts and
// ends with a letter, so "-", "Ana-" or "Ana --- ''" are not names. A letter
// can carry at most two accent marks written apart, which stops text piled
// with marks above and below the line.
const NAME_PATTERN = /^\p{L}\p{M}{0,2}(?:[ '’-]?\p{L}\p{M}{0,2})*$/u;

// Characters that are drawn as nothing, like the Hangul filler "ㅤ". They
// count as letters for NAME_PATTERN, but a name made of them looks empty.
const INVISIBLE = /\p{Default_Ignorable_Code_Point}/u;

// A Colombian mobile number: 10 digits, the first one is 3. \d is only 0-9.
const PHONE_PATTERN = /^3\d{9}$/;

// The name as it is checked and saved. NFKC turns letters written with
// special fonts or full width ("𝓐𝓷𝓪", "Ａｎａ") into normal letters, joins an
// accent written apart with its letter and turns the no-break space of some
// keyboards into a normal space. Then the spaces at the ends go away and
// several spaces between words become one. A value that is not text is
// returned as it is, and isValidName rejects it.
export function normalizeName(value) {
    if (typeof value !== 'string') return value;
    return value.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
}

// Count Unicode code points after normalization so a letter like 𠮷 counts once.
export function isValidName(value) {
    if (typeof value !== 'string') return false;
    const name = normalizeName(value);
    const length = [...name].length;

    return length >= NAME_MIN_LENGTH && length <= NAME_MAX_LENGTH && NAME_PATTERN.test(name) && !INVISIBLE.test(name);
}

export function isValidPhone(value) {
    return typeof value === 'string' && PHONE_PATTERN.test(value.trim());
}

// The messages of the forms when a value breaks these rules
export const NAME_RULE_MESSAGE = "Usa solo letras, separadas por un espacio, un guion (-) o un apóstrofo ('), entre 2 y 70 caracteres.";
export const PHONE_RULE_MESSAGE = 'Ingresa un celular de 10 dígitos que empiece por 3.';
