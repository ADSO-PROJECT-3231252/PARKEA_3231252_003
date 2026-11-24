// HU-31: the migrations of the vehicle types on a database of their own, as
// on the published site: it is migrated up to the last migration before
// them, it gets zones, spots (one of them disabled) and a reservation as they
// were, and then the migrations of HU-31 are done, undone and done again
// (AC-15). A database of its own, because the other tests add zones with
// other types, which the migrations cannot undo.
const { Sequelize } = require('sequelize');
const { testDatabaseUrl, sequelizeCli } = require('./globalSetup');

// The last migration before HU-31, and the first one of HU-31
const BEFORE_HU31 = '20261123100200-require-api-required-columns.js';
const FIRST_OF_HU31 = '20261124100000-create-zone-vehicle-types.js';

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

    test('every zone gets the car type with its spots and its rate, and every spot becomes a car spot with its number', async () => {
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
        // The reservation and the zones are as they were
        const now = await data();
        expect(now.zones).toEqual(before.data.zones);
        expect(now.reservations).toEqual(before.data.reservations);
    }, 120000);

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

    test('undoing them refuses while a zone has another type, and changes nothing', async () => {
        // Arrange: Zona B also takes motorcycles, with one spot
        await run("INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate) VALUES (UUID(), :b, 'motorcycle', 1, 1000)", { b: ZONE_B });
        await run("INSERT INTO parking_spots (id, zone_id, vehicle_type, spot_number, status) VALUES (UUID(), :b, 'motorcycle', 1, 'Available')", { b: ZONE_B });
        const schemaBefore = await schema();

        // Act + Assert
        expect(() => sequelizeCli('db:migrate:undo:all', URL_, ['--to', FIRST_OF_HU31])).toThrow('1 spot(s) are not car spots: remove them before undoing this migration, nothing was changed');
        expect(await schema()).toEqual(schemaBefore);
    }, 120000);
});
