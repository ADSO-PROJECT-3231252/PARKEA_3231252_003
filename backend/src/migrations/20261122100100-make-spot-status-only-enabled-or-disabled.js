'use strict';

// #373: a spot is taken only for the hours of its reservations, so its status
// no longer says whether it is taken: only whether it is enabled (Available)
// or Disabled. The spots that are Occupied go back to Available.
module.exports = {
    async up(queryInterface, Sequelize) {
        // A Pending or Active reservation without a spot (from before the
        // spots existed, 20260808163328) would hold no spot, and its hours
        // could be given to someone else. There should be none: check it
        // first instead of guessing a spot for it.
        const [[{ sinCupo }]] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS sinCupo FROM reservations
            WHERE parking_spot_id IS NULL AND status IN ('Pending', 'Active') AND end_time > UTC_TIMESTAMP()
        `);
        if (Number(sinCupo) > 0) {
            throw new Error(`${sinCupo} Pending or Active reservation(s) have no spot: give each one its spot before this migration`);
        }

        await queryInterface.sequelize.query("UPDATE parking_spots SET status = 'Available' WHERE status = 'Occupied'");
        await queryInterface.changeColumn('parking_spots', 'status', {
            type: Sequelize.ENUM('Available', 'Disabled'),
            allowNull: false,
            defaultValue: 'Available',
        });
    },

    // As before #373: a spot with a Pending or Active reservation is Occupied
    async down(queryInterface, Sequelize) {
        await queryInterface.changeColumn('parking_spots', 'status', {
            type: Sequelize.ENUM('Available', 'Occupied', 'Disabled'),
            allowNull: false,
            defaultValue: 'Available',
        });
        await queryInterface.sequelize.query(`
            UPDATE parking_spots SET status = 'Occupied'
            WHERE status = 'Available' AND id IN (
                SELECT parking_spot_id FROM reservations WHERE status IN ('Pending', 'Active') AND parking_spot_id IS NOT NULL
            )
        `);
    },
};
