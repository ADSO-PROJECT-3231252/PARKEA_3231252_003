'use strict';

// #372: the rules the API already follows, now also in the database, so a
// write that skips the API (SQL by hand, a script) cannot break them (SRS 3.5).
// zones.available_slots gets no check: #373 removed it.
const CHECKS = [
    { table: 'zones', name: 'zones_hourly_rate_positive', rule: 'hourly_rate > 0' },
    { table: 'payments', name: 'payments_amount_not_negative', rule: 'amount >= 0' },
    { table: 'zone_schedules', name: 'zone_schedules_day_of_week_range', rule: 'day_of_week BETWEEN 1 AND 7' },
    { table: 'zone_schedules', name: 'zone_schedules_open_30_minutes', rule: 'TIME_TO_SEC(closes_at) - TIME_TO_SEC(opens_at) >= 30 * 60' },
    { table: 'zone_schedules', name: 'zone_schedules_times_in_day', rule: "opens_at >= '00:00:00' AND closes_at <= '23:59:00'" },
    { table: 'zone_schedules', name: 'zone_schedules_whole_minutes', rule: 'SECOND(opens_at) = 0 AND SECOND(closes_at) = 0' },
];

// The checks of this migration that the database already has. MySQL does
// not undo the statements of a migration that fails halfway, so up and down
// only add or remove what is missing or still there, and can run again.
async function existingChecks(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_TYPE = 'CHECK'
    `);
    return new Set(rows.map((row) => row.name));
}

module.exports = {
    async up(queryInterface) {
        // A row that breaks a rule would make its ALTER fail with a message
        // that does not say which row. Count them all first, and change
        // nothing if there is any, so the data can be fixed and the
        // migration run again.
        const broken = [];
        for (const { table, name, rule } of CHECKS) {
            const [[{ total }]] = await queryInterface.sequelize.query(
                `SELECT COUNT(*) AS total FROM ${table} WHERE NOT (${rule})`
            );
            if (Number(total) > 0) broken.push(`${name} (${rule}): ${total} row(s) of ${table}`);
        }
        if (broken.length > 0) {
            throw new Error(`Fix these rows before this migration, nothing was changed: ${broken.join('; ')}`);
        }

        const existing = await existingChecks(queryInterface);
        for (const { table, name, rule } of CHECKS) {
            if (!existing.has(name)) {
                await queryInterface.sequelize.query(`ALTER TABLE ${table} ADD CONSTRAINT ${name} CHECK (${rule})`);
            }
        }
    },

    async down(queryInterface) {
        const existing = await existingChecks(queryInterface);
        for (const { table, name } of CHECKS) {
            if (existing.has(name)) {
                await queryInterface.sequelize.query(`ALTER TABLE ${table} DROP CHECK ${name}`);
            }
        }
    },
};
