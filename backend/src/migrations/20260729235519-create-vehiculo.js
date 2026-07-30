'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('vehicles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      plate: {
        type: Sequelize.STRING(20),
        allowNull: false,
        unique: true,
      },
      brand: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      model: {
        type: Sequelize.STRING(50),
        allowNull: true,
      },
      color: {
        type: Sequelize.STRING(30),
        allowNull: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
      },
    });
  },
  async down(queryInterface) {
    await queryInterface.dropTable('vehicles');
  },
};