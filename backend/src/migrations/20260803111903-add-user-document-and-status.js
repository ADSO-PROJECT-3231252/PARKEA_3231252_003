'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('users', 'document_type', {
      type: Sequelize.ENUM('CC', 'TI', 'CE', 'PASSPORT'),
      allowNull: true,
    });
    await queryInterface.addColumn('users', 'document_number', {
      type: Sequelize.STRING(20),
      allowNull: true,
    });
    await queryInterface.addIndex('users', ['document_number'], {
      unique: true,
      name: 'users_document_number_unique',
    });
    await queryInterface.addColumn('users', 'is_active', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true,
    });
    await queryInterface.addColumn('users', 'is_primary_admin', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: false,
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('users', 'is_primary_admin');
    await queryInterface.removeColumn('users', 'is_active');
    await queryInterface.removeIndex('users', 'users_document_number_unique');
    await queryInterface.removeColumn('users', 'document_number');
    await queryInterface.removeColumn('users', 'document_type');
  },
};