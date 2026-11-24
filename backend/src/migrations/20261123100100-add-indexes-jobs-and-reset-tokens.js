'use strict';

// #372: the two jobs look every minute for the reservations whose hold or
// whose time is over (expirar-reservas and finalizar-reservas), and the
// password recovery looks a link up by its hash. Without these indexes, each
// of those queries reads the whole table.
const INDEXES = [
    { table: 'reservations', fields: ['status', 'hold_expires_at'], name: 'reservations_status_hold_expires_at_idx' },
    { table: 'reservations', fields: ['status', 'end_time'], name: 'reservations_status_end_time_idx' },
    { table: 'password_reset_tokens', fields: ['token_hash'], name: 'password_reset_tokens_token_hash_idx' },
];

// MySQL does not undo the statements of a migration that fails halfway, so
// up and down only add or remove what is missing or still there.
async function hasIndex(queryInterface, table, name) {
    const indexes = await queryInterface.showIndex(table);
    return indexes.some((index) => index.name === name);
}

module.exports = {
    async up(queryInterface) {
        for (const { table, fields, name } of INDEXES) {
            if (!(await hasIndex(queryInterface, table, name))) {
                await queryInterface.addIndex(table, fields, { name });
            }
        }
    },

    async down(queryInterface) {
        for (const { table, name } of INDEXES) {
            if (await hasIndex(queryInterface, table, name)) {
                await queryInterface.removeIndex(table, name);
            }
        }
    },
};
