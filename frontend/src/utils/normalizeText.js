// Lowercase text without accents, so a search for "simon" finds "Simón".
// NFD splits each accented letter into the letter plus its accent mark, and
// the regex removes the marks. The tilde of "ñ" is a mark too, so "ñ" becomes
// "n". A missing value (a zone without address) becomes an empty text.
export function normalizeText(value) {
    return String(value ?? '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}
