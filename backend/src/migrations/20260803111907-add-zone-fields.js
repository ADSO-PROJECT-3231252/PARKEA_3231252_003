'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('zones', 'latitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('zones', 'longitude', {
      type: Sequelize.DECIMAL(10, 7),
      allowNull: true,
    });
    await queryInterface.addColumn('zones', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('zones', 'is_active');
    await queryInterface.removeColumn('zones', 'longitude');
    await queryInterface.removeColumn('zones', 'latitude');
  },
};