'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('vehicles', 'vehicle_type', {
      type: Sequelize.ENUM('car', 'motorcycle', 'truck'),
      allowNull: false,
      defaultValue: 'car',
    });
    await queryInterface.addColumn('vehicles', 'visual_description', {
      type: Sequelize.STRING(255),
      allowNull: true,
    });
    await queryInterface.addColumn('vehicles', 'is_default', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
    await queryInterface.addColumn('vehicles', 'deleted_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('vehicles', 'deleted_at');
    await queryInterface.removeColumn('vehicles', 'is_default');
    await queryInterface.removeColumn('vehicles', 'visual_description');
    await queryInterface.removeColumn('vehicles', 'vehicle_type');
  },
};