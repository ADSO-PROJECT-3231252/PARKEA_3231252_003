'use strict';

// #199: a counter that goes up every time the password changes. The session
// token carries the value it was issued with, so a token from before a
// password change stops working. Existing accounts start at 0, and tokens
// issued before this migration count as 0, so nobody is signed out.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'password_version', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'password_version');
  },
};
