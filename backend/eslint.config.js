// ESLint for the backend (#317): the rules ESLint recommends, the same ones
// the frontend uses. Run it with `npm run lint`.
const js = require('@eslint/js');
const globals = require('globals');
const { defineConfig } = require('eslint/config');

module.exports = defineConfig([
    {
        files: ['**/*.js'],
        extends: [js.configs.recommended],
        languageOptions: {
            sourceType: 'commonjs',
            globals: globals.node,
        },
        rules: {
            // Express knows the error handler of app.js by its four
            // arguments, so its `next` stays even if it is not used; and
            // sequelize-cli gives every migration (queryInterface, Sequelize)
            'no-unused-vars': ['error', { argsIgnorePattern: '^(next|Sequelize)$' }],
        },
    },
    // Jest tests: describe, test, expect and jest are globals there
    {
        files: ['tests/**/*.js'],
        languageOptions: {
            globals: { ...globals.node, ...globals.jest },
        },
    },
]);
