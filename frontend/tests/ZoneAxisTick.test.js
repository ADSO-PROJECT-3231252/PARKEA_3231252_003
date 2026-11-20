import { act, render } from '@testing-library/react';
import ZoneAxisTick from '../src/components/ZoneAxisTick';

// #309: one name of the axis of "Reservas por zona"
const LONG_NAME = 'Parqueadero Público Municipal del Centro Comercial y Empresarial Gran Plaza de Dosquebradas Etapa 22';
const CAPITALS = 'PARQUEADERO MUNICIPAL DEL CENTRO';

// Recharts gives these props to the tick of a left axis
const renderTick = (name) => render(
    <svg>
        <ZoneAxisTick
            x={110}
            y={40}
            textAnchor="end"
            fill="#666"
            className="recharts-cartesian-axis-tick-value"
            payload={{ value: name }}
        />
    </svg>,
);

const shownText = (container) => container.querySelector('text');
const titleOf = (container) => container.querySelector('title');

describe('In the tests (jsdom does not draw, so nothing is measured)', () => {
    test('a short name is shown complete, without a title', () => {
        // Act
        const { container } = renderTick('Centro');

        // Assert
        expect(shownText(container)).toHaveTextContent(/^Centro$/);
        expect(titleOf(container)).toBeNull();
    });

    test('a long name shows 16 letters with "…" and its title has it complete', () => {
        // Act
        const { container } = renderTick(LONG_NAME);

        // Assert
        expect(shownText(container)).toHaveTextContent(/^Parqueadero Púb…$/);
        expect(titleOf(container)).toHaveTextContent(LONG_NAME);
    });

    test('it is drawn where Recharts says, at 12 px and centered on its row', () => {
        // Act
        const { container } = renderTick('Centro');

        // Assert
        const text = shownText(container);
        expect(text).toHaveAttribute('x', '110');
        expect(text).toHaveAttribute('y', '40');
        expect(text).toHaveAttribute('dy', '0.355em');
        expect(text).toHaveAttribute('text-anchor', 'end');
        expect(text).toHaveAttribute('font-size', '12');
        expect(text).toHaveAttribute('fill', '#666');
        expect(text).toHaveClass('recharts-cartesian-axis-tick-value');
    });

    test('a missing name shows nothing', () => {
        // Act
        const { container } = render(<svg><ZoneAxisTick x={110} y={40} /></svg>);

        // Assert
        expect(shownText(container)).toHaveTextContent(/^$/);
        expect(titleOf(container)).toBeNull();
    });
});

describe('In a browser, the name is measured so it fits in the axis', () => {
    // Each letter as wide as the test says. Only a hidden copy is measured,
    // never the name that is shown. Like in a browser, a text that is not in
    // the page measures 0.
    let letterWidth;
    let measured;

    beforeEach(() => {
        letterWidth = 8;
        measured = [];
        SVGElement.prototype.getComputedTextLength = function getComputedTextLength() {
            if (!this.isConnected) return 0;
            measured.push({ text: this.textContent, hidden: this.getAttribute('visibility') === 'hidden' });
            return Array.from(this.textContent).length * letterWidth;
        };
    });

    afterEach(() => {
        delete SVGElement.prototype.getComputedTextLength;
        delete document.fonts;
    });

    test('capital letters are cut more, until they fit in the 102 px', () => {
        // Act: letters of 8 px, so 12 letters (96 px) fit
        const { container } = renderTick(CAPITALS);

        // Assert
        expect(shownText(container)).toHaveTextContent(/^PARQUEADERO…$/);
        expect(titleOf(container)).toHaveTextContent(CAPITALS);
    });

    test('the measures are taken on a hidden copy, which is then removed', () => {
        // Act
        const { container } = renderTick(CAPITALS);

        // Assert
        expect(measured.length).toBeGreaterThan(0);
        expect(measured.every(({ hidden }) => hidden)).toBe(true);
        expect(container.querySelectorAll('text')).toHaveLength(1);
        expect(shownText(container)).not.toHaveAttribute('visibility');
    });

    test('a name that fits is not cut and has no title', () => {
        // Act
        const { container } = renderTick('Centro');

        // Assert
        expect(shownText(container)).toHaveTextContent(/^Centro$/);
        expect(titleOf(container)).toBeNull();
    });

    test('when the font of the page arrives, the name is measured again', () => {
        // Arrange: before the font, the letters are wider
        document.fonts = new EventTarget();
        const { container } = renderTick(CAPITALS);
        expect(shownText(container)).toHaveTextContent(/^PARQUEADERO…$/);

        // Act: with the font, they are 6 px
        letterWidth = 6;
        act(() => {
            document.fonts.dispatchEvent(new Event('loadingdone'));
        });

        // Assert: 16 letters (96 px) fit now
        expect(shownText(container)).toHaveTextContent(/^PARQUEADERO MUN…$/);
    });

    test('once the chart is gone, a font that arrives measures nothing', () => {
        // Arrange
        document.fonts = new EventTarget();
        const { unmount } = renderTick(CAPITALS);
        unmount();
        measured = [];

        // Act
        document.fonts.dispatchEvent(new Event('loadingdone'));

        // Assert
        expect(measured).toEqual([]);
    });
});
