const request = require('supertest');
const { Vehiculo } = require('../../src/models');
const { app, createUser } = require('./helpers');

describe('Active vehicle limit (#299)', () => {
    test('six simultaneous registrations for one user leave five active vehicles', async () => {
        const { usuario, vehiculo, token } = await createUser();
        const where = { userId: usuario.id };

        // createUser includes one car. A soft-deleted car does not take a place.
        await vehiculo.destroy();
        expect(await Vehiculo.count({ where })).toBe(0);

        // Pick six unused plates so a plate conflict cannot mask the user limit.
        const plates = [];
        for (let number = 0; plates.length < 6 && number < 1000; number++) {
            const plate = `LIM${String(number).padStart(3, '0')}`;
            if (!(await Vehiculo.findOne({ where: { plate } }))) plates.push(plate);
        }
        expect(plates).toHaveLength(6);

        const responses = await Promise.all(plates.map((plate) =>
            request(app)
                .post('/api/vehicles')
                .set('Authorization', `Bearer ${token}`)
                .send({ plate, vehicleType: 'car', brand: 'Mazda', model: '3', color: 'Rojo' }),
        ));

        const created = responses.filter((res) => res.status === 201);
        const rejected = responses.filter((res) => res.status === 409);
        expect(created).toHaveLength(5);
        expect(rejected).toHaveLength(1);
        expect(rejected[0].body.code).toBe('VEHICLE_LIMIT_REACHED');
        expect(await Vehiculo.count({ where })).toBe(5);
    });
});
