import { buildPinHtml, escapeHtml } from '../src/utils/zonePin';

// HU-25 AC-02/AC-03: the pins of the map are built as an HTML string, so the
// zone name (user data) must be escaped by hand. React did it before.
const MALICIOUS_NAME = `<img src=x onerror=alert(1)> & "double" 'single'`;

// The pin goes to the DOM the same way Leaflet puts it
const render = (html) => {
    const container = document.createElement('div');
    container.innerHTML = html;
    return container;
};

describe('escapeHtml', () => {
    test.each([
        ['&', '&amp;'],
        ['<', '&lt;'],
        ['>', '&gt;'],
        ['"', '&quot;'],
        ["'", '&#39;'],
        ['Zona Centro', 'Zona Centro'],
    ])('%s becomes %s', (text, escaped) => {
        expect(escapeHtml(text)).toBe(escaped);
    });

    test('escapes the ampersand first, so nothing is escaped twice', () => {
        expect(escapeHtml('<b>')).toBe('&lt;b&gt;');
    });
});

describe('buildPinHtml: zone name escaping', () => {
    test('a name with HTML is shown as text and nothing is created from it', () => {
        // Act
        const html = buildPinHtml(MALICIOUS_NAME, 5, 10);
        const pin = render(html);
        // Assert
        expect(html).not.toContain('<img');
        expect(pin.querySelector('img')).toBeNull();
        expect(pin.querySelector('.truncate').textContent).toBe(MALICIOUS_NAME);
    });

    test('a normal name is not changed', () => {
        const pin = render(buildPinHtml('Zona Centro', 5, 10));
        expect(pin.querySelector('.truncate').textContent).toBe('Zona Centro');
    });
});

describe('buildPinHtml: state of the pin (AC-02, AC-03)', () => {
    test.each([
        ['available', 5, 10, 'bg-parkea-600'],
        ['almost full', 1, 10, 'bg-warning'],
        ['full', 0, 10, 'bg-danger'],
    ])('a zone %s has the color %s', (_label, available, total, colorClass) => {
        const pin = render(buildPinHtml('Zona Centro', available, total));
        expect(pin.querySelector('.zone-marker-pin').classList.contains(colorClass)).toBe(true);
    });

    test('a full zone has the Ban icon', () => {
        const pin = render(buildPinHtml('Zona Centro', 0, 10));
        expect(pin.querySelector('svg circle')).not.toBeNull();
        expect(pin.querySelector('svg rect')).toBeNull();
    });

    test.each([
        ['available', 5, 10],
        ['almost full', 1, 10],
    ])('a zone %s has the SquareParking icon', (_label, available, total) => {
        const pin = render(buildPinHtml('Zona Centro', available, total));
        expect(pin.querySelector('svg rect')).not.toBeNull();
        expect(pin.querySelector('svg circle')).toBeNull();
    });

    test('the icon is hidden from screen readers', () => {
        const pin = render(buildPinHtml('Zona Centro', 5, 10));
        expect(pin.querySelector('svg').getAttribute('aria-hidden')).toBe('true');
    });
});

describe('buildPinHtml: text for screen readers (AC-02)', () => {
    test.each([
        [5, 10, ', Disponible, 5 de 10 cupos'],
        [1, 10, ', Casi llena, 1 de 10 cupos'],
        [0, 10, ', Llena, 0 de 10 cupos'],
    ])('%i of %i slots', (available, total, text) => {
        const pin = render(buildPinHtml('Zona Centro', available, total));
        expect(pin.querySelector('.sr-only').textContent).toBe(text);
    });
});
