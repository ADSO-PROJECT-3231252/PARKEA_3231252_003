'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Rol extends Model {
    static associate(models) {
      Rol.hasMany(models.Usuario, { foreignKey: 'role_id', as: 'users' });
    }
  }
  Rol.init({
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.ENUM('admin', 'user'),
      allowNull: false,
      unique: true,
    },
  }, {
    sequelize,
    modelName: 'Rol',
    tableName: 'roles',
    timestamps: false,
  });
  return Rol;
};