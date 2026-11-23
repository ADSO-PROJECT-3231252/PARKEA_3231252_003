const { Reserva, Zona, sequelize } = require('../../src/models');
const { createUser, createZone, inMinutes, reserve } = require('./helpers');

describe('Pending reservation limits (#299)', () => {
    test('a hold that expires while waiting for the zone lock frees a place', async () => {
        const account = await createUser();
        const zone = await createZone(5);
        const first = await reserve(account, zone, inMinutes(60), inMinutes(100));
        const second = await reserve(account, zone, inMinutes(180), inMinutes(220));
        expect(first.status).toBe(201);
        expect(second.status).toBe(201);

        const firstId = first.body.reservation.id;
        let notifyZoneRead;
        const reachedZone = new Promise((resolve) => { notifyZoneRead = resolve; });
        const hookName = 'observePendingLimitZoneLock';
        let thirdRequest;

        await sequelize.transaction(async (blocker) => {
            await Zona.findByPk(zone.id, {
                transaction: blocker,
                lock: blocker.LOCK.UPDATE,
            });

            // Observe the real locking read; Sequelize still sends it to MySQL.
            Zona.addHook('beforeFind', hookName, (options) => {
                if (options.lock && options.where?.id === zone.id) notifyZoneRead();
            });

            try {
                thirdRequest = reserve(account, zone, inMinutes(300), inMinutes(340)).then((res) => res);
                await Promise.race([
                    reachedZone,
                    thirdRequest.then((res) => {
                        throw new Error(`Request finished before the zone lock: HTTP ${res.status}`);
                    }),
                ]);

                // Use a whole second so MySQL's timestamp precision cannot
                // round the deadline back to before the request started.
                const expiresAt = new Date(Math.ceil(Date.now() / 1000) * 1000 + 1000);
                await Reserva.update(
                    { holdExpiresAt: expiresAt },
                    { where: { id: firstId }, transaction: blocker },
                );
                await new Promise((resolve) => setTimeout(resolve, Math.max(0, expiresAt.getTime() - Date.now() + 50)));
            } finally {
                Zona.removeHook('beforeFind', hookName);
            }
        });

        // The transaction released the zone after expiry. No job ran.
        const third = await thirdRequest;
        expect(third.status).toBe(201);
        const expired = await Reserva.findByPk(firstId);
        expect(expired.status).toBe('Pending');
    });
        test('five simultaneous requests from one user create only two pending reservations', async () => {
        const account = await createUser();
        const zone = await createZone(5);

        // Five separate one-hour stays, each starting three hours apart.
        const requests = [60, 240, 420, 600, 780].map((start) =>
            reserve(account, zone, inMinutes(start), inMinutes(start + 60)),
        );
        const responses = await Promise.all(requests);

        const created = responses.filter((res) => res.status === 201);
        const rejected = responses.filter((res) => res.status === 409);
        expect(created).toHaveLength(2);
        expect(rejected).toHaveLength(3);
        for (const res of rejected) {
            expect(res.body.code).toBe('TOO_MANY_PENDING_RESERVATIONS');
        }

        const saved = await Reserva.count({
            where: { userId: account.usuario.id, status: 'Pending' },
        });
        expect(saved).toBe(2);
    });
});
