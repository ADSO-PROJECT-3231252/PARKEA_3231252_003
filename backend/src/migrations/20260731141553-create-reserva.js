'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('reservations', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      zone_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'zones', key: 'id' },
        onDelete: 'CASCADE',
      },
      vehicle_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'vehicles', key: 'id' },
        onDelete: 'CASCADE',
      },
      start_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      end_time: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      spot_number: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('Pending', 'Active', 'Finished', 'Cancelled'),
        allowNull: false,
        defaultValue: 'Pending',
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('reservations');
  },
};