'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('reservations', 'hold_expires_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.addColumn('reservations', 'applied_hourly_rate', {
      type: Sequelize.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
    });
    await queryInterface.changeColumn('reservations', 'status', {
      type: Sequelize.ENUM('Pending', 'Active', 'Finished', 'Cancelled', 'Expired'),
      allowNull: false,
      defaultValue: 'Pending',
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('reservations', 'status', {
      type: Sequelize.ENUM('Pending', 'Active', 'Finished', 'Cancelled'),
      allowNull: false,
      defaultValue: 'Pending',
    });
    await queryInterface.removeColumn('reservations', 'applied_hourly_rate');
    await queryInterface.removeColumn('reservations', 'hold_expires_at');
  },
};