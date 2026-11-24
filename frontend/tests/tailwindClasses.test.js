/**
 * @jest-environment node
 */
import fs from 'fs';
import path from 'path';

// #310: two class names written together ("focus:outline-nonefocus:ring-2")
// are one unknown class for Tailwind, so both rules are lost; on a button
// that can remove the focus ring. This looks for a variant glued to the
// class before it in every file of src.
const GLUED_VARIANT = /(?:[a-z\])]|\d(?!xl:))(?:focus|focus-visible|hover|placeholder|disabled|sm|md|lg|xl|2xl):/g;

const filesOf = (dir) =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) return filesOf(full);
        return /\.(jsx?|css)$/.test(entry.name) ? [full] : [];
    });

describe('Tailwind classes (#310)', () => {
    test('no variant is glued to the class before it', () => {
        // Act
        const glued = filesOf(path.join(path.dirname(expect.getState().testPath), '..', 'src')).flatMap((file) =>
            [...fs.readFileSync(file, 'utf8').matchAll(GLUED_VARIANT)].map((match) => `${path.basename(file)}: ...${match.input.slice(match.index - 20, match.index + 20)}...`),
        );

        // Assert
        expect(glued).toEqual([]);
    });
});
