// HU-31: the zones with the vehicle types they accept, against a real MySQL
// database: creating a zone with several types, editing their spots and
// rates, turning a type off and on again, and what the user and the
// administrator see. Also the rule that a vehicle with a reservation cannot
// change its type (AC-13).
const request = require('supertest');
const { sequelize } = require('../../src/models');
const { app, inMinutes, unique, createUser, adminToken, createZone, reserve } = require('./helpers');

const run = (sql, replacements) => sequelize.query(sql, { replacements });
const type = (vehicleType, totalSlots, hourlyRate) => ({ vehicleType, totalSlots, hourlyRate });

// The types of a zone in the database, without their ids
async function typesOf(zoneId) {
    const [rows] = await run(`
        SELECT vehicle_type AS vehicleType, total_slots AS totalSlots, hourly_rate AS hourlyRate, is_accepting AS isAccepting
        FROM zone_vehicle_types WHERE zone_id = :zoneId ORDER BY vehicle_type
    `, { zoneId });
    return rows.map((row) => `${row.vehicleType} ${row.totalSlots} ${Number(row.hourlyRate)} ${row.isAccepting ? 'on' : 'off'}`);
}

// The spots of a zone, as "type number status", by type and number
async function spotsOf(zoneId) {
    const [rows] = await run(
        'SELECT vehicle_type AS vehicleType, spot_number AS spotNumber, status FROM parking_spots WHERE zone_id = :zoneId ORDER BY vehicle_type, spot_number',
        { zoneId }
    );
    return rows.map((row) => `${row.vehicleType} ${row.spotNumber} ${row.status}`);
}

const asAdmin = async (req) => req.set('Authorization', `Bearer ${await adminToken()}`);
const body = (name, vehicleTypes) => ({ name, address: 'Calle 1 # 2-3', latitude: 4.8133, longitude: -75.6961, open24h: true, vehicleTypes });
const edit = async (zona, vehicleTypes) => asAdmin(request(app).put(`/api/zones/${zona.id}`).send(body(zona.name, vehicleTypes)));
const adminZone = async (zoneId) => (await asAdmin(request(app).get('/api/zones/all'))).body.zones.find((z) => z.id === zoneId);

// A Pending reservation that holds the spot `spotNumber` of the type
// `vehicleType` of the zone for an hour, from `start` minutes from now,
// written by hand (the reservations take the type of the vehicle in the next
// step of HU-31)
async function holdSpot(zona, vehicleType, spotNumber, start = 60) {
    const cuenta = await createUser();
    await run(`
        INSERT INTO reservations (id, user_id, zone_id, vehicle_id, start_time, end_time, spot_number, status, hold_expires_at, parking_spot_id, open_ended, applied_hourly_rate)
        SELECT UUID(), :user, :zone, :vehicle, :start, :end, s.spot_number, 'Pending', :hold, s.id, 0, 2000
        FROM parking_spots AS s WHERE s.zone_id = :zone AND s.vehicle_type = :vehicleType AND s.spot_number = :spotNumber
    `, {
        user: cuenta.usuario.id, zone: zona.id, vehicle: cuenta.vehiculo.id,
        start: inMinutes(start), end: inMinutes(start + 60), hold: inMinutes(15), vehicleType, spotNumber,
    });
}

describe('Creating a zone with several vehicle types (HU-31)', () => {
    let res;

    beforeAll(async () => {
        res = await asAdmin(request(app).post('/api/zones').send(body(`Zona ${unique()}`, [type('motorcycle', 2, 1500), type('car', 3, 2500)])));
    });

    test('saves each type, taking reservations, and the spots of each type numbered from 1', async () => {
        // Assert
        expect(res.status).toBe(201);
        expect(await typesOf(res.body.zone.id)).toEqual(['car 3 2500 on', 'motorcycle 2 1500 on']);
        expect(await spotsOf(res.body.zone.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Available', 'motorcycle 1 Available', 'motorcycle 2 Available']);
    });

    test('answers with its types, all their spots free, and the sums, without a rate of the zone', async () => {
        // Assert
        expect(res.body.zone).toMatchObject({ totalSlots: 5, availableSlots: 5 });
        expect(res.body.zone).not.toHaveProperty('hourlyRate');
        expect(res.body.zone.vehicleTypes).toEqual([
            { vehicleType: 'car', totalSlots: 3, availableSlots: 3, hourlyRate: 2500, isAccepting: true, spotsInUse: 0, openReservations: 0 },
            { vehicleType: 'motorcycle', totalSlots: 2, availableSlots: 2, hourlyRate: 1500, isAccepting: true, spotsInUse: 0, openReservations: 0 },
        ]);
    });

    test('the user sees the same types, without the counts of the administrator', async () => {
        // Act
        const detail = await request(app).get(`/api/zones/${res.body.zone.id}`);
        const listed = (await request(app).get('/api/zones')).body.zones.find((z) => z.id === res.body.zone.id);

        // Assert
        for (const zone of [detail.body.zone, listed]) {
            expect(zone).toMatchObject({ totalSlots: 5, availableSlots: 5 });
            expect(zone.vehicleTypes).toEqual([
                { vehicleType: 'car', totalSlots: 3, availableSlots: 3, hourlyRate: 2500 },
                { vehicleType: 'motorcycle', totalSlots: 2, availableSlots: 2, hourlyRate: 1500 },
            ]);
        }
    });

    test('a body with errors answers all of them at once, and creates nothing', async () => {
        // Arrange
        const name = `Zona ${unique()}`;

        // Act
        const wrong = await asAdmin(request(app).post('/api/zones').send(body(name, [type('car', 0, 2500), type('car', 3, 0)])));

        // Assert
        expect(wrong.status).toBe(400);
        expect(wrong.body).toEqual({
            code: 'VALIDATION_ERROR',
            errors: [
                { path: 'vehicleTypes[0].totalSlots', msg: 'totalSlots must be a whole number between 1 and 500' },
                { path: 'vehicleTypes[1].vehicleType', msg: 'vehicleType car is repeated' },
                { path: 'vehicleTypes[1].hourlyRate', msg: 'hourlyRate must be greater than 0' },
            ],
        });
        const [[{ total }]] = await run('SELECT COUNT(*) AS total FROM zones WHERE name = :name', { name });
        expect(total).toBe(0);
    });
});

describe('Editing the vehicle types of a zone (HU-31, AC-04 and AC-05)', () => {
    let zona;

    beforeAll(async () => {
        // 3 cars and 2 motorcycles, and two reservations in motorcycle spot
        // 1, at different hours
        zona = await createZone(3, { vehicleTypes: [type('car', 3, 2500), type('motorcycle', 2, 1500)] });
        await holdSpot(zona, 'motorcycle', 1);
        await holdSpot(zona, 'motorcycle', 1, 300);
    });

    test('a type left out of the list is turned off: it keeps its spots, its rate and its reservations', async () => {
        // Act
        const res = await edit(zona, [type('car', 3, 2500)]);

        // Assert
        expect(res.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual(['car 3 2500 on', 'motorcycle 2 1500 off']);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Available', 'motorcycle 1 Available', 'motorcycle 2 Available']);
        expect(res.body.zone).toMatchObject({ totalSlots: 3, availableSlots: 3 });
    });

    test('the user no longer sees the type, and the administrator sees it turned off, with its reservations', async () => {
        // Act
        const detail = await request(app).get(`/api/zones/${zona.id}`);
        const admin = await adminZone(zona.id);

        // Assert: 2 reservations in 1 spot, which is free now (they start in
        // an hour)
        expect(detail.body.zone.vehicleTypes.map((tipo) => tipo.vehicleType)).toEqual(['car']);
        expect(admin.vehicleTypes.find((tipo) => tipo.vehicleType === 'motorcycle')).toEqual({
            vehicleType: 'motorcycle', totalSlots: 2, availableSlots: 2, hourlyRate: 1500, isAccepting: false, spotsInUse: 1, openReservations: 2,
        });
        expect(admin).toMatchObject({ totalSlots: 3, spotsInUse: 1 });
    });

    test('the type takes reservations again with the spots it kept, and more spots continue after its highest number', async () => {
        // Act
        const res = await edit(zona, [type('car', 3, 2500), type('motorcycle', 3, 1600)]);

        // Assert
        expect(res.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual(['car 3 2500 on', 'motorcycle 3 1600 on']);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Available', 'car 3 Available', 'motorcycle 1 Available', 'motorcycle 2 Available', 'motorcycle 3 Available']);
    });

    test('below the spots of a type in use it answers 400 with that type, and nothing changes', async () => {
        // Arrange: also motorcycle spot 2
        await holdSpot(zona, 'motorcycle', 2);

        // Act: another rate of the cars, and only 1 motorcycle spot
        const res = await edit(zona, [type('car', 3, 9000), type('motorcycle', 1, 1600)]);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body).toEqual({
            code: 'CAPACITY_BELOW_IN_USE',
            message: 'Cannot reduce the motorcycle spots below 2 spots currently in use',
            vehicleType: 'motorcycle',
            spotsInUse: 2,
        });
        expect(await typesOf(zona.id)).toEqual(['car 3 2500 on', 'motorcycle 3 1600 on']);
    });

    test('fewer spots of a type disable the free ones of that type, the highest first', async () => {
        // Act: the motorcycle spots 1 and 2 are in use
        const res = await edit(zona, [type('car', 1, 2500), type('motorcycle', 2, 1600)]);

        // Assert
        expect(res.status).toBe(200);
        expect(await spotsOf(zona.id)).toEqual(['car 1 Available', 'car 2 Disabled', 'car 3 Disabled', 'motorcycle 1 Available', 'motorcycle 2 Available', 'motorcycle 3 Disabled']);
        expect(res.body.zone).toMatchObject({ totalSlots: 3 });
    });

    test('a new type gets its spots numbered from 1', async () => {
        // Act
        const res = await edit(zona, [type('car', 1, 2500), type('motorcycle', 2, 1600), type('truck', 2, 9000)]);

        // Assert
        expect(res.status).toBe(200);
        expect(await typesOf(zona.id)).toEqual(['car 1 2500 on', 'motorcycle 2 1600 on', 'truck 2 9000 on']);
        expect((await spotsOf(zona.id)).filter((spot) => spot.startsWith('truck'))).toEqual(['truck 1 Available', 'truck 2 Available']);
        expect(res.body.zone).toMatchObject({ totalSlots: 5 });
    });

    test('the list cannot be empty: a zone always accepts some type', async () => {
        // Act
        const res = await edit(zona, []);

        // Assert
        expect(res.status).toBe(400);
        expect(res.body.errors).toEqual([{ path: 'vehicleTypes', msg: 'vehicleTypes must have at least one vehicle type' }]);
        expect(await typesOf(zona.id)).toEqual(['car 1 2500 on', 'motorcycle 2 1600 on', 'truck 2 9000 on']);
    });
});

describe('The type of a vehicle with a reservation (HU-31, AC-13)', () => {
    const changeType = (cuenta, vehicleType) => request(app)
        .put(`/api/vehicles/${cuenta.vehiculo.id}`)
        .set('Authorization', `Bearer ${cuenta.token}`)
        .send({ vehicleType, brand: 'Mazda', model: '3', color: 'Rojo' });

    test('cannot change while it has a Pending reservation, and can after it is cancelled', async () => {
        // Arrange
        const [cuenta, zona] = await Promise.all([createUser(), createZone(1)]);
        const reserved = await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

        // Act
        const refused = await changeType(cuenta, 'truck');
        await request(app).patch(`/api/reservations/${reserved.body.reservation.id}/cancel`).set('Authorization', `Bearer ${cuenta.token}`);
        const changed = await changeType(cuenta, 'truck');

        // Assert
        expect(refused.status).toBe(409);
        expect(refused.body.code).toBe('VEHICLE_HAS_ACTIVE_RESERVATION');
        expect(changed.status).toBe(200);
        expect(changed.body.vehicle.vehicleType).toBe('truck');
        const [[saved]] = await run('SELECT vehicle_type AS vehicleType FROM vehicles WHERE id = :id', { id: cuenta.vehiculo.id });
        expect(saved.vehicleType).toBe('truck');
    });

    test('its other data can still change while it has the reservation', async () => {
        // Arrange
        const [cuenta, zona] = await Promise.all([createUser(), createZone(1)]);
        await reserve(cuenta, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

        // Act
        const res = await request(app)
            .put(`/api/vehicles/${cuenta.vehiculo.id}`)
            .set('Authorization', `Bearer ${cuenta.token}`)
            .send({ vehicleType: 'car', brand: 'Mazda', model: 'CX-30', color: 'Gris' });

        // Assert
        expect(res.status).toBe(200);
        expect(res.body.vehicle).toMatchObject({ vehicleType: 'car', model: 'CX-30', color: 'Gris' });
    });
});
