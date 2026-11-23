// #304: the unique index of zones.name, against a real MySQL database. Two
// requests can pass the check of the name at the same time; the index lets
// only one of them save it, and the other one answers 409.
const request = require('supertest');
const { Zona, ParkingSpot, sequelize } = require('../../src/models');
const { app, unique, adminToken, createZone } = require('./helpers');

const zoneBody = (name, totalSlots = 1) => ({
    name,
    address: 'Calle 1 # 2-3',
    latitude: 4.8133,
    longitude: -75.6961,
    totalSlots,
    hourlyRate: 2000,
    open24h: true,
});

async function send(method, path, body) {
    return request(app)[method](path).set('Authorization', `Bearer ${await adminToken()}`).send(body);
}

// Saves a zone called `name` in a transaction and keeps it open until the
// request of `sendRequest` reaches the save of that name (`hook`). By then
// the request already checked the name without seeing it, because the other
// zone is not committed yet, so only the unique index can stop it. Returns
// the answer of the request.
async function whileNameIsTaken(name, hook, sendRequest) {
    let notifySave;
    const reachedSave = new Promise((resolve) => { notifySave = resolve; });
    const hookName = 'observeZoneNameSave';
    let pending;

    await sequelize.transaction(async (blocker) => {
        // Inactive, so it does not show in the public list of other tests
        await Zona.create({ ...zoneBody(name), isActive: false }, { transaction: blocker });

        Zona.addHook(hook, hookName, (zona) => {
            if (zona.name === name) notifySave();
        });
        try {
            pending = sendRequest();
            await Promise.race([
                reachedSave,
                pending.then((res) => {
                    throw new Error(`Request finished before saving the name: HTTP ${res.status}`);
                }),
            ]);
            // Time for the save to reach MySQL and wait there for the name
            await new Promise((resolve) => setTimeout(resolve, 300));
        } finally {
            Zona.removeHook(hook, hookName);
        }
    });

    // The other zone was committed while the request waited
    return pending;
}

describe('Unique zone names (#304)', () => {
    test('a creation whose name is taken while it saves answers 409 and leaves no zone or spots', async () => {
        // Arrange
        const name = `Nombre ${unique()}`;

        // Act
        const res = await whileNameIsTaken(name, 'beforeCreate', () => send('post', '/api/zones', zoneBody(name, 3)));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ZONE_NAME_TAKEN');
        const zones = await Zona.findAll({ where: { name } });
        expect(zones).toHaveLength(1);
        expect(await ParkingSpot.count({ where: { zoneId: zones[0].id } })).toBe(0);
    });

    test('a rename whose name is taken while it saves answers 409 and keeps the old name', async () => {
        // Arrange
        const zona = await createZone(1);
        const oldName = zona.name;
        const name = `Nombre ${unique()}`;

        // Act
        const res = await whileNameIsTaken(name, 'beforeUpdate', () => send('put', `/api/zones/${zona.id}`, zoneBody(name)));

        // Assert
        expect(res.status).toBe(409);
        expect(res.body.code).toBe('ZONE_NAME_TAKEN');
        await zona.reload();
        expect(zona.name).toBe(oldName);
        expect(await Zona.count({ where: { name } })).toBe(1);
    });

    test('four creations of one name at the same time give one 201 and three 409', async () => {
        // Arrange
        const name = `Nombre ${unique()}`;

        // Act
        const responses = await Promise.all([0, 1, 2, 3].map(() => send('post', '/api/zones', zoneBody(name))));

        // Assert
        expect(responses.map((res) => res.status).sort()).toEqual([201, 409, 409, 409]);
        for (const res of responses.filter((r) => r.status === 409)) {
            expect(res.body.code).toBe('ZONE_NAME_TAKEN');
        }
        expect(await Zona.count({ where: { name } })).toBe(1);
    });
});
