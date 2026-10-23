// Runs before every test file (see "jest" in package.json).
//
// The tests never connect to MySQL. models/index.js only needs a DATABASE_URL
// to create the Sequelize object, and Sequelize does not connect until the
// first query, so a placeholder is enough. It is set before dotenv reads
// .env, and dotenv never replaces a variable that already exists, so the
// tests can't touch a real database even if .env has one.
process.env.DATABASE_URL = 'mysql://jest:jest@127.0.0.1:3306/parkea_jest_not_used';

// Only used to sign and check tokens inside the tests
process.env.JWT_SECRET = 'jest-only-secret';

// dotenv 17 prints a tip every time it loads; it would show up between the
// test results as a console.log.
process.env.DOTENV_CONFIG_QUIET = 'true';
