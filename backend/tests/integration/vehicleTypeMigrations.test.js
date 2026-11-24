// HU-31: the migrations of the vehicle types on a database of their own, as
// on the published site: it is migrated up to the last migration before
// them, it gets zones, spots (one of them disabled) and a reservation as they
// were, and then the migrations of HU-31 are done, undone and done again
// (AC-15). One makes the spots of a type go with it, so a zone can always be
// removed, and the last one removes the spots and the rate of the zones;
// undoing it gives them back from the types. A database of its own, because
// the other tests add zones with other types, which the migrations cannot
// undo.
const { Sequelize } = require('sequelize');
const { testDatabaseUrl, sequelizeCli } = require('./globalSetup');

// The last migration before HU-31, and the first one of HU-31
const BEFORE_HU31 = '20261123100200-require-api-required-columns.js';
const FIRST_OF_HU31 = '20261124100000-create-zone-vehicle-types.js';
const CASCADE = '20261124100150-remove-spots-with-their-zone-type.js';
const UNDO_ONE = 'db:migrate:undo';

// The foreign key of a spot to the type of its zone, as MySQL writes it
const typeForeignKey = (onDelete) => `CONSTRAINT \`parking_spots_zone_vehicle_type_fk\` FOREIGN KEY (\`zone_id\`, \`vehicle_type\`) REFERENCES \`zone_vehicle_types\` (\`zone_id\`, \`vehicle_type\`) ON DELETE ${onDelete} ON UPDATE RESTRICT`;
const spotsTable = async () => (await schema()).find((table) => table.startsWith('CREATE TABLE `parking_spots`'));

// The address of the test database, with another name that also ends in _test
function ownDatabaseUrl() {
    const url = new URL(testDatabaseUrl());
    url.pathname = `/${decodeURIComponent(url.pathname.slice(1)).replace(/_test$/, '')}_migrations_test`;
    return url.toString();
}

const URL_ = ownDatabaseUrl();
let db;
const run = (sql, replacements) => db.query(sql, { replacements });
const rows = async (sql) => (await run(sql))[0];

// Every table, as MySQL writes it, without the auto-increment counters
async function schema() {
    const tables = await rows("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME <> 'SequelizeMeta' ORDER BY TABLE_NAME");
    const out = [];
    for (const { name } of tables) {
        const [[created]] = await run(`SHOW CREATE TABLE \`${name}\``);
        out.push(created['Create Table'].replace(/ AUTO_INCREMENT=\d+/, ''));
    }
    return out;
}

// The spots and the rate of each zone, while the zones have them
const zoneSpotsAndRates = () => rows('SELECT id, total_slots, hourly_rate FROM zones ORDER BY id');

// The table of the zones, as MySQL writes it
const zonesTable = async () => (await schema()).find((table) => table.startsWith('CREATE TABLE `zones`'));

// The data of the tables that the migrations touch
const data = async () => ({
    zones: await rows('SELECT * FROM zones ORDER BY id'),
    spots: await rows('SELECT id, zone_id, spot_number, status FROM parking_spots ORDER BY id'),
    reservations: await rows('SELECT * FROM reservations ORDER BY id'),
});

const ZONE_A = '10000000-0000-4000-8000-00000000000a';
const ZONE_B = '10000000-0000-4000-8000-00000000000b';
let before;

beforeAll(async () => {
    for (const command of ['db:drop', 'db:create']) sequelizeCli(command, URL_);
    sequelizeCli('db:migrate', URL_, ['--to', BEFORE_HU31]);
    db = new Sequelize(URL_, { logging: false });

    // Two zones: A with 3 spots (the third disabled) and a reservation in
    // spot 1, and B with 2 spots
    await run("INSERT INTO roles (id, name) VALUES ('20000000-0000-4000-8000-000000000001', 'user')");
    await run(`INSERT INTO users (id, full_name, email, password, role_id, created_at, document_type)
        VALUES ('30000000-0000-4000-8000-000000000001', 'Laura Gómez', 'laura@correo.test', 'not-used', '20000000-0000-4000-8000-000000000001', UTC_TIMESTAMP(), 'CC')`);
    await run(`INSERT INTO vehicles (id, plate, vehicle_type, brand, model, color, user_id, created_at)
        VALUES ('40000000-0000-4000-8000-000000000001', 'ABC123', 'car', 'Mazda', '3', 'Rojo', '30000000-0000-4000-8000-000000000001', UTC_TIMESTAMP())`);
    await run(`INSERT INTO zones (id, name, address, total_slots, hourly_rate, latitude, longitude)
        VALUES (:a, 'Zona A', 'Calle 1', 2, 2500.00, 4.8133, -75.6961), (:b, 'Zona B', 'Calle 2', 2, 1800.00, 4.8375, -75.6689)`, { a: ZONE_A, b: ZONE_B });
    await run(`INSERT INTO parking_spots (id, zone_id, spot_number, status) VALUES
        ('50000000-0000-4000-8000-0000000000a1', :a, 1, 'Available'),
        ('50000000-0000-4000-8000-0000000000a2', :a, 2, 'Available'),
        ('50000000-0000-4000-8000-0000000000a3', :a, 3, 'Disabled'),
        ('50000000-0000-4000-8000-0000000000b1', :b, 1, 'Available'),
        ('50000000-0000-4000-8000-0000000000b2', :b, 2, 'Available')`, { a: ZONE_A, b: ZONE_B });
    await run(`INSERT INTO reservations (id, user_id, zone_id, vehicle_id, start_time, end_time, spot_number, status, parking_spot_id, open_ended, applied_hourly_rate)
        VALUES ('60000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', :a, '40000000-0000-4000-8000-000000000001',
            UTC_TIMESTAMP() + INTERVAL 1 HOUR, UTC_TIMESTAMP() + INTERVAL 3 HOUR, 1, 'Active', '50000000-0000-4000-8000-0000000000a1', 0, 2500.00)`, { a: ZONE_A });

    before = { schema: await schema(), data: await data() };
}, 120000);

afterAll(async () => {
    await db?.close();
    sequelizeCli('db:drop', URL_);
});

describe('The migrations of the vehicle types on a database with data (HU-31, AC-15)', () => {
    let after;

    test('every zone gets the car type with its spots and its rate, every spot becomes a car spot with its number, and the zones lose their spots and rate', async () => {
        // Act
        sequelizeCli('db:migrate', URL_);
        after = { schema: await schema(), types: await rows('SELECT zone_id, vehicle_type, total_slots, hourly_rate, is_accepting FROM zone_vehicle_types ORDER BY zone_id') };

        // Assert
        expect(after.types).toEqual([
            { zone_id: ZONE_A, vehicle_type: 'car', total_slots: 2, hourly_rate: '2500.00', is_accepting: 1 },
            { zone_id: ZONE_B, vehicle_type: 'car', total_slots: 2, hourly_rate: '1800.00', is_accepting: 1 },
        ]);
        expect(await rows('SELECT zone_id, vehicle_type, spot_number, status FROM parking_spots ORDER BY zone_id, spot_number')).toEqual([
            { zone_id: ZONE_A, vehicle_type: 'car', spot_number: 1, status: 'Available' },
            { zone_id: ZONE_A, vehicle_type: 'car', spot_number: 2, status: 'Available' },
            { zone_id: ZONE_A, vehicle_type: 'car', spot_number: 3, status: 'Disabled' },
            { zone_id: ZONE_B, vehicle_type: 'car', spot_number: 1, status: 'Available' },
            { zone_id: ZONE_B, vehicle_type: 'car', spot_number: 2, status: 'Available' },
        ]);
        // The reservation is as it was, and the zones keep everything else
        const now = await data();
        expect(now.zones).toEqual(before.data.zones.map((zona) => {
            const fila = { ...zona };
            delete fila.total_slots;
            delete fila.hourly_rate;
            return fila;
        }));
        expect(now.reservations).toEqual(before.data.reservations);
    }, 120000);

    test('the zones have no check of their rate, a spot has no type by default, and the spots of a type go with it', async () => {
        // Assert
        expect(await zonesTable()).not.toMatch(/total_slots|hourly_rate|zones_hourly_rate_positive/);
        expect(await spotsTable()).toContain("`vehicle_type` enum('car','motorcycle','truck') NOT NULL,");
        expect(await spotsTable()).toContain(typeForeignKey('CASCADE'));
    });

    test('undoing them leaves the schema and the data exactly as before', async () => {
        // Act
        sequelizeCli('db:migrate:undo:all', URL_, ['--to', FIRST_OF_HU31]);

        // Assert
        expect(await schema()).toEqual(before.schema);
        expect(await data()).toEqual(before.data);
    }, 120000);

    test('doing them again gives the same schema and the same types', async () => {
        // Act
        sequelizeCli('db:migrate', URL_);

        // Assert
        expect(await schema()).toEqual(after.schema);
        expect(await rows('SELECT zone_id, vehicle_type, total_slots, hourly_rate, is_accepting FROM zone_vehicle_types ORDER BY zone_id')).toEqual(after.types);
    }, 120000);

    test('undoing the last one gives each zone the spots of the types it accepts and the rate of the first of them', async () => {
        // Arrange: Zona A also takes trucks (one spot, a higher rate, and
        // after the cars), and Zona B takes motorcycles, with one spot, and
        // its cars are turned off
        await run("INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :a, 'truck', 1, 5000)", { a: ZONE_A });
        await run("INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :b, 'motorcycle', 1, 1000)", { b: ZONE_B });
        await run("INSERT INTO parking_spots (id, zone_id, vehicle_type, spot_number, status) VALUES (UUID(), :b, 'motorcycle', 1, 'Available')", { b: ZONE_B });
        await run("UPDATE zone_vehicle_types SET is_accepting = FALSE WHERE zone_id = :b AND vehicle_type = 'car'", { b: ZONE_B });

        // Act
        sequelizeCli(UNDO_ONE, URL_);

        // Assert: the zones as they were before HU-31, with these values
        expect(await zoneSpotsAndRates()).toEqual([
            { id: ZONE_A, total_slots: 3, hourly_rate: '2500.00' },
            { id: ZONE_B, total_slots: 1, hourly_rate: '1000.00' },
        ]);
        expect(await zonesTable()).toBe(before.schema.find((table) => table.startsWith('CREATE TABLE `zones`')));
        expect((await schema()).find((table) => table.startsWith('CREATE TABLE `parking_spots`'))).toContain("`vehicle_type` enum('car','motorcycle','truck') NOT NULL DEFAULT 'car',");
    }, 120000);

    test('undoing the one of the cascade gives the spots of a type back their RESTRICT', async () => {
        // Act
        sequelizeCli(UNDO_ONE, URL_);

        // Assert
        expect(await spotsTable()).toContain(typeForeignKey('RESTRICT'));
    }, 120000);

    test('undoing the others refuses while a zone has another type, and changes nothing', async () => {
        // Arrange: the motorcycles of Zona B
        const schemaBefore = await schema();

        // Act + Assert
        expect(() => sequelizeCli('db:migrate:undo:all', URL_, ['--to', FIRST_OF_HU31])).toThrow('1 spot(s) are not car spots: remove them before undoing this migration, nothing was changed');
        expect(await schema()).toEqual(schemaBefore);

        // The one of the cascade is done again for the next tests
        sequelizeCli('db:migrate', URL_, ['--to', CASCADE]);
        expect(await spotsTable()).toContain(typeForeignKey('CASCADE'));
    }, 120000);

    test('doing the last one again refuses while a zone has no type, and changes nothing', async () => {
        // Arrange: a zone written by hand, without its types
        await run(`INSERT INTO zones (id, name, address, total_slots, hourly_rate, latitude, longitude)
            VALUES ('10000000-0000-4000-8000-00000000000c', 'Zona C', 'Calle 3', 2, 2000.00, 4.8291, -75.6645)`);
        const schemaBefore = await schema();

        // Act + Assert
        expect(() => sequelizeCli('db:migrate', URL_)).toThrow('1 zone(s) have no vehicle type in zone_vehicle_types');
        expect(await schema()).toEqual(schemaBefore);
        expect(await zoneSpotsAndRates()).toHaveLength(3);

        // Without that zone it can be done
        await run("DELETE FROM zones WHERE id = '10000000-0000-4000-8000-00000000000c'");
        sequelizeCli('db:migrate', URL_);
        expect(await schema()).toEqual(after.schema);
    }, 120000);

    test('undoing the last one refuses while a zone accepts no type, because it would have no rate, and changes nothing', async () => {
        // Arrange: Zona A turns off all its types
        await run('UPDATE zone_vehicle_types SET is_accepting = FALSE WHERE zone_id = :a', { a: ZONE_A });

        // Act + Assert
        expect(() => sequelizeCli(UNDO_ONE, URL_)).toThrow('1 zone(s) accept no vehicle type, so they have no rate: turn one of their types on before undoing this migration. Nothing was changed');
        expect(await schema()).toEqual(after.schema);

        // With its types on again it can be undone
        await run('UPDATE zone_vehicle_types SET is_accepting = TRUE WHERE zone_id = :a', { a: ZONE_A });
        sequelizeCli(UNDO_ONE, URL_);
        expect(await zoneSpotsAndRates()).toEqual([
            { id: ZONE_A, total_slots: 3, hourly_rate: '2500.00' },
            { id: ZONE_B, total_slots: 1, hourly_rate: '1000.00' },
        ]);
    }, 120000);

    test('the one of the cascade can run again after a failure halfway, and refuses a spot of a type its zone does not have', async () => {
        // Arrange: the foreign key was removed, as by a failure halfway, and
        // meanwhile Zona B got a truck spot without the truck type
        await run('ALTER TABLE parking_spots DROP FOREIGN KEY parking_spots_zone_vehicle_type_fk');
        await run("INSERT INTO parking_spots (id, zone_id, vehicle_type, spot_number, status) VALUES ('50000000-0000-4000-8000-0000000000bt', :b, 'truck', 1, 'Available')", { b: ZONE_B });

        // Act + Assert
        expect(() => sequelizeCli(UNDO_ONE, URL_)).toThrow('1 spot(s) have a vehicle type that their zone does not have in zone_vehicle_types: fix them before this migration');
        expect(await spotsTable()).not.toContain('parking_spots_zone_vehicle_type_fk');

        // Without that spot it puts the foreign key back
        await run("DELETE FROM parking_spots WHERE id = '50000000-0000-4000-8000-0000000000bt'");
        sequelizeCli(UNDO_ONE, URL_);
        expect(await spotsTable()).toContain(typeForeignKey('RESTRICT'));
    }, 120000);
});
