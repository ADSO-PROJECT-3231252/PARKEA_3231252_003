'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Zona extends Model {
    static associate(models) {
      Zona.hasMany(models.Reserva, { foreignKey: 'zoneId', as: 'reservations' });
      Zona.hasMany(models.ParkingSpot, { foreignKey: 'zoneId', as: 'parkingSpots' });
      // HU-29: the hours of each day, only for a zone that is not open 24 hours
      Zona.hasMany(models.ZoneSchedule, { foreignKey: 'zoneId', as: 'schedules' });
      // HU-31: the vehicle types the zone accepts, with the spots and the
      // rate of each one
      Zona.hasMany(models.ZoneVehicleType, { foreignKey: 'zoneId', as: 'vehicleTypes' });
    }

    // HU-29: the API sends the hours as `schedule`, one item for each day the
    // zone opens, from Monday (1) to Sunday (7). A zone open 24 hours has an
    // empty list. #373: `availableSlots` is not stored; the controllers add
    // it (services/availability.js) and it is sent as it is. HU-31: the zone
    // has no spots or rate of its own; each vehicle type has its spots and
    // its rate (`vehicleTypes`), and `totalSlots` is the sum of the types it
    // accepts. The controllers add them too (services/zoneVehicleTypes.js).
    toJSON() {
      const values = { ...this.get() };
      if (values.schedules !== undefined) {
        values.schedule = values.open24h ? [] : values.schedules
          .map((s) => ({ day: s.dayOfWeek, opensAt: s.opensAt, closesAt: s.closesAt }))
          .sort((a, b) => a.day - b.day);
        delete values.schedules;
      }
      return values;
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
      allowNull: false,
    },
    latitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    longitude: {
      type: DataTypes.DECIMAL(10, 7),
      allowNull: false,
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'is_active',
    },
    // HU-29: true when the zone is open 24 hours every day; false when it
    // uses its schedules
    open24h: {
      type: DataTypes.BOOLEAN,
      allowNull: false,
      defaultValue: true,
      field: 'open_24h',
    },
  }, {
    sequelize,
    modelName: 'Zona',
    tableName: 'zones',
    timestamps: false,
  });
  return Zona;
};
