const { isTextOrMissing } = require('../src/utils/validation');

// isTextOrMissing is the first rule of every text field in the validators
// (#184): a missing value goes on to the "required" rule, and anything that
// is not text is rejected before it reaches a controller.
describe('isTextOrMissing', () => {
    test.each([
        ['text', 'admin@parkea.com'],
        ['empty text', ''],
        ['undefined (field not sent)', undefined],
        ['null', null],
    ])('accepts %s', (_label, value) => {
        // Act
        const result = isTextOrMissing(value);

        // Assert
        expect(result).toBe(true);
    });

    test.each([
        ['a list', ['admin@parkea.com']],
        ['an empty list', []],
        ['an object', { email: 'admin@parkea.com' }],
        ['a number', 1234],
        ['zero', 0],
        ['a boolean', true],
    ])('rejects %s', (_label, value) => {
        // Act
        const result = isTextOrMissing(value);

        // Assert
        expect(result).toBe(false);
    });
});
