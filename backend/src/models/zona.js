'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Zona extends Model {
    static associate(models) {
      // Se completa cuando exista el modelo Reserva
      // Zona.hasMany(models.Reserva, { foreignKey: 'zoneId', as: 'reservations' });
    }
  }
  Zona.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
    },
    address: {
      type: DataTypes.STRING(255),
      allowNull: true,
    },
    totalSlots: {
      type: DataTypes.INTEGER,
      allowNull: false,
      defaultValue: 0,
      field: 'total_slots',
    },
    availableSlots: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'available_slots',
      validate: { min: 0 },
    },
    hourlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      field: 'hourly_rate',
      validate: { min: 0 },
    },
  }, {
    sequelize,
    modelName: 'Zona',
    tableName: 'zones',
    timestamps: false,
  });
  return Zona;
};