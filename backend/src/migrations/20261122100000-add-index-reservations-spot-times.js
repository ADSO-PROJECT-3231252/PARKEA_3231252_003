'use strict';

// #373: a spot is free for some hours when none of its Pending or Active
// reservations overlaps them, and every reservation, extension and list of
// zones asks it. The index finds the reservations of one spot by status and
// time, without reading the whole table.
module.exports = {
    async up(queryInterface) {
        await queryInterface.addIndex('reservations', ['parking_spot_id', 'status', 'start_time', 'end_time'], {
            name: 'reservations_spot_status_times_idx',
        });
        // MySQL drops by itself only the index it made for the foreign key.
        // After an undo, the one made by the down is still there and this
        // index already serves the foreign key, so it is removed: the table
        // ends the same as on a new database, and the down can make it again.
        const indexes = await queryInterface.showIndex('reservations');
        if (indexes.some((index) => index.name === 'reservations_parking_spot_id_foreign_idx')) {
            await queryInterface.removeIndex('reservations', 'reservations_parking_spot_id_foreign_idx');
        }
    },

    // MySQL dropped the index of the foreign key of parking_spot_id when this
    // one was added, because it starts with the same column; the foreign key
    // needs one, so it is made again before this one is removed
    async down(queryInterface) {
        await queryInterface.addIndex('reservations', ['parking_spot_id'], {
            name: 'reservations_parking_spot_id_foreign_idx',
        });
        await queryInterface.removeIndex('reservations', 'reservations_spot_status_times_idx');
    },
};
