'use strict';

module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('admin_action_logs', ['created_at'], {
      name: 'admin_action_logs_created_at_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('admin_action_logs', 'admin_action_logs_created_at_idx');
  },
};