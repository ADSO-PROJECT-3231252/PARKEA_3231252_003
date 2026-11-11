'use strict';

// HU-30: the date the user confirmed the email. NULL means the account is not
// verified yet and cannot sign in. Every account that already exists (and the
// administrator from the seeder) is marked as verified, so nobody is locked
// out (AC-06).
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'email_verified_at', {
      type: Sequelize.DATE,
      allowNull: true,
    });
    await queryInterface.sequelize.query('UPDATE users SET email_verified_at = NOW()');
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'email_verified_at');
  },
};
