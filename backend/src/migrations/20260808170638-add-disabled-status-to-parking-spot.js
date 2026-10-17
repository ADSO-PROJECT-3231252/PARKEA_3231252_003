'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('parking_spots', 'status', {
      type: Sequelize.ENUM('Available', 'Occupied', 'Disabled'),
      allowNull: false,
      defaultValue: 'Available',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('parking_spots', 'status', {
      type: Sequelize.ENUM('Available', 'Occupied'),
      allowNull: false,
      defaultValue: 'Available',
    });
  },
};