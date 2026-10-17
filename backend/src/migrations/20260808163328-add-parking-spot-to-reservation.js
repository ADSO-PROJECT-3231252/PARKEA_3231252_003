'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('reservations', 'parking_spot_id', {
      type: Sequelize.UUID,
      allowNull: true, 
      references: { model: 'parking_spots', key: 'id' },
      onDelete: 'RESTRICT',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('reservations', 'parking_spot_id');
  },
};