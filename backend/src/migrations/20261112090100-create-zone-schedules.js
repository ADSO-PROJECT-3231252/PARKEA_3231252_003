'use strict';

// HU-29: the hours of a zone that is not open 24 hours. One row for each day
// the zone opens (1 = Monday ... 7 = Sunday), in Colombia time; a day without
// a row is a closed day. The hours never cross midnight (decision 5).
module.exports = {
    async up(queryInterface, Sequelize) {
        await queryInterface.createTable('zone_schedules', {
            id: {
                type: Sequelize.UUID,
                defaultValue: Sequelize.UUIDV4,
                primaryKey: true,
            },
            zone_id: {
                type: Sequelize.UUID,
                allowNull: false,
                references: { model: 'zones', key: 'id' },
                onDelete: 'CASCADE',
            },
            day_of_week: {
                type: Sequelize.TINYINT,
                allowNull: false,
            },
            opens_at: {
                type: Sequelize.TIME,
                allowNull: false,
            },
            closes_at: {
                type: Sequelize.TIME,
                allowNull: false,
            },
        });
        // A zone has at most one row for each day
        await queryInterface.addIndex('zone_schedules', ['zone_id', 'day_of_week'], {
            name: 'zone_schedules_zone_day_unique',
            unique: true,
        });
    },

    async down(queryInterface) {
        await queryInterface.dropTable('zone_schedules');
    },
};
