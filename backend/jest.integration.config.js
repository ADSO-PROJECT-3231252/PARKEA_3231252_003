// #373: the integration tests, against a real MySQL database. They run with
// `npm run test:integration`; `npm test` leaves them out (package.json), so it
// keeps working without MySQL.
module.exports = {
    rootDir: __dirname,
    testMatch: ['<rootDir>/tests/integration/**/*.test.js'],
    globalSetup: '<rootDir>/tests/integration/globalSetup.js',
    setupFilesAfterEnv: ['<rootDir>/tests/integration/setup.js'],
    // Real queries, and some tests send many requests at the same time
    testTimeout: 30000,
    verbose: true,
};
