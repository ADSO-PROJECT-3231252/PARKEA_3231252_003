'use strict';

// #372: the columns the API always requires are required in the database too.
// users.phone stays optional (the primary administrator has none), and so does
// users.document_number: when a new sign-up takes the document of an account
// that was never verified and is in the admin log, that account keeps its row
// and loses only its document (HU-30, auth.controller.js releaseDocument).
// reservations.applied_hourly_rate loses its default of 0.00: every
// reservation saves the rate of its zone, and a missing one must fail instead
// of charging nothing.
const COLUMNS = [
    { table: 'users', column: 'document_type', type: (S) => S.ENUM('CC', 'TI', 'CE', 'PASSPORT') },
    { table: 'vehicles', column: 'brand', type: (S) => S.STRING(50) },
    { table: 'vehicles', column: 'model', type: (S) => S.STRING(50) },
    { table: 'vehicles', column: 'color', type: (S) => S.STRING(30) },
    { table: 'zones', column: 'address', type: (S) => S.STRING(255) },
    { table: 'zones', column: 'latitude', type: (S) => S.DECIMAL(10, 7) },
    { table: 'zones', column: 'longitude', type: (S) => S.DECIMAL(10, 7) },
];

module.exports = {
    async up(queryInterface, Sequelize) {
        // A NULL would make its ALTER fail with a message that does not say
        // which row. Count them all first, and change nothing if there is any.
        const missing = [];
        for (const { table, column } of COLUMNS) {
            const [[{ total }]] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) AS total FROM ${table} WHERE ${column} IS NULL`
            );
            if (Number(total) > 0) missing.push(`${table}.${column}: ${total} row(s)`);
        }
        if (missing.length > 0) {
            throw new Error(`Fill in these NULL values before this migration, nothing was changed: ${missing.join('; ')}`);
        }

        // Each ALTER can run again after a failure halfway: it only sets the
        // final definition of the column
        for (const { table, column, type } of COLUMNS) {
            await queryInterface.changeColumn(table, column, { type: type(Sequelize), allowNull: false });
        }
        await queryInterface.changeColumn('reservations', 'applied_hourly_rate', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
        });
    },

    async down(queryInterface, Sequelize) {
        for (const { table, column, type } of COLUMNS) {
            await queryInterface.changeColumn(table, column, { type: type(Sequelize), allowNull: true });
        }
        await queryInterface.changeColumn('reservations', 'applied_hourly_rate', {
            type: Sequelize.DECIMAL(10, 2),
            allowNull: false,
            defaultValue: 0.00,
        });
    },
};
