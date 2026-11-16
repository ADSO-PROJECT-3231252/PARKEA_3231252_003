// #301: the SQL queries are not written to the log of the server in
// production. models/index.js reads NODE_ENV when it is loaded, so each test
// loads it again with the value it needs.
function sequelizeFor(env) {
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = env;
    let sequelize;
    try {
        jest.isolateModules(() => {
            ({ sequelize } = require('../src/models'));
        });
    } finally {
        process.env.NODE_ENV = previous;
    }
    return sequelize;
}

describe('SQL logging (#301)', () => {
    test('in production Sequelize does not write the queries to the log', () => {
        // Act
        const sequelize = sequelizeFor('production');

        // Assert
        expect(sequelize.options.logging).toBe(false);
    });

    test('in development it still writes them, to help while programming', () => {
        // Act
        const sequelize = sequelizeFor('development');

        // Assert
        expect(sequelize.options.logging).not.toBe(false);
    });
});
