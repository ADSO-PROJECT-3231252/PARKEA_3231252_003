// #373: the integration tests (npm run test:integration) use a real MySQL
// database, built from zero before they run, with the migrations and the
// seeders, like `npm run db:reset`. Its address is TEST_DATABASE_URL (.env),
// and its name must end in _test: everything in it is deleted every time.
const path = require('path');
const { execFileSync } = require('child_process');

const BACKEND = path.resolve(__dirname, '../..');
const SEQUELIZE_CLI = require.resolve('sequelize-cli/lib/sequelize');

// The address of the test database, from the environment or from .env. It
// stops here when it is missing or when its name does not end in _test, so
// the tests can never empty the database of the project.
function testDatabaseUrl() {
    require('dotenv').config({ path: path.join(BACKEND, '.env'), quiet: true });
    const url = process.env.TEST_DATABASE_URL;
    if (!url) {
        throw new Error('TEST_DATABASE_URL is missing: add it to backend/.env (see .env.example)');
    }
    const name = decodeURIComponent(new URL(url).pathname.slice(1));
    if (!name.endsWith('_test')) {
        throw new Error(`The database of TEST_DATABASE_URL is "${name}": its name must end in _test, because the integration tests delete it`);
    }
    return url;
}

// One command of sequelize-cli against the test database. Its output is
// shown only if it fails.
function sequelizeCli(command, url) {
    try {
        execFileSync(process.execPath, [SEQUELIZE_CLI, command], {
            cwd: BACKEND,
            env: { ...process.env, DATABASE_URL: url, NODE_ENV: 'test' },
            stdio: 'pipe',
        });
    } catch (error) {
        const output = `${error.stdout ?? ''}${error.stderr ?? ''}`;
        throw new Error(`sequelize-cli ${command} failed:\n${output}`, { cause: error });
    }
}

module.exports = () => {
    // Like the unit tests (tests/timezone.js): the server can be in any time
    // zone, and the dates of the API do not depend on it
    process.env.TZ = 'UTC';
    const url = testDatabaseUrl();
    for (const command of ['db:drop', 'db:create', 'db:migrate', 'db:seed:all']) {
        sequelizeCli(command, url);
    }
};

module.exports.testDatabaseUrl = testDatabaseUrl;
