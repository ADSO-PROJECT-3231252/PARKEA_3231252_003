'use strict';

// HU-31: the spots and the rate of a zone are the ones of its vehicle types
// (zone_vehicle_types), so zones.total_slots, zones.hourly_rate and the check
// of that rate (zones_hourly_rate_positive, #372) go away. The spots of a
// zone are the sum of the types it accepts, which the API calculates.
//
// parking_spots.vehicle_type also loses its default of 'car', which only the
// seeders needed while they wrote the spots without their type: now the API
// and the seeders always write it. MySQL still gives an ENUM NOT NULL column
// its first value (car) when an INSERT leaves it out, so a spot written by
// hand without its type is a car spot, and the foreign key of 20261124100100
// refuses it in a zone without cars.
//
// Undoing it gives every zone back the spots of the types it accepts and the
// rate of its first type (car, motorcycle, truck), as the code of before
// kept them.

// The columns as they were, in their places: total_slots after address and
// hourly_rate after total_slots
const totalSlots = (Sequelize) => ({ type: Sequelize.INTEGER, allowNull: false, defaultValue: 0, after: 'address' });
const hourlyRate = (Sequelize, allowNull) => ({ type: Sequelize.DECIMAL(10, 2), allowNull, after: 'total_slots' });
const RATE_CHECK = 'zones_hourly_rate_positive';
const spotType = (Sequelize, defaultValue) => ({ type: Sequelize.ENUM('car', 'motorcycle', 'truck'), allowNull: false, defaultValue });

// MySQL does not undo the statements of a migration that fails halfway, so
// up and down only do what is still missing, and can run again.
async function zoneColumns(queryInterface) {
    return queryInterface.describeTable('zones');
}

async function hasRateCheck(queryInterface) {
    const [[{ total }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'zones'
        AND CONSTRAINT_TYPE = 'CHECK' AND CONSTRAINT_NAME = '${RATE_CHECK}'
    `);
    return Number(total) > 0;
}

module.exports = {
    async up(queryInterface, Sequelize) {
        const columns = await zoneColumns(queryInterface);

        // A zone with no vehicle type would lose its spots and its rate: a
        // zone written by hand after 20261124100000, which gave the car type
        // to every zone. Checked before any change.
        if (columns.total_slots || columns.hourly_rate) {
            const [[{ total }]] = await queryInterface.sequelize.query(`
                SELECT COUNT(*) AS total FROM zones AS z
                WHERE NOT EXISTS (SELECT 1 FROM zone_vehicle_types AS t WHERE t.zone_id = z.id)
            `);
            if (Number(total) > 0) {
                throw new Error(`${total} zone(s) have no vehicle type in zone_vehicle_types: edit them in the API to give them their types, or remove them, before this migration. Nothing was changed`);
            }
        }

        // The check goes by its name, before its column. MySQL would also
        // drop it with the column, because it uses only that one, but this way
        // what goes away does not depend on that rule.
        if (await hasRateCheck(queryInterface)) {
            await queryInterface.sequelize.query(`ALTER TABLE zones DROP CHECK ${RATE_CHECK}`);
        }
        if (columns.hourly_rate) await queryInterface.removeColumn('zones', 'hourly_rate');
        if (columns.total_slots) await queryInterface.removeColumn('zones', 'total_slots');

        await queryInterface.changeColumn('parking_spots', 'vehicle_type', spotType(Sequelize, undefined));
    },

    async down(queryInterface, Sequelize) {
        const columns = await zoneColumns(queryInterface);

        // zones.hourly_rate cannot be empty, and it is the rate of a type the
        // zone accepts: a zone with every type turned off has none. Checked
        // before any change.
        if (!columns.hourly_rate || columns.hourly_rate.allowNull) {
            const [[{ total }]] = await queryInterface.sequelize.query(`
                SELECT COUNT(*) AS total FROM zones AS z
                WHERE NOT EXISTS (SELECT 1 FROM zone_vehicle_types AS t WHERE t.zone_id = z.id AND t.is_accepting)
            `);
            if (Number(total) > 0) {
                throw new Error(`${total} zone(s) accept no vehicle type, so they have no rate: turn one of their types on before undoing this migration. Nothing was changed`);
            }
        }

        await queryInterface.changeColumn('parking_spots', 'vehicle_type', spotType(Sequelize, 'car'));

        if (!columns.total_slots) await queryInterface.addColumn('zones', 'total_slots', totalSlots(Sequelize));
        if (!columns.hourly_rate) await queryInterface.addColumn('zones', 'hourly_rate', hourlyRate(Sequelize, true));

        // The values the code of before kept: the spots of the types the zone
        // accepts, and the rate of the first of them
        if (!columns.hourly_rate || columns.hourly_rate.allowNull) {
            await queryInterface.sequelize.query(`
                UPDATE zones AS z SET
                    total_slots = (
                        SELECT COALESCE(SUM(t.total_slots), 0) FROM zone_vehicle_types AS t
                        WHERE t.zone_id = z.id AND t.is_accepting
                    ),
                    hourly_rate = (
                        SELECT t.hourly_rate FROM zone_vehicle_types AS t
                        WHERE t.zone_id = z.id AND t.is_accepting
                        ORDER BY FIELD(t.vehicle_type, 'car', 'motorcycle', 'truck') LIMIT 1
                    )
            `);
            await queryInterface.changeColumn('zones', 'hourly_rate', hourlyRate(Sequelize, false));
        }

        if (!(await hasRateCheck(queryInterface))) {
            await queryInterface.sequelize.query(`ALTER TABLE zones ADD CONSTRAINT ${RATE_CHECK} CHECK (hourly_rate > 0)`);
        }
    },
};
