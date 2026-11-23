// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Op } = require('sequelize');
const { Zona, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const { expirarReservasVencidas } = require('../src/jobs/expirar-reservas.job');
const { finalizarReservasVencidas } = require('../src/jobs/finalizar-reservas.job');

// The two jobs that run every minute: the expiration of the reservations not
// paid in 15 minutes (HU-26) and the end of the stays whose exit time passed
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const SPOT_ID = '55555555-5555-4555-8555-555555555555';

let transaction;
let lockReservation;
let lockZone;
let lockSpot;

// A reservation of the zone, on its spot, read again with a lock by the job.
// Its exit time passed a minute ago, unless the test changes it.
function reservation(id, values = {}) {
    return { id, zoneId: ZONE_ID, parkingSpotId: SPOT_ID, openEnded: false, endTime: new Date(Date.now() - 60 * 1000), update: jest.fn(), ...values };
}

function arrange(found) {
    jest.spyOn(Reserva, 'findAll').mockResolvedValue(found.map(({ id }) => ({ id })));
    // The locked read finds the reservation only if it still matches the
    // where of the job: its status and, for the finish job, its exit time
    lockReservation = jest.spyOn(Reserva, 'findOne').mockImplementation(async ({ where }) => found.find((r) => r.id === where.id
        && (!where.endTime || r.endTime < where.endTime[Op.lt])) ?? null);
    // Spied on only to check that the zone and the spot do not change (#373)
    lockZone = jest.spyOn(Zona, 'findByPk');
    lockSpot = jest.spyOn(ParkingSpot, 'findByPk');
    jest.spyOn(Pago, 'findAll').mockResolvedValue([]);
}

beforeEach(() => {
    transaction = { LOCK: { UPDATE: 'UPDATE' }, commit: jest.fn(), rollback: jest.fn() };
    jest.spyOn(sequelize, 'transaction').mockResolvedValue(transaction);
    jest.spyOn(console, 'log').mockImplementation(() => {});
});

afterEach(() => {
    jest.restoreAllMocks();
});

describe.each([
    ['expiration', expirarReservasVencidas, 'Expired', 'Pending'],
    ['finish', finalizarReservasVencidas, 'Finished', 'Active'],
])('The %s job (#373)', (_name, runJob, status, before) => {
    test(`marks the reservation ${status}, with no change to its spot or its zone`, async () => {
        // Arrange
        const reserva = reservation('r1');
        arrange([reserva]);

        // Act
        await runJob();

        // Assert: the reservation was read again, locked, with its status
        expect(lockReservation).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ id: 'r1', status: before }), transaction, lock: 'UPDATE' }));
        expect(reserva.update).toHaveBeenCalledWith({ status }, { transaction });
        expect(lockZone).not.toHaveBeenCalled();
        expect(lockSpot).not.toHaveBeenCalled();
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('a reservation another run already changed is left as it is', async () => {
        // Arrange: it is found, but read again it no longer has its status
        arrange([]);
        jest.spyOn(Reserva, 'findAll').mockResolvedValue([{ id: 'r1' }]);

        // Act
        await runJob();

        // Assert
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});

describe('The finish job and an extension at the same time (#373)', () => {
    test('the locked read checks the exit time again, with the time of the run', async () => {
        // Arrange
        arrange([reservation('r1')]);

        // Act
        await finalizarReservasVencidas();

        // Assert
        const { where } = lockReservation.mock.calls[0][0];
        expect(where.endTime[Op.lt]).toBeInstanceOf(Date);
        expect(where.endTime[Op.lt].getTime()).toBeLessThanOrEqual(Date.now());
    });

    test('a stay whose exit time an extension moved while the job waited for its lock is not finished', async () => {
        // Arrange: found with its old exit time, but read again with the lock
        // it has the new one, an hour from now
        const reserva = reservation('r1', { endTime: new Date(Date.now() + 60 * 60 * 1000) });
        arrange([reserva]);

        // Act
        await finalizarReservasVencidas();

        // Assert
        expect(reserva.update).not.toHaveBeenCalled();
        expect(transaction.rollback).toHaveBeenCalled();
        expect(transaction.commit).not.toHaveBeenCalled();
    });
});
