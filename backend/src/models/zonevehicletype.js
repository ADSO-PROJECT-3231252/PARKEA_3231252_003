'use strict';
const { Model } = require('sequelize');
const { VEHICLE_TYPES } = require('../constants/vehicleTypes');

// HU-31: a vehicle type that a zone accepts, with its spots and its hourly
// rate. A zone has each type at most once. A type that is turned off
// (isAccepting false) takes no new reservations, and keeps its spots and its
// rate for the reservations it already has (AC-05).
module.exports = (sequelize, DataTypes) => {
    class ZoneVehicleType extends Model {
        static associate(models) {
            ZoneVehicleType.belongsTo(models.Zona, { foreignKey: 'zoneId', as: 'zone' });
        }
    }
    ZoneVehicleType.init({
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
        vehicleType: {
            type: DataTypes.ENUM(...VEHICLE_TYPES),
            allowNull: false,
            field: 'vehicle_type',
            // Sequelize does not check the values of an ENUM by itself
            validate: { isIn: [VEHICLE_TYPES] },
        },
        // The same limits as the checks of the database
        // (zone_vehicle_types_total_slots_range and _hourly_rate_positive)
        totalSlots: {
            type: DataTypes.INTEGER,
            allowNull: false,
            field: 'total_slots',
            validate: { isInt: true, min: 1, max: 500 },
        },
        hourlyRate: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            field: 'hourly_rate',
            validate: { min: 0.01 },
        },
        isAccepting: {
            type: DataTypes.BOOLEAN,
            allowNull: false,
            defaultValue: true,
            field: 'is_accepting',
        },
    }, {
        sequelize,
        modelName: 'ZoneVehicleType',
        tableName: 'zone_vehicle_types',
        timestamps: false,
    });
    return ZoneVehicleType;
};
