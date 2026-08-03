'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Reserva extends Model {
    static associate(models) {
      Reserva.belongsTo(models.Usuario, { foreignKey: 'userId', as: 'user' });
      Reserva.belongsTo(models.Zona, { foreignKey: 'zoneId', as: 'zone' });
      Reserva.belongsTo(models.Vehiculo, { foreignKey: 'vehicleId', as: 'vehicle' });
      Reserva.hasOne(models.Pago, { foreignKey: 'reservationId', as: 'payment' });
    }
  }
  Reserva.init({
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
    zoneId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'zone_id',
    },
    vehicleId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'vehicle_id',
    },
    startTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'start_time',
    },
    endTime: {
      type: DataTypes.DATE,
      allowNull: false,
      field: 'end_time',
    },
    spotNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'spot_number',
    },
    status: {
      type: DataTypes.ENUM('Pending', 'Active', 'Finished', 'Cancelled', 'Expired'),
      allowNull: false,
      defaultValue: 'Pending',
    },
    holdExpiresAt: {
      type: DataTypes.DATE,
      allowNull: true,
      field: 'hold_expires_at',
    },
    appliedHourlyRate: {
      type: DataTypes.DECIMAL(10, 2),
      allowNull: false,
      defaultValue: 0,
      field: 'applied_hourly_rate',
    },
  }, {
    sequelize,
    modelName: 'Reserva',
    tableName: 'reservations',
    timestamps: false,
  });
  return Reserva;
};