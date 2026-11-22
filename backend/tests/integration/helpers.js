// #373: what the integration tests need to prepare their data in the test
// database. Every test creates its own accounts and zones, with names of its
// own, so the tests never depend on each other.
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const request = require('supertest');
const app = require('../../src/app');
const { Usuario, Rol, Vehiculo, Zona } = require('../../src/models');

const MINUTE_MS = 60 * 1000;

// A date `minutes` from now
const inMinutes = (minutes) => new Date(Date.now() + minutes * MINUTE_MS);

// A short text that no other test uses, for names, emails and plates
const unique = () => crypto.randomBytes(4).toString('hex');

// A token like the one of a sign-in (auth.controller.js)
function tokenFor(usuario, rol) {
    return jwt.sign({ id: usuario.id, email: usuario.email, rol, pv: usuario.passwordVersion }, process.env.JWT_SECRET);
}

// A verified account with the user role and one car. The password is never
// used: the tests sign their tokens.
async function createUser() {
    const rol = await Rol.findOne({ where: { name: 'user' } });
    const id = unique();
    const usuario = await Usuario.create({
        fullName: `Usuario ${id}`,
        email: `usuario.${id}@correo.test`,
        password: 'not-used',
        documentType: 'CC',
        documentNumber: String(parseInt(id, 16)).padStart(10, '1').slice(0, 10),
        roleId: rol.id,
        emailVerifiedAt: new Date(),
    });
    const letters = id.replace(/[^a-f]/g, '').toUpperCase().padEnd(3, 'X').slice(0, 3);
    const vehiculo = await Vehiculo.create({
        plate: `${letters}${String(parseInt(id, 16) % 1000).padStart(3, '0')}`,
        vehicleType: 'car',
        brand: 'Mazda',
        model: '3',
        color: 'Rojo',
        isDefault: true,
        userId: usuario.id,
    });
    return { usuario, vehiculo, token: tokenFor(usuario, 'user') };
}

// The administrator of the seeders
async function adminToken() {
    const admin = await Usuario.findOne({ include: [{ model: Rol, as: 'role', where: { name: 'admin' } }] });
    return tokenFor(admin, 'admin');
}

// A zone open 24 hours, created through the API like the administrator does,
// so it gets its numbered spots
async function createZone(totalSlots) {
    const res = await request(app)
        .post('/api/zones')
        .set('Authorization', `Bearer ${await adminToken()}`)
        .send({
            name: `Zona ${unique()}`,
            address: 'Calle 1 # 2-3',
            latitude: 4.8133,
            longitude: -75.6961,
            totalSlots,
            hourlyRate: 2000,
            open24h: true,
        });
    if (res.status !== 201) throw new Error(`The zone was not created: ${res.status} ${JSON.stringify(res.body)}`);
    return Zona.findByPk(res.body.zone.id);
}

// POST /api/reservations for the car of `cuenta`
function reserve(cuenta, zona, startTime, endTime, extra = {}) {
    return request(app)
        .post('/api/reservations')
        .set('Authorization', `Bearer ${cuenta.token}`)
        .send({ zoneId: zona.id, vehicleId: cuenta.vehiculo.id, startTime, endTime, ...extra });
}

module.exports = { app, inMinutes, unique, createUser, adminToken, createZone, reserve, MINUTE_MS };
