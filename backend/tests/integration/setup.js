// #373: runs in every integration test file, before the file loads the app
// or the models. They use the test database (globalSetup.js), never the one
// of DATABASE_URL: dotenv does not replace a variable that already exists, so
// .env cannot change it.
const { testDatabaseUrl } = require('./globalSetup');

process.env.DOTENV_CONFIG_QUIET = 'true';
process.env.DATABASE_URL = testDatabaseUrl();
// Only used to sign and check the tokens of the tests
process.env.JWT_SECRET = 'integration-only-secret';

const { sequelize } = require('../../src/models');

// The SQL of every query would fill the output of the tests
sequelize.options.logging = false;

afterAll(() => sequelize.close());
