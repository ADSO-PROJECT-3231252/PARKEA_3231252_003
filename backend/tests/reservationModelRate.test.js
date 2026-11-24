// #372: a reservation saves the rate of its zone. The model has no default
// for it, so Sequelize never fills in 0.00 and a reservation without its rate
// fails instead of charging nothing (the database has no default either:
// tests/integration/schemaRules.test.js).
const { Reserva } = require('../src/models');

test('a reservation must receive its rate instead of defaulting to zero', async () => {
    // Arrange
    const reservation = Reserva.build({});

    // Act and assert
    await expect(reservation.validate({ fields: ['appliedHourlyRate'] })).rejects.toMatchObject({
        errors: [expect.objectContaining({ path: 'appliedHourlyRate' })],
    });
});
