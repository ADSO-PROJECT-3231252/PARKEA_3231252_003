// HU-31: the vehicle types of the zones against a real MySQL database: the
// demo zones have their types with their spots (AC-16), and the zones created
// and edited with cars only keep the car type with its spots and rate, and
// all their spots are car spots (AC-15). The migrations are in
// vehicleTypeMigrations.test.js, and the other types in
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

// The spots of a type, numbered from 1 and enabled, as spotsOf gives them
const spotsOfType = (vehicleType, totalSlots) => Array.from({ length: totalSlots }, (_, i) => `${vehicleType} ${i + 1} Available`);

describe('The vehicle types of the demo zones (HU-31, AC-16)', () => {
    test.each([
        ['Centro', [['car', 30, 2000], ['motorcycle', 12, 1000]]],
        ['Parque Olaya', [['car', 18, 2500]]],
        ['La Popa', [['car', 24, 1800], ['motorcycle', 8, 900], ['truck', 4, 5000]]],
        ['Av. Simón Bolívar', [['car', 45, 1500], ['truck', 6, 4500]]],
    ])('%s has its types, taking reservations, with the spots of each one numbered from 1', async (name, tipos) => {
        // Arrange
        const zona = await Zona.findOne({ where: { name } });

        // Assert
        expect(await typesOf(zona.id)).toEqual(tipos.map(([vehicleType, totalSlots, hourlyRate]) => ({ vehicleType, totalSlots, hourlyRate, isAccepting: 1 })));
        expect(await spotsOf(zona.id)).toEqual(tipos.flatMap(([vehicleType, totalSlots]) => spotsOfType(vehicleType, totalSlots)));
    });

    test('the API sends them with their types, and the user sees the sums of the types', async () => {
        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        const laPopa = res.body.zones.find((zona) => zona.name === 'La Popa');
        expect(laPopa).toMatchObject({ totalSlots: 36, availableSlots: 36 });
        expect(laPopa.vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 24, availableSlots: 24, hourlyRate: 1800 },
            { vehicleType: 'motorcycle', totalSlots: 8, availableSlots: 8, hourlyRate: 900 },
            { vehicleType: 'truck', totalSlots: 4, availableSlots: 4, hourlyRate: 5000 },
        ]);
    });
});

describe('The car type of a zone with cars only (HU-31)', () => {

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
