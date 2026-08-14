'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
    class AdminActionLog extends Model {
        static associate(models) {
            AdminActionLog.belongsTo(models.Usuario, { foreignKey: 'adminId', as: 'admin' });
            AdminActionLog.belongsTo(models.Usuario, { foreignKey: 'targetUserId', as: 'targetUser' });
        }
    }
    AdminActionLog.init({
        id: {
            type: DataTypes.UUID,
            defaultValue: DataTypes.UUIDV4,
            primaryKey: true,
        },
        adminId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'admin_id',
        },
        targetUserId: {
            type: DataTypes.UUID,
            allowNull: false,
            field: 'target_user_id',
        },
        action: {
            type: DataTypes.ENUM('role_changed', 'status_changed'),
            allowNull: false,
        },
        details: {
            type: DataTypes.STRING(255),
            allowNull: false,
        },
    }, {
        sequelize,
        modelName: 'AdminActionLog',
        tableName: 'admin_action_logs',
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: false,
    });
    return AdminActionLog;
};