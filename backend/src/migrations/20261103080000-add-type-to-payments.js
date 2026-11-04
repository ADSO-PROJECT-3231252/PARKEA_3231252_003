'use strict';

// HU-27: a reservation can now have more than one payment. The initial one
// pays the whole stay, or the first hour of an open stay; later a balance
// (HU-27) or extensions (HU-28) are added. Only the initial payment must stay
// unique per reservation, so the UNIQUE on reservation_id is replaced by a
// UNIQUE on a generated column that holds the reservation id only for initial
// payments (NULL otherwise), the same pattern as plate_active on vehicles.
module.exports = {
  async up(queryInterface, Sequelize) {
    // The foreign key needs an index on reservation_id, and today the UNIQUE
    // one is the only index. A plain index goes first: dropping the UNIQUE
    // before it exists fails with MySQL error 1553.
    await queryInterface.addIndex('payments', ['reservation_id'], { name: 'payments_reservation_id' });
    await queryInterface.removeIndex('payments', 'reservation_id');

    // Existing payments become initial ones
    await queryInterface.addColumn('payments', 'type', {
      type: Sequelize.ENUM('initial', 'extension', 'balance'),
      allowNull: false,
      defaultValue: 'initial',
    });

    await queryInterface.sequelize.query(`
      ALTER TABLE payments
        ADD COLUMN initial_reservation_id CHAR(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin
          GENERATED ALWAYS AS (IF(type = 'initial', reservation_id, NULL)) STORED,
        ADD UNIQUE KEY payments_initial_reservation_unique (initial_reservation_id);
    `);
  },

  async down(queryInterface) {
    // Checked before changing anything: MySQL does not undo schema changes, so
    // failing on the old UNIQUE at the end would leave the table half reverted
    // and lose which payments were balances or extensions.
    const [repeated] = await queryInterface.sequelize.query(
      'SELECT reservation_id FROM payments GROUP BY reservation_id HAVING COUNT(*) > 1 LIMIT 1;'
    );
    if (repeated.length > 0) {
      throw new Error(
        'Cannot undo add-type-to-payments: some reservations have more than one payment '
        + '(a balance or an extension), and the old UNIQUE on reservation_id would reject them.'
      );
    }

    await queryInterface.sequelize.query(`
      ALTER TABLE payments
        DROP INDEX payments_initial_reservation_unique,
        DROP COLUMN initial_reservation_id;
    `);
    await queryInterface.removeColumn('payments', 'type');
    await queryInterface.addIndex('payments', ['reservation_id'], { unique: true, name: 'reservation_id' });
    await queryInterface.removeIndex('payments', 'payments_reservation_id');
  },
};
