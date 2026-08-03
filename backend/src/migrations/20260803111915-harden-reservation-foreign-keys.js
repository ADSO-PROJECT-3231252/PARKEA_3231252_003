'use strict';

// Reservations must survive the removal of a vehicle, user, or zone, so the
// booking history keeps its references. CASCADE is replaced with RESTRICT.
const LINKS = [
  { column: 'vehicle_id', table: 'vehicles' },
  { column: 'user_id', table: 'users' },
  { column: 'zone_id', table: 'zones' },
];

module.exports = {
  async up(queryInterface, Sequelize) {
    for (const link of LINKS) {
      const [rows] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME AS name
        FROM information_schema.KEY_COLUMN_USAGE
        WHERE TABLE_SCHEMA = DATABASE()
          AND TABLE_NAME = 'reservations'
          AND COLUMN_NAME = '${link.column}'
          AND REFERENCED_TABLE_NAME = '${link.table}';
      `);

      for (const row of rows) {
        await queryInterface.removeConstraint('reservations', row.name);
      }

      await queryInterface.addConstraint('reservations', {
        fields: [link.column],
        type: 'foreign key',
        name: `reservations_${link.column}_fk`,
        references: { table: link.table, field: 'id' },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    }
  },

  async down(queryInterface) {
    for (const link of LINKS) {
      await queryInterface.removeConstraint('reservations', `reservations_${link.column}_fk`);
      await queryInterface.addConstraint('reservations', {
        fields: [link.column],
        type: 'foreign key',
        references: { table: link.table, field: 'id' },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });
    }
  },
};