'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class Pago extends Model {
        static associate(models) {
            Pago.belongsTo(models.Reserva, { foreignKey: 'reservationId', as: 'reservation' });
        }
    }
    Pago.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        reservationId: {
            type: DataTypes.UUID,
            allowNull: false,
            unique: true,
            field: 'reservation_id',
        },
        amount: {
            type: DataTypes.DECIMAL(10, 2),
            allowNull: false,
            validate: { min: 0 },
        },
        paymentStatus: {
            type: DataTypes.ENUM('Pending', 'Paid', 'Cancelled', 'Refunded'),
            allowNull: false,
            defaultValue: 'Pending',
            field: 'payment_status',
        },
        paymentMethod: {
            type: DataTypes.ENUM('card', 'pse'),
            allowNull: true,
            field: 'payment_method',
        },
        cardLastFour: {
            type: DataTypes.STRING(4),
            allowNull: true,
            field: 'card_last_four',
        },
        paidAt: {
            type: DataTypes.DATE,
            allowNull: true,
            field: 'paid_at',
        },
    }, {
        sequelize,
        modelName: 'Pago',
        tableName: 'payments',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
    });
    return Pago;
};