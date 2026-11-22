// #373: the spot of each reservation, against a real MySQL database
const { Reserva } = require('../../src/models');
const { inMinutes, createUser, createZone, reserve } = require('./helpers');

describe('The spot of a new reservation (HU-14)', () => {
    test('with 10 requests at the same moment for the same hours, a zone of 3 spots gives 3 different spots', async () => {
        // Arrange
        const zona = await createZone(3);
        const cuentas = await Promise.all(Array.from({ length: 10 }, () => createUser()));
        const start = inMinutes(60).toISOString();
        const end = inMinutes(120).toISOString();

        // Act
        const answers = await Promise.all(cuentas.map((cuenta) => reserve(cuenta, zona, start, end)));

        // Assert
        const created = answers.filter((res) => res.status === 201);
        expect(created).toHaveLength(3);
        expect(created.map((res) => res.body.reservation.spotNumber).sort()).toEqual([1, 2, 3]);
        expect(answers.filter((res) => res.status === 409).map((res) => res.body.code))
            .toEqual(Array(7).fill('NO_SPOTS_AVAILABLE'));
        expect(await Reserva.count({ where: { zoneId: zona.id } })).toBe(3);
    });
});
