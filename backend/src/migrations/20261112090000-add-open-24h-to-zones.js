'use strict';

// HU-29: a zone is either open 24 hours or has its own hours for each day of
// the week (zone_schedules). Every zone that already exists stays open 24
// hours, so nothing changes for it (decision 1).
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.addColumn('zones', 'open_24h', {
            type: Sequelize.BOOLEAN,
            allowNull: false,
            defaultValue: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.removeColumn('zones', 'open_24h');
    },
};
