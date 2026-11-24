'use strict';

// HU-30: the links of the verification email. Same pattern as
// password_reset_tokens: only the SHA-256 hash of the token is stored, the
// token itself goes only in the link.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('email_verification_tokens', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      user_id: {
        type: Sequelize.UUID,
        allowNull: false,
        references: { model: 'users', key: 'id' },
        onDelete: 'CASCADE',
      },
      token_hash: {
        type: Sequelize.STRING(64),
        allowNull: false,
      },
      expires_at: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      used_at: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      created_at: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.NOW,
      },
    });
    // Opening a link looks the token up by its hash
    await queryInterface.addIndex('email_verification_tokens', ['token_hash'], {
      name: 'email_verification_tokens_token_hash',
      unique: true,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('email_verification_tokens');
  },
};
