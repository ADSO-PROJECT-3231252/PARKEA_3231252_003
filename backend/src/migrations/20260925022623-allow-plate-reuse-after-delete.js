'use strict';

module.exports = {
  async up(queryInterface) {
    // The `plate` UNIQUE index blocks re-registering a plate that belongs to
    // a soft-deleted vehicle (deleted_at IS NOT NULL) -- MySQL's unique index
    // still sees the deleted row, since paranoid delete never removes it.
    // Replaced with a generated column that is NULL for deleted vehicles;
    // MySQL allows multiple NULLs in a unique index, so only ACTIVE vehicles
    // are constrained to a unique plate -- a deleted vehicle's plate becomes
    // free to reuse, while two simultaneous requests for the same plate are
    // still rejected by the database itself, not just by application code.
    await queryInterface.sequelize.query('ALTER TABLE vehicles DROP INDEX plate;');
    await queryInterface.sequelize.query(`
      ALTER TABLE vehicles
        ADD COLUMN plate_active VARCHAR(20)
          GENERATED ALWAYS AS (IF(deleted_at IS NULL, plate, NULL)) STORED,
        ADD UNIQUE KEY vehicles_plate_active_unique (plate_active);
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE vehicles DROP INDEX vehicles_plate_active_unique;'
    );
    await queryInterface.sequelize.query('ALTER TABLE vehicles DROP COLUMN plate_active;');
    await queryInterface.sequelize.query('ALTER TABLE vehicles ADD UNIQUE INDEX plate (plate);');
  },
};