// HU-31: the demo zones of the seeders accept cars, with their spots and
// their rate, like a zone created through the API (zona.controller.js).
const { Op } = require('sequelize');

// uuid 14 is only an ES module, which Jest cannot load with require; the
// seeder only needs new ids
jest.mock('uuid', () => ({ v4: () => crypto.randomUUID() }));
const seeder = require('../src/seeders/20260804123544-demo-zones');

// A queryInterface that keeps what the seeder writes and deletes, in order
function fakeQueryInterface(zoneIds = []) {
    const calls = [];
    return {
        calls,
        bulkInsert: jest.fn(async (table, rows) => {
            calls.push(['insert', table, rows]);
        }),
        bulkDelete: jest.fn(async (table, where) => {
            calls.push(['delete', table, where]);
        }),
        sequelize: {
            QueryTypes: { SELECT: 'SELECT' },
            query: jest.fn(async () => zoneIds.map((id) => ({ id }))),
        },
    };
}

const rowsOf = (calls, table) => calls.find(([action, name]) => action === 'insert' && name === table)[2];

describe('The demo zones of the seeders (HU-31)', () => {
    test('each zone gets the car type, with its spots and its rate', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        const zonas = rowsOf(queryInterface.calls, 'zones');
        const tipos = rowsOf(queryInterface.calls, 'zone_vehicle_types');
        expect(zonas).toHaveLength(4);
        expect(tipos).toEqual(zonas.map((zona) => ({
            id: expect.any(String),
            zone_id: zona.id,
            vehicle_type: 'car',
            total_slots: zona.total_slots,
            hourly_rate: zona.hourly_rate,
            is_accepting: true,
        })));
        expect(new Set(tipos.map((tipo) => tipo.id)).size).toBe(4);
    });

    test('the types go after their zones and before the spots, which belong to them', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        expect(queryInterface.calls.map(([, table]) => table)).toEqual(['zones', 'zone_vehicle_types', 'parking_spots']);
    });

    test('each zone gets as many spots as its car type, numbered from 1', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        const spots = rowsOf(queryInterface.calls, 'parking_spots');
        for (const tipo of rowsOf(queryInterface.calls, 'zone_vehicle_types')) {
            const numbers = spots.filter((spot) => spot.zone_id === tipo.zone_id).map((spot) => spot.spot_number);
            expect(numbers).toEqual(Array.from({ length: tipo.total_slots }, (_, i) => i + 1));
        }
    });

    test('down removes the spots, then the types and then the zones', async () => {
        // Arrange: the 4 demo zones exist
        const queryInterface = fakeQueryInterface(['z1', 'z2', 'z3', 'z4']);

        // Act
        await seeder.down(queryInterface, { Op });

        // Assert
        expect(queryInterface.calls.map(([action, table]) => `${action} ${table}`)).toEqual([
            'delete parking_spots',
            'delete zone_vehicle_types',
            'delete zones',
        ]);
        expect(queryInterface.calls[1][2]).toEqual({ zone_id: { [Op.in]: ['z1', 'z2', 'z3', 'z4'] } });
    });
});
