// #372: the guards of the migrations of checks, indexes and required columns.
// Each migration counts the rows that break its rules before changing
// anything, and up and down can run again after a failure halfway. The real
// ALTERs run on MySQL in tests/integration/schemaRules.test.js.
const { DataTypes } = require('sequelize');
const checks = require('../src/migrations/20261123100000-add-check-constraints');
const indexes = require('../src/migrations/20261123100100-add-indexes-jobs-and-reset-tokens');
const required = require('../src/migrations/20261123100200-require-api-required-columns');

const CHECK_NAMES = [
    'zones_hourly_rate_positive',
    'payments_amount_not_negative',
    'zone_schedules_day_of_week_range',
    'zone_schedules_open_30_minutes',
    'zone_schedules_times_in_day',
    'zone_schedules_whole_minutes',
];

// A queryInterface whose COUNT(*) answers 1 (the smallest number that must
// stop the migration) for the SQL that includes one of the texts of
// `broken`, and 0 for the rest
function fakeQueryInterface({ broken = [], existingChecks = [], existingIndexes = {} } = {}) {
    const sqls = [];
    return {
        sqls,
        sequelize: {
            query: jest.fn(async (sql) => {
                sqls.push(sql);
                if (sql.includes('information_schema.TABLE_CONSTRAINTS')) {
                    return [existingChecks.map((name) => ({ name }))];
                }
                if (sql.startsWith('SELECT COUNT(*)')) {
                    return [[{ total: broken.some((text) => sql.includes(text)) ? 1 : 0 }]];
                }
                return [[]];
            }),
        },
        showIndex: jest.fn(async (table) => (existingIndexes[table] ?? []).map((name) => ({ name }))),
        addIndex: jest.fn(),
        removeIndex: jest.fn(),
        changeColumn: jest.fn(),
    };
}

const altersOf = (queryInterface) => queryInterface.sqls.filter((sql) => sql.startsWith('ALTER TABLE'));

describe('Migration of the checks (#372)', () => {
    test('adds the six checks when the data follows them', async () => {
        const queryInterface = fakeQueryInterface();

        await checks.up(queryInterface);

        expect(altersOf(queryInterface)).toEqual([
            'ALTER TABLE zones ADD CONSTRAINT zones_hourly_rate_positive CHECK (hourly_rate > 0)',
            'ALTER TABLE payments ADD CONSTRAINT payments_amount_not_negative CHECK (amount >= 0)',
            'ALTER TABLE zone_schedules ADD CONSTRAINT zone_schedules_day_of_week_range CHECK (day_of_week BETWEEN 1 AND 7)',
            'ALTER TABLE zone_schedules ADD CONSTRAINT zone_schedules_open_30_minutes CHECK (TIME_TO_SEC(closes_at) - TIME_TO_SEC(opens_at) >= 30 * 60)',
            "ALTER TABLE zone_schedules ADD CONSTRAINT zone_schedules_times_in_day CHECK (opens_at >= '00:00:00' AND closes_at <= '23:59:00')",
            'ALTER TABLE zone_schedules ADD CONSTRAINT zone_schedules_whole_minutes CHECK (SECOND(opens_at) = 0 AND SECOND(closes_at) = 0)',
        ]);
    });

    test('counts the rows that break each rule, all of them before any change', async () => {
        const queryInterface = fakeQueryInterface({ broken: ['FROM zones', 'SECOND(opens_at)'] });

        await expect(checks.up(queryInterface)).rejects.toThrow(
            'Fix these rows before this migration, nothing was changed: '
            + 'zones_hourly_rate_positive (hourly_rate > 0): 1 row(s) of zones; '
            + 'zone_schedules_whole_minutes (SECOND(opens_at) = 0 AND SECOND(closes_at) = 0): 1 row(s) of zone_schedules'
        );
        expect(queryInterface.sqls.filter((sql) => sql.startsWith('SELECT COUNT(*)'))).toHaveLength(6);
        expect(altersOf(queryInterface)).toEqual([]);
    });

    test('stops when a single row breaks a single rule', async () => {
        const queryInterface = fakeQueryInterface({ broken: ['FROM payments'] });

        await expect(checks.up(queryInterface)).rejects.toThrow(
            'Fix these rows before this migration, nothing was changed: payments_amount_not_negative (amount >= 0): 1 row(s) of payments'
        );
        expect(altersOf(queryInterface)).toEqual([]);
    });

    test('after a failure halfway, up adds only the checks that are missing', async () => {
        const queryInterface = fakeQueryInterface({ existingChecks: CHECK_NAMES.slice(0, 4) });

        await checks.up(queryInterface);

        expect(altersOf(queryInterface).map((sql) => sql.split(' ')[5])).toEqual(CHECK_NAMES.slice(4));
    });

    test('down removes only the checks that are still there', async () => {
        const queryInterface = fakeQueryInterface({ existingChecks: ['payments_amount_not_negative', 'zone_schedules_whole_minutes'] });

        await checks.down(queryInterface);

        expect(altersOf(queryInterface)).toEqual([
            'ALTER TABLE payments DROP CHECK payments_amount_not_negative',
            'ALTER TABLE zone_schedules DROP CHECK zone_schedules_whole_minutes',
        ]);
    });
});

describe('Migration of the indexes (#372)', () => {
    test('adds the three indexes', async () => {
        const queryInterface = fakeQueryInterface();

        await indexes.up(queryInterface);

        expect(queryInterface.addIndex.mock.calls).toEqual([
            ['reservations', ['status', 'hold_expires_at'], { name: 'reservations_status_hold_expires_at_idx' }],
            ['reservations', ['status', 'end_time'], { name: 'reservations_status_end_time_idx' }],
            ['password_reset_tokens', ['token_hash'], { name: 'password_reset_tokens_token_hash_idx' }],
        ]);
    });

    test('after a failure halfway, up adds only the indexes that are missing', async () => {
        const queryInterface = fakeQueryInterface({ existingIndexes: { reservations: ['reservations_status_hold_expires_at_idx'] } });

        await indexes.up(queryInterface);

        expect(queryInterface.addIndex.mock.calls.map((call) => call[2].name)).toEqual([
            'reservations_status_end_time_idx',
            'password_reset_tokens_token_hash_idx',
        ]);
    });

    test('down removes only the indexes that are still there', async () => {
        const queryInterface = fakeQueryInterface({ existingIndexes: { password_reset_tokens: ['password_reset_tokens_token_hash_idx'] } });

        await indexes.down(queryInterface);

        expect(queryInterface.removeIndex.mock.calls).toEqual([['password_reset_tokens', 'password_reset_tokens_token_hash_idx']]);
    });
});

describe('Migration of the required columns (#372)', () => {
    const COLUMNS = [
        ['users', 'document_type'],
        ['vehicles', 'brand'],
        ['vehicles', 'model'],
        ['vehicles', 'color'],
        ['zones', 'address'],
        ['zones', 'latitude'],
        ['zones', 'longitude'],
    ];

    test('makes the seven columns required and removes the default of the rate', async () => {
        const queryInterface = fakeQueryInterface();

        await required.up(queryInterface, DataTypes);

        const calls = queryInterface.changeColumn.mock.calls;
        expect(calls.map(([table, column, { allowNull }]) => [table, column, allowNull])).toEqual([
            ...COLUMNS.map(([table, column]) => [table, column, false]),
            ['reservations', 'applied_hourly_rate', false],
        ]);
        expect(calls.every(([, , definition]) => !('defaultValue' in definition))).toBe(true);
        expect(calls[0][2].type.values).toEqual(['CC', 'TI', 'CE', 'PASSPORT']);
    });

    test('stops on the NULL values of every column before any change', async () => {
        const queryInterface = fakeQueryInterface({ broken: ['FROM users WHERE document_type', 'FROM zones WHERE latitude'] });

        await expect(required.up(queryInterface, DataTypes)).rejects.toThrow(
            'Fill in these NULL values before this migration, nothing was changed: users.document_type: 1 row(s); zones.latitude: 1 row(s)'
        );
        expect(queryInterface.sqls.filter((sql) => sql.startsWith('SELECT COUNT(*)'))).toHaveLength(7);
        expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    });

    test('stops when a single row of a single column is NULL', async () => {
        const queryInterface = fakeQueryInterface({ broken: ['FROM vehicles WHERE color'] });

        await expect(required.up(queryInterface, DataTypes)).rejects.toThrow(
            'Fill in these NULL values before this migration, nothing was changed: vehicles.color: 1 row(s)'
        );
        expect(queryInterface.changeColumn).not.toHaveBeenCalled();
    });

    test('leaves the phone and the document number optional', async () => {
        const queryInterface = fakeQueryInterface();

        await required.up(queryInterface, DataTypes);

        const changed = queryInterface.changeColumn.mock.calls.map(([, column]) => column);
        expect(changed).not.toContain('phone');
        expect(changed).not.toContain('document_number');
    });

    test('down makes them optional again and gives the rate back its default', async () => {
        const queryInterface = fakeQueryInterface();

        await required.down(queryInterface, DataTypes);

        const calls = queryInterface.changeColumn.mock.calls;
        expect(calls.map(([table, column, { allowNull }]) => [table, column, allowNull])).toEqual([
            ...COLUMNS.map(([table, column]) => [table, column, true]),
            ['reservations', 'applied_hourly_rate', false],
        ]);
        expect(calls[7][2].defaultValue).toBe(0.00);
    });
});
