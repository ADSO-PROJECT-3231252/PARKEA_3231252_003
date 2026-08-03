'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      reservation_id: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: { model: 'reservations', key: 'id' },
      },
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      payment_status: {
        type: Sequelize.ENUM('Pending', 'Paid', 'Cancelled', 'Refunded'),
        allowNull: false,
        defaultValue: 'Pending',
      },
      payment_method: {
        type: Sequelize.ENUM('card', 'pse'),
        allowNull: true,
      },
      card_last_four: {
        type: Sequelize.STRING(4),
        allowNull: true,
      },
      paid_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('payments');
  },
};