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
        // Not unique: a reservation can have a balance (HU-27) or extensions
        // (HU-28) besides its initial payment. Only the initial payment is
        // unique, enforced in the database (payments_initial_reservation_unique).
        reservationId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'reservation_id',
        },
        type: {
            type: DataTypes.ENUM('initial', 'extension', 'balance'),
            allowNull: false,
            defaultValue: 'initial',
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
