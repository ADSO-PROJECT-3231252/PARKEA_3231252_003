// HU-31: the guards of the migration of the vehicle types of the zones. It
// counts the rows that would stop it before changing anything, and up and
// down can run again after a failure halfway (MySQL does not undo the
// statements of a migration that fails). The real ALTERs run on MySQL in
// tests/integration/schemaRules.test.js.
const { DataTypes } = require('sequelize');
const zoneTypes = require('../src/migrations/20261124100000-create-zone-vehicle-types');

// A queryInterface that answers as a database in a given state, and writes
// every change it is asked for in `changes`, in order:
// - count: the COUNT(*) of the guards, by a text of their SQL
// - table: whether zone_vehicle_types exists
// - checks: the checks of zone_vehicle_types that exist
// - indexes: the indexes of each table
// - column: the column parking_spots.vehicle_type, or null
// - foreignKey: whether parking_spots_zone_vehicle_type_fk exists
function fakeDatabase({ count = {}, table = false, checks = [], indexes = {}, column = null, foreignKey = false } = {}) {
    const changes = [];
    const change = (name) => jest.fn(async (...args) => {
        changes.push([name, ...args]);
    });
    const answer = (total) => [[{ total }]];
    return {
        changes,
        sequelize: {
            query: jest.fn(async (sql) => {
                if (sql.includes('information_schema.TABLES')) return answer(table ? 1 : 0);
                if (sql.includes("CONSTRAINT_TYPE = 'CHECK'")) return [checks.map((name) => ({ name }))];
                if (sql.includes("CONSTRAINT_TYPE = 'FOREIGN KEY'")) return answer(foreignKey ? 1 : 0);
                if (sql.trim().startsWith('SELECT COUNT')) {
                    const key = Object.keys(count).find((text) => sql.includes(text));
                    return answer(key ? count[key] : 0);
                }
                changes.push(['query', sql.replace(/\s+/g, ' ').trim()]);
                return [[]];
            }),
        },
        showIndex: jest.fn(async (name) => (indexes[name] ?? []).map((index) => ({ name: index }))),
        describeTable: jest.fn(async () => (column ? { id: {}, zone_id: {}, vehicle_type: column } : { id: {}, zone_id: {} })),
        createTable: change('createTable'),
        dropTable: change('dropTable'),
        addIndex: change('addIndex'),
        removeIndex: change('removeIndex'),
        addColumn: change('addColumn'),
        removeColumn: change('removeColumn'),
    };
}

const Sequelize = { ...DataTypes };
const namesOf = (changes) => changes.map(([name, arg]) => (name === 'query' ? arg.split(' ').slice(0, 4).join(' ') : `${name} ${typeof arg === 'string' ? arg : ''}`.trim()));

describe('The migration of the vehicle types of the zones (HU-31)', () => {
    test('creates the table, its index and its two checks, and gives every zone the car type', async () => {
        // Arrange
        const db = fakeDatabase();

        // Act
        await zoneTypes.up(db, Sequelize);

        // Assert
        expect(namesOf(db.changes)).toEqual([
            'createTable zone_vehicle_types',
            'addIndex zone_vehicle_types',
            'ALTER TABLE zone_vehicle_types ADD',
            'ALTER TABLE zone_vehicle_types ADD',
            'INSERT INTO zone_vehicle_types (id,',
        ]);
        const sqls = db.changes.filter(([name]) => name === 'query').map(([, sql]) => sql);
        expect(sqls.slice(0, 2)).toEqual([
            'ALTER TABLE zone_vehicle_types ADD CONSTRAINT zone_vehicle_types_total_slots_range CHECK (total_slots BETWEEN 1 AND 500)',
            'ALTER TABLE zone_vehicle_types ADD CONSTRAINT zone_vehicle_types_hourly_rate_positive CHECK (hourly_rate > 0)',
        ]);
        expect(sqls[2]).toBe(
            'INSERT INTO zone_vehicle_types (id, zone_id, vehicle_type, total_slots, hourly_rate, is_accepting) '
            + "SELECT UUID(), z.id, 'car', z.total_slots, z.hourly_rate, TRUE FROM zones AS z "
            + "WHERE NOT EXISTS (SELECT 1 FROM zone_vehicle_types AS t WHERE t.zone_id = z.id AND t.vehicle_type = 'car')",
        );
        const [, , index, options] = db.changes[1];
        expect(index).toEqual(['zone_id', 'vehicle_type']);
        expect(options).toEqual({ name: 'zone_vehicle_types_zone_type_unique', unique: true });
    });

    test('the table has the columns of the model, and goes away with its zone', async () => {
        // Arrange
        const db = fakeDatabase();

        // Act
        await zoneTypes.up(db, Sequelize);

        // Assert
        const columns = db.changes[0][2];
        expect(Object.keys(columns)).toEqual(['id', 'zone_id', 'vehicle_type', 'total_slots', 'hourly_rate', 'is_accepting']);
        expect(columns.zone_id).toMatchObject({ allowNull: false, references: { model: 'zones', key: 'id' }, onDelete: 'CASCADE' });
        expect(columns.vehicle_type.type.values).toEqual(['car', 'motorcycle', 'truck']);
        expect(columns.vehicle_type.allowNull).toBe(false);
        expect(columns.total_slots.allowNull).toBe(false);
        expect(columns.hourly_rate.type.toString()).toBe('DECIMAL(10,2)');
        expect(columns.hourly_rate.allowNull).toBe(false);
        expect(columns.is_accepting).toMatchObject({ allowNull: false, defaultValue: true });
    });

    test('stops before any change when a zone has spots or a rate outside the checks', async () => {
        // Arrange: a single zone, the smallest number that must stop it
        const db = fakeDatabase({ count: { 'FROM zones': 1 } });

        // Act + Assert
        await expect(zoneTypes.up(db, Sequelize)).rejects.toThrow('Fix these zones before this migration, nothing was changed: 1 zone(s)');
        expect(db.changes).toEqual([]);
    });

    test('the guard counts the zones that break each limit', async () => {
        // Arrange
        const db = fakeDatabase();

        // Act
        await zoneTypes.up(db, Sequelize);

        // Assert
        const guard = db.sequelize.query.mock.calls[0][0].replace(/\s+/g, ' ').trim();
        expect(guard).toBe('SELECT COUNT(*) AS total FROM zones WHERE NOT (total_slots BETWEEN 1 AND 500) OR NOT (hourly_rate > 0)');
    });

    test('after a failure halfway, up does only what is missing', async () => {
        // Arrange: the table, its index and the first check were created
        const db = fakeDatabase({
            table: true,
            indexes: { zone_vehicle_types: ['PRIMARY', 'zone_vehicle_types_zone_type_unique'] },
            checks: ['zone_vehicle_types_total_slots_range'],
        });

        // Act
        await zoneTypes.up(db, Sequelize);

        // Assert: the INSERT only adds the car types that are missing
        expect(namesOf(db.changes)).toEqual([
            'ALTER TABLE zone_vehicle_types ADD',
            'INSERT INTO zone_vehicle_types (id,',
        ]);
        expect(db.changes[0][1]).toContain('zone_vehicle_types_hourly_rate_positive');
    });

    test('down removes the table when every type is car', async () => {
        // Arrange
        const db = fakeDatabase({ table: true });

        // Act
        await zoneTypes.down(db);

        // Assert
        expect(namesOf(db.changes)).toEqual(['dropTable zone_vehicle_types']);
    });

    test('down stops before any change when a zone has another type, which zones cannot keep', async () => {
        // Arrange
        const db = fakeDatabase({ table: true, count: { "vehicle_type <> 'car'": 1 } });

        // Act + Assert
        await expect(zoneTypes.down(db)).rejects.toThrow("1 zone type(s) are not car: remove them before undoing this migration, nothing was changed");
        expect(db.changes).toEqual([]);
    });

    test('down does nothing when the table is already gone', async () => {
        // Arrange
        const db = fakeDatabase({ table: false });

        // Act
        await zoneTypes.down(db);

        // Assert
        expect(db.changes).toEqual([]);
    });
});
