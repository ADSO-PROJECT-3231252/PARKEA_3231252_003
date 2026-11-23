/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

// #330: the motion of the home lives in the @theme of index.css. These checks
// keep the three rules of the card that no screen test can see.
const css = fs.readFileSync(path.join(path.dirname(expect.getState().testPath), '..', 'src', 'index.css'), 'utf8');

// The value of a theme variable, for example --animate-fade-up
const token = (name) => css.match(new RegExp(`${name}:\\s*([^;]+);`))?.[1];

// The body of a @keyframes rule
const keyframes = (name) => css.match(new RegExp(`@keyframes ${name}\\s*{([\\s\\S]*?)\\n {4}}`))?.[1];

// A time of CSS in milliseconds: 120ms or 2s
const ms = (value) => (value.endsWith('ms') ? Number(value.slice(0, -2)) : Number(value.slice(0, -1)) * 1000);

describe('The motion of the home (#330)', () => {
    test('it moves with translate, never with transform, so the hero illustration stays centered', () => {
        for (const name of ['fade-up', 'slide-in', 'float']) {
            // Act
            const body = keyframes(name);

            // Assert
            expect(body).toContain('translate:');
            expect(body).not.toContain('transform');
        }
    });

    test('the texts and the cards appear one after the other', () => {
        // Act
        const delays = ['--animate-fade-up', '--animate-fade-up-2', '--animate-fade-up-3'].map((name) => {
            const times = token(name).match(/\d+(?:\.\d+)?m?s/g);
            return times.length > 1 ? ms(times[1]) : 0;
        });

        // Assert
        expect(delays[0]).toBe(0);
        expect(delays[1]).toBeGreaterThan(delays[0]);
        expect(delays[2]).toBeGreaterThan(delays[1]);
    });

    test('the hero illustration stops moving before 5 seconds, so it needs no pause button (WCAG 2.2.2)', () => {
        // Arrange
        const value = token('--animate-hero-illustration');
        const [, duration, delay, times] = value.match(/float (\d+(?:\.\d+)?m?s) [a-z-]+ (\d+(?:\.\d+)?m?s) (\d+)/);

        // Assert
        expect(value).not.toContain('infinite');
        expect(ms(delay) + ms(duration) * Number(times)).toBeLessThan(5000);
    });
});
