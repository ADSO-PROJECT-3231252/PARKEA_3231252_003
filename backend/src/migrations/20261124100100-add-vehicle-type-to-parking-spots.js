'use strict';

// HU-31: every spot is for one vehicle type, which the API never changes.
// The spots are numbered per type (cars 1 to 20, motorcycles 1 to 10), so
// the number is unique inside its zone and type, not inside its zone. The
// pair (zone, type) must be one of the types of its zone
// (zone_vehicle_types), so the database itself refuses a motorcycle spot in
// a zone without motorcycles.
//
// Every spot that exists is a car spot with the same number (AC-15): its
// zone got the car type in 20261124100000.
const OLD_UNIQUE = 'parking_spots_zone_spot_unique';
const NEW_UNIQUE = 'parking_spots_zone_type_spot_unique';
const TYPE_FK = 'parking_spots_zone_vehicle_type_fk';

// MySQL does not undo the statements of a migration that fails halfway, so
// up and down only do what is still missing, and can run again.
async function typeColumn(queryInterface) {
    const columns = await queryInterface.describeTable('parking_spots');
    return columns.vehicle_type ?? null;
}

async function indexNames(queryInterface) {
    const indexes = await queryInterface.showIndex('parking_spots');
    return new Set(indexes.map((index) => index.name));
}

async function hasTypeForeignKey(queryInterface) {
    const [[{ total }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS total FROM information_schema.TABLE_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'parking_spots'
        AND CONSTRAINT_TYPE = 'FOREIGN KEY' AND CONSTRAINT_NAME = '${TYPE_FK}'
    `);
    return Number(total) > 0;
}

module.exports = {
    async up(queryInterface, Sequelize) {
        // The foreign key needs the car type of the zone of every spot.
        // 20261124100000 gave it to every zone; a zone written by hand
        // between the two migrations would make the ALTER fail with a
        // message that does not say which zone. Checked before any change.
        const [[{ total }]] = await queryInterface.sequelize.query(`
            SELECT COUNT(DISTINCT s.zone_id) AS total FROM parking_spots AS s
            WHERE NOT EXISTS (
                SELECT 1 FROM zone_vehicle_types AS t WHERE t.zone_id = s.zone_id AND t.vehicle_type = 'car'
            )
        `);
        if (Number(total) > 0) {
            throw new Error(`${total} zone(s) with spots have no car type in zone_vehicle_types: undo 20261124100000 and migrate again to give it to them, nothing was changed`);
        }

        // The default makes every spot that exists a car spot. It stays while
        // the seeders still write spots without their type; the migration of
        // HU-31 that removes zones.total_slots removes it too.
        if (!(await typeColumn(queryInterface))) {
            await queryInterface.addColumn('parking_spots', 'vehicle_type', {
                type: Sequelize.ENUM('car', 'motorcycle', 'truck'),
                allowNull: false,
                defaultValue: 'car',
                after: 'zone_id',
            });
        }

        // The new index goes first: the foreign key of zone_id needs an
        // index that starts with zone_id, and the old one is the only one
        let indexes = await indexNames(queryInterface);
        if (!indexes.has(NEW_UNIQUE)) {
            await queryInterface.addIndex('parking_spots', ['zone_id', 'vehicle_type', 'spot_number'], { name: NEW_UNIQUE, unique: true });
        }
        indexes = await indexNames(queryInterface);
        if (indexes.has(OLD_UNIQUE)) {
            await queryInterface.removeIndex('parking_spots', OLD_UNIQUE);
        }

        // A type of the zone that has spots cannot be removed (RESTRICT): it
        // is turned off instead (is_accepting). Removing the zone removes its
        // spots and its types, as before.
        if (!(await hasTypeForeignKey(queryInterface))) {
            await queryInterface.sequelize.query(`
                ALTER TABLE parking_spots ADD CONSTRAINT ${TYPE_FK}
                FOREIGN KEY (zone_id, vehicle_type) REFERENCES zone_vehicle_types (zone_id, vehicle_type)
                ON DELETE RESTRICT ON UPDATE RESTRICT
            `);
        }
    },

    async down(queryInterface) {
        if (!(await typeColumn(queryInterface))) return;

        // Without the type, a motorcycle spot and a car spot with the same
        // number would break the old index, and the type of each spot would
        // be lost. Checked before any change.
        const [[{ total }]] = await queryInterface.sequelize.query(
            "SELECT COUNT(*) AS total FROM parking_spots WHERE vehicle_type <> 'car'"
        );
        if (Number(total) > 0) {
            throw new Error(`${total} spot(s) are not car spots: remove them before undoing this migration, nothing was changed`);
        }

        if (await hasTypeForeignKey(queryInterface)) {
            await queryInterface.sequelize.query(`ALTER TABLE parking_spots DROP FOREIGN KEY ${TYPE_FK}`);
        }
        let indexes = await indexNames(queryInterface);
        if (!indexes.has(OLD_UNIQUE)) {
            await queryInterface.addIndex('parking_spots', ['zone_id', 'spot_number'], { name: OLD_UNIQUE, unique: true });
        }
        indexes = await indexNames(queryInterface);
        if (indexes.has(NEW_UNIQUE)) {
            await queryInterface.removeIndex('parking_spots', NEW_UNIQUE);
        }
        await queryInterface.removeColumn('parking_spots', 'vehicle_type');
    },
};
