// #309: the "Reservas por zona" chart of the admin panel. Every zone gets a
// row of the same height, so the names of the axis never overlap, however
// many zones there are. The chart is never shorter than before (260 px).
export const ZONE_CHART_ROW_HEIGHT = 36;
const ZONE_CHART_MIN_HEIGHT = 260;
// The numbers under the bars and the margins of the chart
const ZONE_CHART_AXIS_HEIGHT = 40;

export const zoneChartHeight = (zoneCount) =>
    Math.max(ZONE_CHART_MIN_HEIGHT, zoneCount * ZONE_CHART_ROW_HEIGHT + ZONE_CHART_AXIS_HEIGHT);

// The axis of the names is 110 px wide. Each name ends 8 px before the bars
// (the small line of the axis and its gap), so it has 102 px.
export const ZONE_AXIS_WIDTH = 110;
export const ZONE_AXIS_LABEL_WIDTH = ZONE_AXIS_WIDTH - 8;

// About 16 letters fit there at 12 px. A longer name is cut with "…"; the
// tooltip of its bar, the title of the name and the table for screen readers
// keep the complete name. Letters are counted as they are seen: an accent
// written as a second character, or an emoji, is one letter with the one
// before, so the cut never splits a letter in half.
export const ZONE_AXIS_MAX_CHARS = 16;

// Intl.Segmenter is in every browser of 2024 on and knows every way of
// writing a letter.
const letterSegmenter = typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('es', { granularity: 'grapheme' })
    : null;

// An older browser joins the characters itself: an accent or another mark, a
// skin tone, a joiner (ZWJ) and what follows it, or the tags of a regional
// flag go with the character before them, and the two halves of a flag
// ("🇨" "🇴") go together.
const JOINS_PREVIOUS = /^[\p{M}\p{Emoji_Modifier}\u200D\u{E0020}-\u{E007F}]$/u;
const FLAG_HALF = /^\p{Regional_Indicator}$/u;

function joinLetters(text) {
    const letters = [];
    let afterJoiner = false;
    for (const char of text) {
        const last = letters[letters.length - 1];
        const secondFlagHalf = FLAG_HALF.test(char) && FLAG_HALF.test(last ?? '');
        if (last !== undefined && (afterJoiner || secondFlagHalf || JOINS_PREVIOUS.test(char))) {
            letters[letters.length - 1] = last + char;
        } else {
            letters.push(char);
        }
        afterJoiner = char === '\u200D';
    }
    return letters;
}

const lettersOf = (text) => (letterSegmenter
    ? Array.from(letterSegmenter.segment(text), ({ segment }) => segment)
    : joinLetters(text));

export function shortZoneName(name, maxLetters = ZONE_AXIS_MAX_CHARS) {
    const letters = lettersOf(String(name ?? ''));
    if (letters.length <= maxLetters) return letters.join('');
    return `${letters.slice(0, maxLetters - 1).join('').trimEnd()}…`;
}

// Capital letters are wider, so 16 of them may not fit in the 102 px.
// measure(text) gives the width in px of a text as the chart draws it; the
// name is cut one letter more each time until it fits. Two letters ("A…")
// always fit.
export function fitZoneName(name, measure, maxWidth = ZONE_AXIS_LABEL_WIDTH) {
    for (let maxLetters = ZONE_AXIS_MAX_CHARS; maxLetters > 2; maxLetters--) {
        const label = shortZoneName(name, maxLetters);
        if (measure(label) <= maxWidth) return label;
    }
    return shortZoneName(name, 2);
}

// The tooltip of a bar has the complete name. Recharts writes it on one line,
// so a long name went out of the screen of a phone: now it wraps inside
// 200 px, which fits in the chart from 320 px up.
const ZONE_TOOLTIP_MAX_WIDTH = 200;
export const ZONE_TOOLTIP_STYLE = { maxWidth: ZONE_TOOLTIP_MAX_WIDTH, whiteSpace: 'normal', overflowWrap: 'anywhere' };

// Recharts puts the tooltip of a horizontal bar right after the names (the
// axis, 8 px of margin and 10 of distance). When the chart is too narrow for
// the tooltip to fit there, it starts at the left edge of the chart instead.
// undefined keeps the place Recharts chooses.
const TOOLTIP_FITS_FROM = ZONE_AXIS_WIDTH + 8 + 10 + ZONE_TOOLTIP_MAX_WIDTH + 16;
export const zoneTooltipPosition = (chartWidth) =>
    (chartWidth > 0 && chartWidth < TOOLTIP_FITS_FROM ? { x: 0 } : undefined);
