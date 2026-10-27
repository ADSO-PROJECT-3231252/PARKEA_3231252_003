'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Usuario extends Model {
    static associate(models) {
      Usuario.belongsTo(models.Rol, { foreignKey: 'roleId', as: 'role' });
      Usuario.hasMany(models.Vehiculo, { foreignKey: 'userId', as: 'vehicles' });
      Usuario.hasMany(models.Reserva, { foreignKey: 'userId', as: 'reservations' });
      Usuario.hasMany(models.PasswordResetToken, { foreignKey: 'userId', as: 'passwordResetTokens' });
      Usuario.hasMany(models.AdminActionLog, { foreignKey: 'adminId', as: 'actionsPerformed' });
      Usuario.hasMany(models.AdminActionLog, { foreignKey: 'targetUserId', as: 'actionsReceived' });
    }
  }
  Usuario.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    fullName: {
      type: DataTypes.STRING(100),
      allowNull: false,
      field: 'full_name',
    },
    email: {
      type: DataTypes.STRING(150),
      allowNull: false,
      unique: true,
      validate: { isEmail: true },
    },
    password: {
      type: DataTypes.STRING(255),
      allowNull: false,
    },
    phone: {
      type: DataTypes.STRING(20),
      allowNull: true,
    },
    documentType: {
      type: DataTypes.ENUM('CC', 'TI', 'CE', 'PASSPORT'),
      allowNull: true,
      field: 'document_type',
    },
    documentNumber: {
      type: DataTypes.STRING(20),
      allowNull: true,
      unique: true,
      field: 'document_number',
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    isPrimaryAdmin: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_primary_admin',
    },
    roleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'role_id',
    },
  }, {
    sequelize,
    modelName: 'Usuario',
    tableName: 'users',
    timestamps: true,
    createdAt: 'created_at',
    updatedAt: false,
  });
  return Usuario;
};