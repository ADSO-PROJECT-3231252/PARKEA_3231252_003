'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('parking_spots', {
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
      spot_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('Available', 'Occupied'),
        allowNull: false,
        defaultValue: 'Available',
      },
    });

    await queryInterface.addConstraint('parking_spots', {
      fields: ['zone_id', 'spot_number'],
      type: 'unique',
      name: 'parking_spots_zone_spot_unique',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('parking_spots');
  },
};