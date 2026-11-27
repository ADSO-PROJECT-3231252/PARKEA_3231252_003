// #373: the free spots of the zones, the dashboard and the capacity, against
// a real MySQL database
const request = require('supertest');
const { ParkingSpot } = require('../../src/models');
const { app, inMinutes, createUser, createZone, reserve, adminToken } = require('./helpers');

// `count` reservations of the zone from `start` to `end` minutes from now,
// each one of another account
async function reserveMany(zona, count, start, end) {
    const cuentas = await Promise.all(Array.from({ length: count }, () => createUser()));
    for (const cuenta of cuentas) {
        const res = await reserve(cuenta, zona, inMinutes(start).toISOString(), inMinutes(end).toISOString());
        if (res.status !== 201) throw new Error(`Not reserved: ${res.status} ${JSON.stringify(res.body)}`);
    }
}

const asAdmin = async (req) => req.set('Authorization', `Bearer ${await adminToken()}`);

describe('The free spots of the zones (HU-09, HU-22, #373)', () => {
    let full;
    let half;
    let empty;

    beforeAll(async () => {
        // Three zones of 2 spots: one full now, one with one spot taken now
        // (and the other one tomorrow) and one with both taken only tomorrow
        [full, half, empty] = await Promise.all([createZone(2), createZone(2), createZone(2)]);
        await reserveMany(full, 2, 5, 60);
        await reserveMany(half, 1, 5, 60);
        await reserveMany(half, 1, 24 * 60, 25 * 60);
        await reserveMany(empty, 2, 24 * 60, 25 * 60);
    });

    test('GET /api/zones gives each zone its spots free now and orders them by it, with no 500', async () => {
        // Act
        const res = await request(app).get('/api/zones');

        // Assert
        expect(res.status).toBe(200);
        const ours = res.body.zones.filter((z) => [full.id, half.id, empty.id].includes(z.id));
        expect(ours.map((z) => [z.id, z.availableSlots])).toEqual([[empty.id, 2], [half.id, 1], [full.id, 0]]);
    });

    test('GET /api/zones/:id gives the same number', async () => {
        // Act
        const res = await request(app).get(`/api/zones/${half.id}`);

        // Assert
        expect(res.body.zone.availableSlots).toBe(1);
    });

    test('the dashboard shows the same occupancy, and the full zone as an alert', async () => {
        // Act
        const occupancy = await asAdmin(request(app).get('/api/admin/dashboard/occupancy'));
        const alerts = await asAdmin(request(app).get('/api/admin/dashboard/alerts'));

        // Assert
        const occupied = Object.fromEntries(occupancy.body.occupancy.map((z) => [z.zoneId, z.occupiedSlots]));
        expect([occupied[full.id], occupied[half.id], occupied[empty.id]]).toEqual([2, 1, 0]);
        const fullZones = alerts.body.alerts.map((a) => a.zoneId);
        expect(fullZones).toContain(full.id);
        expect(fullZones).not.toContain(half.id);
        expect(fullZones).not.toContain(empty.id);
    });

    test('GET /api/zones/all sends the spots in use: those with a reservation from now on', async () => {
        // Act
        const res = await asAdmin(request(app).get('/api/zones/all'));

        // Assert: the 2 reservations of "half" are in its spot 1, the lowest
        // number free for each one, so it counts once
        const byId = Object.fromEntries(res.body.zones.map((z) => [z.id, z]));
        expect([byId[full.id].spotsInUse, byId[half.id].spotsInUse, byId[empty.id].spotsInUse]).toEqual([2, 1, 2]);
        expect(byId[half.id].availableSlots).toBe(1);
    });
});

describe('Lowering the capacity (HU-21 AC-03, #373)', () => {
    test('only the spots with no reservation from now on are disabled, and never below the spots in use', async () => {
        // Arrange: a zone of 4 spots, all of them reserved now; then the
        // reservations of spots 2 and 3 are cancelled, so 1 and 4 are in use
        const zona = await createZone(4);
        const cuentas = await Promise.all(Array.from({ length: 4 }, () => createUser()));
        const reservas = [];
        for (const cuenta of cuentas) {
            reservas.push((await reserve(cuenta, zona, inMinutes(5).toISOString(), inMinutes(60).toISOString())).body.reservation);
        }
        for (const spotNumber of [2, 3]) {
            const i = reservas.findIndex((r) => r.spotNumber === spotNumber);
            await request(app).patch(`/api/reservations/${reservas[i].id}/cancel`).set('Authorization', `Bearer ${cuentas[i].token}`);
        }
        const body = { name: zona.name, address: zona.address, latitude: 4.8133, longitude: -75.6961, open24h: true };
        const cars = (totalSlots) => ({ ...body, vehicleTypes: [{ vehicleType: 'car', totalSlots, hourlyRate: 2000 }] });

        // Act
        const below = await asAdmin(request(app).put(`/api/zones/${zona.id}`).send(cars(1)));
        const down = await asAdmin(request(app).put(`/api/zones/${zona.id}`).send(cars(2)));

        // Assert: spot 4 is in use, so 3 and 2 are the ones disabled
        expect(below.status).toBe(400);
        expect(below.body).toMatchObject({ code: 'CAPACITY_BELOW_IN_USE', vehicleType: 'car', spotsInUse: 2 });
        expect(down.status).toBe(200);
        expect(down.body.zone).toMatchObject({ totalSlots: 2, availableSlots: 0 });
        const spots = await ParkingSpot.findAll({ where: { zoneId: zona.id }, order: [['spotNumber', 'ASC']] });
        expect(spots.map((cupo) => cupo.status)).toEqual(['Available', 'Disabled', 'Disabled', 'Available']);
    });
});
