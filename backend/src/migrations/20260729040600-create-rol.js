'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('roles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      name: {
        type: Sequelize.ENUM('admin', 'user'),
        allowNull: false,
        unique: true,
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('roles');
  },
};