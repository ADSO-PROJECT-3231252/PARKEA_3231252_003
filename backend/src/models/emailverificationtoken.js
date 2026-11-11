'use strict';
const { Model } = require('sequelize');

// HU-30: a link of the verification email (only the hash of its token)
module.exports = (sequelize, DataTypes) => {
  class EmailVerificationToken extends Model {
    static associate(models) {
      EmailVerificationToken.belongsTo(models.Usuario, { foreignKey: 'userId', as: 'user' });
    }
  }
  EmailVerificationToken.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
    tokenHash: {
      type: DataTypes.STRING(64),
      allowNull: false,
      field: 'token_hash',
    },
    expiresAt: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'expires_at',
    },
    usedAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'used_at',
    },
  }, {
    sequelize,
    modelName: 'EmailVerificationToken',
    tableName: 'email_verification_tokens',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });
  return EmailVerificationToken;
};
