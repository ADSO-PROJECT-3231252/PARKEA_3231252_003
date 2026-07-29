'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('roles', [
      { id: 'a1b2c3d4-0000-0000-0000-000000000001', name: 'admin' },
      { id: 'a1b2c3d4-0000-0000-0000-000000000002', name: 'user' },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('roles', null, {});
  },
};