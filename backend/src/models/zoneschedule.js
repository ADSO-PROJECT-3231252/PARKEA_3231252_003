'use strict';
const { Model } = require('sequelize');

// MySQL gives TIME values as "06:00:00"; the API uses "06:00"
const hoursAndMinutes = (value) => (typeof value === 'string' ? value.slice(0, 5) : value);

// HU-29: the hours of one day of the week of a zone that is not open 24
// hours (1 = Monday ... 7 = Sunday, Colombia time). A day without a row is
// a closed day.
module.exports = (sequelize, DataTypes) => {
    class ZoneSchedule extends Model {
        static associate(models) {
            ZoneSchedule.belongsTo(models.Zona, { foreignKey: 'zoneId', as: 'zone' });
        }
    }
    ZoneSchedule.init({
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
        dayOfWeek: {
            type: DataTypes.TINYINT,
            allowNull: false,
            field: 'day_of_week',
            validate: { min: 1, max: 7 },
        },
        opensAt: {
            type: DataTypes.TIME,
            allowNull: false,
            field: 'opens_at',
            get() {
                return hoursAndMinutes(this.getDataValue('opensAt'));
            },
        },
        closesAt: {
            type: DataTypes.TIME,
            allowNull: false,
            field: 'closes_at',
            get() {
                return hoursAndMinutes(this.getDataValue('closesAt'));
            },
        },
    }, {
        sequelize,
        modelName: 'ZoneSchedule',
        tableName: 'zone_schedules',
        timestamps: false,
    });
    return ZoneSchedule;
};
