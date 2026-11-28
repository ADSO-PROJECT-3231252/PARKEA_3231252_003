import { renderToStaticMarkup } from 'react-dom/server';
import { Ban, SquareParking } from 'lucide-react';
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

    test('the title has the complete name, also escaped (#309)', () => {
        // Act
        const pin = render(buildPinHtml(MALICIOUS_NAME, 5, 10));

        // Assert: the attribute keeps the text, and nothing escapes from it
        const label = pin.querySelector('.truncate');
        expect(label.getAttribute('title')).toBe(MALICIOUS_NAME);
        expect(label.attributes).toHaveLength(2);
        expect(pin.querySelector('img')).toBeNull();
    });
});

describe('buildPinHtml: a long name (#309)', () => {
    test('is cut on the map and its title shows it complete', () => {
        // Arrange
        const name = 'Parqueadero Público Municipal del Centro Comercial Gran Plaza';

        // Act
        const label = render(buildPinHtml(name, 5, 10)).querySelector('.truncate');

        // Assert
        expect(label).toHaveClass('max-w-[160px]', 'truncate');
        expect(label).toHaveAttribute('title', name);
        expect(label.textContent).toBe(name);
    });
});

describe('buildPinHtml: state of the pin (AC-02, AC-03)', () => {
    test.each([
        { label: 'available', available: 5, colorClass: 'bg-parkea-600' },
        { label: 'almost full', available: 1, colorClass: 'bg-warning' },
        { label: 'full', available: 0, colorClass: 'bg-danger' },
    ])('a zone $label has the color $colorClass', ({ available, colorClass }) => {
        const pin = render(buildPinHtml('Zona Centro', available, 10));
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

// HU-31 AC-09: with the filter of a type, the pin is of the spots of that type
describe('buildPinHtml: the pin of a type', () => {
    test.each([
        ['motorcycle', 0, 4, ', Llena, 0 de 4 cupos de motos'],
        ['truck', 3, 3, ', Disponible, 3 de 3 cupos de camiones'],
    ])('of %s says the type to screen readers', (type, available, total, text) => {
        const pin = render(buildPinHtml('Zona Centro', available, total, type));
        expect(pin.querySelector('.sr-only').textContent).toBe(text);
    });
});

// The pin draws its icons by hand (see utils/zonePin.js). This fails if they
// stop matching the installed lucide-react, for example after an upgrade.
describe('buildPinHtml: icons copied from lucide-react', () => {
    const LUCIDE_ATTRS = ['viewBox', 'fill', 'stroke', 'stroke-width', 'stroke-linecap', 'stroke-linejoin'];

    test.each([
        ['an available zone', 5, SquareParking],
        ['a full zone', 0, Ban],
    ])('%s draws the same icon as lucide-react', (_label, available, Icon) => {
        const pin = render(buildPinHtml('Zona Centro', available, 10)).querySelector('svg');
        const lucide = render(renderToStaticMarkup(<Icon />)).querySelector('svg');
        expect(pin.innerHTML).toBe(lucide.innerHTML);
        LUCIDE_ATTRS.forEach((name) => expect(pin.getAttribute(name)).toBe(lucide.getAttribute(name)));
    });
});
