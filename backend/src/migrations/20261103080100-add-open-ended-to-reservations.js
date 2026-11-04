'use strict';

// HU-27: an open stay is a reservation without a chosen exit time. Its
// end_time keeps a provisional value (entry + 24 h) until the stay ends, so
// this flag is what tells it apart from a reservation with an exit time.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('reservations', 'open_ended', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('reservations', 'open_ended');
  },
};
