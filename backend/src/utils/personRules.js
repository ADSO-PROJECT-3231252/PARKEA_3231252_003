// The rules of the full name and the phone of a person (HU-01, HU-08, #312).
// The frontend has the same rules in frontend/src/utils/personRules.js, so a
// value is accepted or rejected the same way on both sides.

const NAME_MIN_LENGTH = 2;
const NAME_MAX_LENGTH = 70;

// Words of letters (any language, with accents) joined by one space, hyphen or
// apostrophe (straight or curly, as phone keyboards write it). It starts and
// ends with a letter, so "-", "Ana-" or "Ana --- ''" are not names. A letter
// can carry at most two accent marks written apart, which stops text piled
// with marks above and below the line.
const NAME_PATTERN = /^\p{L}\p{M}{0,2}(?:[ '’-]?\p{L}\p{M}{0,2})*$/u;

// A Colombian mobile number: 10 digits, the first one is 3. \d is only 0-9.
const PHONE_PATTERN = /^3\d{9}$/;

// The name as it is checked and saved. NFKC turns letters written with
// special fonts or full width ("𝓐𝓷𝓪", "Ａｎａ") into normal letters, joins an
// accent written apart with its letter and turns the no-break space of some
// keyboards into a normal space. Then the spaces at the ends go away and
// several spaces between words become one. A value that is not text is
// returned as it is, and isValidName rejects it.
function normalizeName(value) {
    if (typeof value !== 'string') return value;
    return value.normalize('NFKC').trim().replace(/ {2,}/g, ' ');
}

// The length is checked before the pattern, so a very long text is rejected
// without reading it all.
function isValidName(value) {
    if (typeof value !== 'string') return false;
    const name = normalizeName(value);
    return name.length >= NAME_MIN_LENGTH && name.length <= NAME_MAX_LENGTH && NAME_PATTERN.test(name);
}

function isValidPhone(value) {
    return typeof value === 'string' && PHONE_PATTERN.test(value.trim());
}

module.exports = { normalizeName, isValidName, isValidPhone, NAME_MIN_LENGTH, NAME_MAX_LENGTH };
