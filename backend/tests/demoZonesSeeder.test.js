// HU-31 (AC-16): the demo zones of the seeders accept several vehicle types,
// with their spots and their rates, like a zone created through the API
// (zona.controller.js).
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
    test('each zone gets its vehicle types, with their spots and their rates', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        const zonas = rowsOf(queryInterface.calls, 'zones');
        const tipos = rowsOf(queryInterface.calls, 'zone_vehicle_types');
        const idOf = (name) => zonas.find((zona) => zona.name === name).id;
        const tipo = (name, vehicleType, totalSlots, hourlyRate) => ({ id: expect.any(String), zone_id: idOf(name), vehicle_type: vehicleType, total_slots: totalSlots, hourly_rate: hourlyRate, is_accepting: true });
        expect(zonas.map((zona) => zona.name)).toEqual(['Centro', 'Parque Olaya', 'La Popa', 'Av. Simón Bolívar']);
        expect(tipos).toEqual([
            tipo('Centro', 'car', 30, 2000),
            tipo('Centro', 'motorcycle', 12, 1000),
            tipo('Parque Olaya', 'car', 18, 2500),
            tipo('La Popa', 'car', 24, 1800),
            tipo('La Popa', 'motorcycle', 8, 900),
            tipo('La Popa', 'truck', 4, 5000),
            tipo('Av. Simón Bolívar', 'car', 45, 1500),
            tipo('Av. Simón Bolívar', 'truck', 6, 4500),
        ]);
        expect(new Set(tipos.map((item) => item.id)).size).toBe(8);
    });

    test('until the last migration of HU-31, a zone keeps the spots of all its types and the rate of its first type', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        const zonas = rowsOf(queryInterface.calls, 'zones');
        expect(zonas.map((zona) => [zona.name, zona.total_slots, zona.hourly_rate])).toEqual([
            ['Centro', 42, 2000],
            ['Parque Olaya', 18, 2500],
            ['La Popa', 36, 1800],
            ['Av. Simón Bolívar', 51, 1500],
        ]);
    });

    test('the types go after their zones and before the spots, which belong to them', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert
        expect(queryInterface.calls.map(([, table]) => table)).toEqual(['zones', 'zone_vehicle_types', 'parking_spots']);
    });

    test('each type of a zone gets as many spots as it has, of that type and numbered from 1', async () => {
        // Arrange
        const queryInterface = fakeQueryInterface();

        // Act
        await seeder.up(queryInterface);

        // Assert: every spot belongs to a type of its zone
        const spots = rowsOf(queryInterface.calls, 'parking_spots');
        const tipos = rowsOf(queryInterface.calls, 'zone_vehicle_types');
        for (const tipo of tipos) {
            const numbers = spots.filter((spot) => spot.zone_id === tipo.zone_id && spot.vehicle_type === tipo.vehicle_type).map((spot) => spot.spot_number);
            expect(numbers).toEqual(Array.from({ length: tipo.total_slots }, (_, i) => i + 1));
        }
        expect(spots).toHaveLength(tipos.reduce((sum, tipo) => sum + tipo.total_slots, 0));
        expect(spots.every((spot) => spot.status === 'Available')).toBe(true);
        expect(new Set(spots.map((spot) => spot.id)).size).toBe(spots.length);
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
