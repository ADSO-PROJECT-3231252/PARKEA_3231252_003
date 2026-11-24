// HU-31: the car type of the zones against a real MySQL database: the demo
// zones and the zones created and edited with cars only keep the car type
// with their spots and rate, and all their spots are car spots (AC-15). The
// migrations are in vehicleTypeMigrations.test.js, and the other types in
// zonesByVehicleType.test.js.
const request = require('supertest');
const { sequelize, Zona } = require('../../src/models');
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

    test('a zone without types or spots (written by hand) gets them when it is edited', async () => {
        // Arrange: a zone of its own, as a script would write it
        const zona = await Zona.create({ name: `Zona ${unique()}`, address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, totalSlots: 2, hourlyRate: 2000 });

        // Act
        const res = await edit(zona, { totalSlots: 2, hourlyRate: 2200 });

        // Assert
        expect(res.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual([{ vehicleType: 'car', totalSlots: 2, hourlyRate: 2200, isAccepting: 1 }]);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available']);
    });
});
