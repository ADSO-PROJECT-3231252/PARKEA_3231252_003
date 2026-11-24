// HU-31: the vehicle types of the zones against a real MySQL database. Until
// the API takes the types, every zone has the car type, with the spots and
// the rate of the zone, and all its spots are car spots (AC-15). The
// migrations of the types can be undone and done again on a database with
// zones, spots and reservations.
const request = require('supertest');
const { sequelize, Zona } = require('../../src/models');
const zoneTypes = require('../../src/migrations/20261124100000-create-zone-vehicle-types');
const spotType = require('../../src/migrations/20261124100100-add-vehicle-type-to-parking-spots');
const { app, inMinutes, unique, createUser, adminToken, createZone, reserve } = require('./helpers');

const run = (sql, replacements) => sequelize.query(sql, { replacements });

// The types of a zone, without their ids
async function typesOf(zoneId) {
    const [rows] = await run(`
        SELECT vehicle_type AS vehicleType, total_slots AS totalSlots, hourly_rate AS hourlyRate, is_accepting AS isAccepting
        FROM zone_vehicle_types WHERE zone_id = :zoneId ORDER BY vehicle_type
    `, { zoneId });
    return rows.map((row) => ({ ...row, hourlyRate: Number(row.hourlyRate) }));
}

// The spots of a zone, as "type number status", by type and number
async function spotsOf(zoneId) {
    const [rows] = await run(
        'SELECT vehicle_type AS vehicleType, spot_number AS spotNumber, status FROM parking_spots WHERE zone_id = :zoneId ORDER BY vehicle_type, spot_number',
        { zoneId }
    );
    return rows.map((row) => `${row.vehicleType} ${row.spotNumber} ${row.status}`);
}

// PUT /api/zones/:id with the values of the zone and its car spots and rate
async function edit(zona, { totalSlots, hourlyRate }) {
    return request(app)
        .put(`/api/zones/${zona.id}`)
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({
            name: zona.name,
            address: zona.address,
            latitude: Number(zona.latitude),
            longitude: Number(zona.longitude),
            vehicleTypes: [{ vehicleType: 'car', totalSlots, hourlyRate }],
            open24h: true,
        });
}

describe('The car type of every zone (HU-31)', () => {
    test('each demo zone of the seeders has the car type, with its spots and its rate, and only car spots', async () => {
        // Arrange
        const zonas = await Zona.findAll({ where: { name: ['Centro', 'Parque Olaya', 'La Popa', 'Av. Simón Bolívar'] } });

        // Assert
        expect(zonas).toHaveLength(4);
        for (const zona of zonas) {
            expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: zona.totalSlots, hourlyRate: Number(zona.hourlyRate), isAccepting: 1 }]);
            const spots = await spotsOf(zona.id);
            expect(spots).toEqual(Array.from({ length: zona.totalSlots }, (_, i) => `car ${i + 1} Available`));
        }
    });

    test('a zone created through the API has the car type and car spots numbered from 1', async () => {
        // Act
        const zona = await createZone(3);

        // Assert
        expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: 3, hourlyRate: 2000, isAccepting: 1 }]);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Available']);
    });

    test('editing a zone keeps its car type with its spots and its rate', async () => {
        // Arrange
        const zona = await createZone(3);

        // Act: more spots and another rate, then fewer spots
        const bigger = await edit(zona, { totalSlots: 5, hourlyRate: 2500 });
        const smaller = await edit(zona, { totalSlots: 4, hourlyRate: 2500 });

        // Assert: the highest number is disabled, and the numbers never repeat
        expect(bigger.status).toBe(200);
        expect(smaller.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: 4, hourlyRate: 2500, isAccepting: 1 }]);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Available', 'car 4 Available', 'car 5 Disabled']);
    });

    test('a reduction that is refused leaves the car type as it was', async () => {
        // Arrange: a zone of 2 spots, both reserved from now on
        const zona = await createZone(2);
        for (const cuenta of await Promise.all([createUser(), createUser()])) {
            const res = await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
            if (res.status !== 201) throw new Error(`Not reserved: ${res.status} ${JSON.stringify(res.body)}`);
        }

        // Act
        const res = await edit(zona, { totalSlots: 1, hourlyRate: 9000 });

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CAPACITY_BELOW_IN_USE');
        expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: 2, hourlyRate: 2000, isAccepting: 1 }]);
    });

    test('a zone that lost its car type (written by hand) gets it again when it is edited', async () => {
        // Arrange: a zone of its own, without spots or types, as a script would write it
        const zona = await Zona.create({ name: `Zona ${unique()}`, address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, totalSlots: 2, hourlyRate: 2000 });

        // Act
        const res = await edit(zona, { totalSlots: 2, hourlyRate: 2200 });

        // Assert
        expect(res.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: 2, hourlyRate: 2200, isAccepting: 1 }]);
    });
});

describe('Undoing and doing again the migrations of the types (HU-31)', () => {
    const queryInterface = sequelize.getQueryInterface();
    let zona;

    beforeAll(async () => {
        // A zone with a reservation and a disabled spot, on top of the zones
        // of the seeders and of the other tests
        zona = await createZone(3);
        await edit(zona, { totalSlots: 2, hourlyRate: 2000 });
        const cuenta = await createUser();
        const res = await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
        if (res.status !== 201) throw new Error(`Not reserved: ${res.status} ${JSON.stringify(res.body)}`);
    });

    test('down refuses while a zone has another type, and changes nothing', async () => {
        // Arrange
        await run("INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :zona, 'truck', 1, 5000)", { zona: zona.id });
        await run("INSERT INTO parking_spots (id, zone_id, vehicle_type, spot_number, status) VALUES (UUID(), :zona, 'truck', 1, 'Available')", { zona: zona.id });

        // Act + Assert
        await expect(spotType.down(queryInterface)).rejects.toThrow('1 spot(s) are not car spots');
        await run("DELETE FROM parking_spots WHERE zone_id = :zona AND vehicle_type = 'truck'", { zona: zona.id });
        await expect(zoneTypes.down(queryInterface)).rejects.toThrow('1 zone type(s) are not car');
        await run("DELETE FROM zone_vehicle_types WHERE zone_id = :zona AND vehicle_type = 'truck'", { zona: zona.id });
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Disabled']);
    });

    test('down and up again leave the same types, spots and indexes, and the zones keep working', async () => {
        // Arrange: every type and every spot, before
        const [typesBefore] = await run('SELECT zone_id, vehicle_type, total_slots, hourly_rate, is_accepting FROM zone_vehicle_types ORDER BY zone_id, vehicle_type');
        const [spotsBefore] = await run('SELECT id, zone_id, vehicle_type, spot_number, status FROM parking_spots ORDER BY id');
        const [indexesBefore] = await run(`
            SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_
            FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('parking_spots', 'zone_vehicle_types')
            GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME
        `);
        const [constraintsBefore] = await run(`
            SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME IN ('parking_spots', 'zone_vehicle_types')
            ORDER BY TABLE_NAME, CONSTRAINT_NAME
        `);

        // Act: down
        await spotType.down(queryInterface);
        await zoneTypes.down(queryInterface);
        const [[afterDown]] = await run(`
            SELECT (SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'zone_vehicle_types') AS tables_,
                (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'parking_spots' AND COLUMN_NAME = 'vehicle_type') AS columns_,
                (SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND INDEX_NAME = 'parking_spots_zone_spot_unique') AS oldIndex
        `);
        // ...and up again
        await zoneTypes.up(queryInterface, sequelize.constructor);
        await spotType.up(queryInterface, sequelize.constructor);

        // Assert
        expect(afterDown).toEqual({ tables_: 0, columns_: 0, oldIndex: 1 });
        const [typesAfter] = await run('SELECT zone_id, vehicle_type, total_slots, hourly_rate, is_accepting FROM zone_vehicle_types ORDER BY zone_id, vehicle_type');
        const [spotsAfter] = await run('SELECT id, zone_id, vehicle_type, spot_number, status FROM parking_spots ORDER BY id');
        const [indexesAfter] = await run(`
            SELECT TABLE_NAME, INDEX_NAME, NON_UNIQUE, GROUP_CONCAT(COLUMN_NAME ORDER BY SEQ_IN_INDEX) AS columns_
            FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('parking_spots', 'zone_vehicle_types')
            GROUP BY TABLE_NAME, INDEX_NAME, NON_UNIQUE ORDER BY TABLE_NAME, INDEX_NAME
        `);
        const [constraintsAfter] = await run(`
            SELECT TABLE_NAME, CONSTRAINT_NAME, CONSTRAINT_TYPE FROM information_schema.TABLE_CONSTRAINTS
            WHERE CONSTRAINT_SCHEMA = DATABASE() AND TABLE_NAME IN ('parking_spots', 'zone_vehicle_types')
            ORDER BY TABLE_NAME, CONSTRAINT_NAME
        `);
        // The types that were there come back the same. A zone that had
        // none (written by hand by another test) gets its car type too.
        const hadTypes = new Set(typesBefore.map((row) => row.zone_id));
        expect(typesAfter.filter((row) => hadTypes.has(row.zone_id))).toEqual(typesBefore);
        const [withoutTheirCarType] = await run(`
            SELECT z.id FROM zones AS z LEFT JOIN zone_vehicle_types AS t ON t.zone_id = z.id AND t.vehicle_type = 'car'
            WHERE t.id IS NULL OR t.total_slots <> z.total_slots OR t.hourly_rate <> z.hourly_rate
        `);
        expect(withoutTheirCarType).toEqual([]);
        expect(spotsAfter).toEqual(spotsBefore);
        expect(indexesAfter).toEqual(indexesBefore);
        expect(constraintsAfter).toEqual(constraintsBefore);

        // A new reservation and a new zone work as before
        const cuenta = await createUser();
        const res = await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
        expect(res.status).toBe(201);
        expect(res.body.reservation.spotNumber).toBe(2);
        expect(await typesOf((await createZone(1)).id)).toEqual([{ vehicleType: 'car', totalSlots: 1, hourlyRate: 2000, isAccepting: 1 }]);
    });
});
