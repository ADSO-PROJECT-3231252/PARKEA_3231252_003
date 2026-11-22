import { act, render, screen } from '@testing-library/react';
import Reveal from '../src/components/Reveal';

// #330: a card of the home appears the first time it scrolls into view
const HIDDEN = 'motion-safe:opacity-0 print:opacity-100';
const STEPS = ['motion-safe:animate-fade-up', 'motion-safe:animate-fade-up-2', 'motion-safe:animate-fade-up-3'];

const renderCards = (count = 3) => render(
    <section>
        {Array.from({ length: count }, (_, i) => (
            <Reveal key={i} step={i} className="card">{`Tarjeta ${i + 1}`}</Reveal>
        ))}
    </section>,
);

const card = (n) => screen.getByText(`Tarjeta ${n}`);

// A fake IntersectionObserver: the test says when each card scrolls into view
let observers;
class FakeObserver {
    constructor(callback, options) {
        this.callback = callback;
        this.options = options;
        this.observe = jest.fn((element) => {
            this.element = element;
        });
        this.disconnect = jest.fn();
        observers.push(this);
    }
}
const observerOf = (element) => observers.find((observer) => observer.element === element);

describe('Reveal (#330)', () => {
    afterEach(() => {
        delete globalThis.IntersectionObserver;
    });

    test('without IntersectionObserver the cards show at once, each at its step', () => {
        // Act
        renderCards();

        // Assert
        expect(card(1).className).toBe(`card ${STEPS[0]}`);
        expect(card(2).className).toBe(`card ${STEPS[1]}`);
        expect(card(3).className).toBe(`card ${STEPS[2]}`);
    });

    describe('with IntersectionObserver', () => {
        beforeEach(() => {
            observers = [];
            globalThis.IntersectionObserver = FakeObserver;
        });

        test('each card waits until a part of it scrolls into view, and then rises at its step', () => {
            // Arrange
            renderCards();
            expect(observers).toHaveLength(3);
            expect(observerOf(card(2)).options).toEqual({ threshold: 0.15 });
            expect(card(1).className).toBe(`card ${HIDDEN}`);

            // Act: the second card is still out of view
            act(() => observerOf(card(2)).callback([{ isIntersecting: false }]));

            // Assert
            expect(card(2).className).toBe(`card ${HIDDEN}`);

            // Act: it scrolls into view
            act(() => observerOf(card(2)).callback([{ isIntersecting: true }]));

            // Assert: only that one appears, at its step, and it is no longer watched
            expect(card(2).className).toBe(`card ${STEPS[1]}`);
            expect(card(1).className).toBe(`card ${HIDDEN}`);
            expect(card(3).className).toBe(`card ${HIDDEN}`);
            expect(observerOf(card(2)).disconnect).toHaveBeenCalled();
            expect(observerOf(card(1)).disconnect).not.toHaveBeenCalled();
        });

        test('a fourth card takes the step of the third one', () => {
            // Arrange
            renderCards(4);

            // Act
            act(() => observerOf(card(4)).callback([{ isIntersecting: true }]));

            // Assert
            expect(card(4).className).toBe(`card ${STEPS[2]}`);
        });

        test('leaving the page stops watching the cards', () => {
            // Arrange
            const { unmount } = renderCards();

            // Act
            unmount();

            // Assert
            for (const observer of observers) expect(observer.disconnect).toHaveBeenCalled();
        });
    });

    test('a card without classes of its own gets only its step', () => {
        // Act
        render(<Reveal>Sola</Reveal>);

        // Assert
        expect(screen.getByText('Sola').className).toBe(STEPS[0]);
    });
});
