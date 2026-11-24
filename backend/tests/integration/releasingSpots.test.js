// #373: a reservation that ends frees its hours by changing its status
// alone, against a real MySQL database
const request = require('supertest');
const { ParkingSpot, Reserva } = require('../../src/models');
const { expirarReservasVencidas } = require('../../src/jobs/expirar-reservas.job');
const { finalizarReservasVencidas } = require('../../src/jobs/finalizar-reservas.job');
const { app, inMinutes, createUser, createZone, reserve } = require('./helpers');

// A zone of 1 spot reserved by `ana` from 60 to 120 minutes from now
async function reservedZone() {
    const zona = await createZone(1);
    const [ana, beto] = await Promise.all([createUser(), createUser()]);
    const res = await reserve(ana, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());
    return { zona, ana, beto, reserva: await Reserva.findByPk(res.body.reservation.id) };
}

// `beto` asks for the same hours
const sameHours = (beto, zona) => reserve(beto, zona, inMinutes(60).toISOString(), inMinutes(120).toISOString());

describe('The hours of a reservation are free again (#373)', () => {
    test('when it is cancelled, and no spot is changed', async () => {
        // Arrange
        const { zona, ana, beto, reserva } = await reservedZone();
        expect((await sameHours(beto, zona)).status).toBe(409);

        // Act
        await request(app).patch(`/api/reservations/${reserva.id}/cancel`).set('Authorization', `Bearer ${ana.token}`);

        // Assert
        expect((await sameHours(beto, zona)).status).toBe(201);
        expect((await ParkingSpot.findAll({ where: { zoneId: zona.id } })).map((cupo) => cupo.status)).toEqual(['Available']);
    });

    test('when the expiration job marks it Expired', async () => {
        // Arrange: its 15 minutes to pay ended
        const { zona, beto, reserva } = await reservedZone();
        await reserva.update({ holdExpiresAt: inMinutes(-1) });

        // Act
        await expirarReservasVencidas();

        // Assert
        expect((await reserva.reload()).status).toBe('Expired');
        expect((await sameHours(beto, zona)).status).toBe(201);
    });

    test('when its exit time passes, with or without the finish job', async () => {
        // Arrange: a paid stay that ended a minute ago, and the same spot
        // asked from now
        const zona = await createZone(1);
        const [ana, beto, carla] = await Promise.all([createUser(), createUser(), createUser()]);
        const reserva = await Reserva.create({
            userId: ana.usuario.id,
            zoneId: zona.id,
            vehicleId: ana.vehiculo.id,
            parkingSpotId: (await ParkingSpot.findOne({ where: { zoneId: zona.id } })).id,
            spotNumber: 1,
            startTime: inMinutes(-61),
            endTime: inMinutes(-1),
            status: 'Active',
            appliedHourlyRate: 2000,
        });

        // Act
        const beforeTheJob = await reserve(beto, zona, inMinutes(10).toISOString(), inMinutes(40).toISOString());
        await finalizarReservasVencidas();
        const afterTheJob = await reserve(carla, zona, inMinutes(50).toISOString(), inMinutes(80).toISOString());

        // Assert
        expect(beforeTheJob.status).toBe(201);
        expect((await reserva.reload()).status).toBe('Finished');
        expect(afterTheJob.status).toBe(201);
    });
});
