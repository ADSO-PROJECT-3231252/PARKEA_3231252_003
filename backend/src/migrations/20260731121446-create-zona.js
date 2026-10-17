'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('zones', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.STRING(100),
        allowNull: false,
      },
      address: {
        type: Sequelize.STRING(255),
        allowNull: true,
      },
      total_slots: {
        type: Sequelize.INTEGER,
        allowNull: false,
        defaultValue: 0,
      },
      available_slots: {
        type: Sequelize.INTEGER,
        allowNull: false,
      },
      hourly_rate: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('zones');
  },
};