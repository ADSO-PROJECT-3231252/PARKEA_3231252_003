'use strict';

// #373: the free spots of a zone depend on the hours asked, so they are
// calculated from the reservations (services/availability.js) and no longer
// stored. The API keeps sending availableSlots: the spots free now.
module.exports = {
    async up(queryInterface) {
        await queryInterface.removeColumn('zones', 'available_slots');
    },

    // As before #373: each Pending or Active reservation took one slot of its
    // zone, whatever its hours
    async down(queryInterface, Sequelize) {
        // The stored counter can only say that a spot is taken or free, so two
        // live reservations of one spot (at different hours) cannot go back to
        // it. Checked first, before the schema changes: MySQL does not undo
        // them if a later step fails.
        const [[{ compartidos }]] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS compartidos FROM (
                SELECT parking_spot_id FROM reservations
                WHERE status IN ('Pending', 'Active') AND parking_spot_id IS NOT NULL
                GROUP BY parking_spot_id HAVING COUNT(*) > 1
            ) AS s
        `);
        if (Number(compartidos) > 0) {
            throw new Error(`${compartidos} spot(s) have more than one Pending or Active reservation: cancel or move them before undoing this migration`);
        }

        await queryInterface.addColumn('zones', 'available_slots', {
            type: Sequelize.INTEGER,
            allowNull: false,
            defaultValue: 0,
            after: 'total_slots',
        });
        await queryInterface.sequelize.query(`
            UPDATE zones SET available_slots = GREATEST(total_slots - (
                SELECT COUNT(*) FROM reservations AS r
                WHERE r.zone_id = zones.id AND r.status IN ('Pending', 'Active')
            ), 0)
        `);
        // Without a default and in its place, as it was created (20260731121446)
        await queryInterface.changeColumn('zones', 'available_slots', {
            type: Sequelize.INTEGER,
            allowNull: false,
            after: 'total_slots',
        });
    },
};
