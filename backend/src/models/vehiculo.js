'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Vehiculo extends Model {
    static associate(models) {
      Vehiculo.belongsTo(models.Usuario, { foreignKey: 'userId', as: 'user' });
      Vehiculo.hasMany(models.Reserva, { foreignKey: 'vehicleId', as: 'reservations' });
    }
  }
  Vehiculo.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    plate: {
      type: DataTypes.STRING(20),
      allowNull: false,
      unique: true,
    },
    vehicleType: {
      type: DataTypes.ENUM('car', 'motorcycle', 'truck'),
      allowNull: false,
      defaultValue: 'car',
      field: 'vehicle_type',
    },
    brand: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    model: {
      type: DataTypes.STRING(50),
      allowNull: true,
    },
    color: {
      type: DataTypes.STRING(30),
      allowNull: true,
    },
    visualDescription: {
      type: DataTypes.STRING(255),
      allowNull: true,
      field: 'visual_description',
    },
    isDefault: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: false,
      field: 'is_default',
    },
    userId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'user_id',
    },
  }, {
    sequelize,
    modelName: 'Vehiculo',
    tableName: 'vehicles',
    timestamps: true,
    createdAt: false,
    updatedAt: false,
    deletedAt: 'deleted_at',
    paranoid: true,
  });
  return Vehiculo;
};