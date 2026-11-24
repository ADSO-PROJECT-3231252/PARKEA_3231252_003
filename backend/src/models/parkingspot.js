'use strict';
const { Model } = require('sequelize');
const { VEHICLE_TYPES } = require('../constants/vehicleTypes');

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
    // HU-31: the type of vehicle the spot is for. The API never changes it,
    // and it is one of the types of its zone (parking_spots_zone_vehicle_type_fk).
    vehicleType: {
      type: DataTypes.ENUM(...VEHICLE_TYPES),
      allowNull: false,
      field: 'vehicle_type',
      // Sequelize does not check the values of an ENUM by itself
      validate: { isIn: [VEHICLE_TYPES] },
    },
    // HU-31: numbered per type, from 1, inside its zone
    // (parking_spots_zone_type_spot_unique)
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
