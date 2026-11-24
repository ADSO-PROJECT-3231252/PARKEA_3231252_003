'use strict';

// HU-31: the vehicle types a zone accepts (car, motorcycle, truck), with the
// spots and the hourly rate of each type. A type that is turned off
// (is_accepting = false) takes no new reservations, and keeps its spots and
// its rate for the reservations it already has (AC-05).
//
// Every zone that exists gets the car type with its current spots and rate,
// so nothing changes for it (AC-15). zones.total_slots and zones.hourly_rate
// stay while the code still reads them.
const TABLE = 'zone_vehicle_types';
const UNIQUE_INDEX = 'zone_vehicle_types_zone_type_unique';

// The same limits as the API: 1 to 500 spots (MAX_TOTAL_SLOTS) and a rate
// greater than 0 (#316)
const CHECKS = [
    { name: 'zone_vehicle_types_total_slots_range', rule: 'total_slots BETWEEN 1 AND 500' },
    { name: 'zone_vehicle_types_hourly_rate_positive', rule: 'hourly_rate > 0' },
];

// MySQL does not undo the statements of a migration that fails halfway, so
// up and down only do what is still missing, and can run again.
async function tableExists(queryInterface) {
    const [[{ total }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS total FROM information_schema.TABLES
        WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = '${TABLE}'
    `);
    return Number(total) > 0;
}

async function existingChecks(queryInterface) {
    const [rows] = await queryInterface.sequelize.query(`
        SELECT CONSTRAINT_NAME AS name FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = '${TABLE}' AND CONSTRAINT_TYPE = 'CHECK'
    `);
    return new Set(rows.map((row) => row.name));
}

module.exports = {
    async up(queryInterface, Sequelize) {
        // A zone whose spots or rate break the checks would stop the copy
        // halfway, with a message that does not say which zone. Count them
        // first, and change nothing if there is any.
        const [[{ total }]] = await queryInterface.sequelize.query(`
            SELECT COUNT(*) AS total FROM zones
            WHERE NOT (total_slots BETWEEN 1 AND 500) OR NOT (hourly_rate > 0)
        `);
        if (Number(total) > 0) {
            throw new Error(`Fix these zones before this migration, nothing was changed: ${total} zone(s) with total_slots outside 1 to 500 or hourly_rate not greater than 0`);
        }

        if (!(await tableExists(queryInterface))) {
            await queryInterface.createTable(TABLE, {
                id: {
                    type: Sequelize.UUID,
                    defaultValue: Sequelize.UUIDV4,
                    primaryKey: true,
                },
                zone_id: {
                    type: Sequelize.UUID,
                    allowNull: false,
                    references: { model: 'zones', key: 'id' },
                    onDelete: 'CASCADE',
                },
                vehicle_type: {
                    type: Sequelize.ENUM('car', 'motorcycle', 'truck'),
                    allowNull: false,
                },
                total_slots: {
                    type: Sequelize.INTEGER,
                    allowNull: false,
                },
                hourly_rate: {
                    type: Sequelize.DECIMAL(10, 2),
                    allowNull: false,
                },
                is_accepting: {
                    type: Sequelize.BOOLEAN,
                    allowNull: false,
                    defaultValue: true,
                },
            });
        }

        // A zone has each type at most once. The spots point to this pair
        // (20261124100100), so it is also what their foreign key uses.
        const indexes = await queryInterface.showIndex(TABLE);
        if (!indexes.some((index) => index.name === UNIQUE_INDEX)) {
            await queryInterface.addIndex(TABLE, ['zone_id', 'vehicle_type'], { name: UNIQUE_INDEX, unique: true });
        }

        const checks = await existingChecks(queryInterface);
        for (const { name, rule } of CHECKS) {
            if (!checks.has(name)) {
                await queryInterface.sequelize.query(`ALTER TABLE ${TABLE} ADD CONSTRAINT ${name} CHECK (${rule})`);
            }
        }

        // The car type of every zone that does not have it yet
        await queryInterface.sequelize.query(`
            INSERT INTO ${TABLE} (id, zone_id, vehicle_type, total_slots, hourly_rate, is_accepting)
            SELECT UUID(), z.id, 'car', z.total_slots, z.hourly_rate, TRUE FROM zones AS z
            WHERE NOT EXISTS (SELECT 1 FROM ${TABLE} AS t WHERE t.zone_id = z.id AND t.vehicle_type = 'car')
        `);
    },

    async down(queryInterface) {
        if (!(await tableExists(queryInterface))) return;

        // The spots and the rates of the other types would be lost: zones
        // only has the columns of one type. Checked before any change.
        const [[{ total }]] = await queryInterface.sequelize.query(
            `SELECT COUNT(*) AS total FROM ${TABLE} WHERE vehicle_type <> 'car'`
        );
        if (Number(total) > 0) {
            throw new Error(`${total} zone type(s) are not car: remove them before undoing this migration, nothing was changed`);
        }

        await queryInterface.dropTable(TABLE);
    },
};
