'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class ParkingSpot extends Model {
    static associate(models) {
      ParkingSpot.belongsTo(models.Zona, { foreignKey: 'zoneId', as: 'zone' });
      ParkingSpot.hasOne(models.Reserva, { foreignKey: 'parkingSpotId', as: 'reservation' });
    }
  }
  ParkingSpot.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    zoneId: {
      type: DataTypes.UUID,
      allowNull: false,
      field: 'zone_id',
    },
    spotNumber: {
      type: DataTypes.INTEGER,
      allowNull: false,
      field: 'spot_number',
    },
    // #373: only whether the spot can be reserved. It is taken only for the
    // hours of its reservations (services/availability.js).
    status: {
      type: DataTypes.ENUM('Available', 'Disabled'),
      allowNull: false,
      defaultValue: 'Available',
    },
  }, {
    sequelize,
    modelName: 'ParkingSpot',
    tableName: 'parking_spots',
    timestamps: false,
  });
  return ParkingSpot;
};
