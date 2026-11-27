'use strict';

// HU-31: removing a zone removes its spots and its types (both foreign keys
// to zones are CASCADE). With the foreign key of a spot to its type as
// RESTRICT (20261124100100), that worked only when MySQL removed the spots
// before the types: the order of the cascades is not fixed, and when the
// types went first, the spots that still pointed to them stopped the DELETE
// of the zone (error 1451, seen on MySQL 9.7).
//
// Now the spots of a type go with it, so the order does not matter. A type
// whose spots have reservations still cannot be removed, because the
// reservations keep their spot (their foreign key is RESTRICT), and the API
// never removes a type: it turns it off (is_accepting).
const TYPE_FK = 'parking_spots_zone_vehicle_type_fk';

// The rule of the foreign key when it is removed, or null when it is missing.
// MySQL does not undo the statements of a migration that fails halfway, so
// up and down only do what is still missing, and can run again.
async function deleteRule(queryInterface) {
    const [[row]] = await queryInterface.sequelize.query(`
        SELECT DELETE_RULE AS rule FROM information_schema.REFERENTIAL_CONSTRAINTS
        WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME = 'parking_spots' AND CONSTRAINT_NAME = '${TYPE_FK}'
    `);
    return row ? row.rule : null;
}

// Puts the foreign key back with `rule` when it is removed
async function setDeleteRule(queryInterface, rule) {
    const current = await deleteRule(queryInterface);
    if (current === rule) return;

    // The foreign key needs the type of the zone of every spot. While it is
    // missing (a failure halfway), a spot written by hand could break that,
    // and the ALTER would fail with a message that does not say which zone.
    const [[{ total }]] = await queryInterface.sequelize.query(`
        SELECT COUNT(*) AS total FROM parking_spots AS s
        WHERE NOT EXISTS (
            SELECT 1 FROM zone_vehicle_types AS t WHERE t.zone_id = s.zone_id AND t.vehicle_type = s.vehicle_type
        )
    `);
    if (Number(total) > 0) {
        throw new Error(`${total} spot(s) have a vehicle type that their zone does not have in zone_vehicle_types: fix them before this migration`);
    }

    if (current !== null) {
        await queryInterface.sequelize.query(`ALTER TABLE parking_spots DROP FOREIGN KEY ${TYPE_FK}`);
    }
    await queryInterface.sequelize.query(`
        ALTER TABLE parking_spots ADD CONSTRAINT ${TYPE_FK}
        FOREIGN KEY (zone_id, vehicle_type) REFERENCES zone_vehicle_types (zone_id, vehicle_type)
        ON DELETE ${rule} ON UPDATE RESTRICT
    `);
}

module.exports = {
    async up(queryInterface) {
        await setDeleteRule(queryInterface, 'CASCADE');
    },

    async down(queryInterface) {
        await setDeleteRule(queryInterface, 'RESTRICT');
    },
};
