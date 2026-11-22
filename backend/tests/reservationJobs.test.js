// The database is replaced by spies on the models (tests/setup.js: the tests
// never reach MySQL)
const { Zona, Reserva, Pago, ParkingSpot, sequelize } = require('../src/models');
const { expirarReservasVencidas } = require('../src/jobs/expirar-reservas.job');

// The two jobs that run every minute: the expiration of the reservations not
// paid in 15 minutes (HU-26) and the end of the stays whose exit time passed
const ZONE_ID = '22222222-2222-4222-8222-222222222222';
const SPOT_ID = '55555555-5555-4555-8555-555555555555';

let transaction;
let lockReservation;
let lockZone;
let lockSpot;

// A reservation of the zone, on its spot, read again with a lock by the job
function reservation(id, values = {}) {
    return { id, zoneId: ZONE_ID, parkingSpotId: SPOT_ID, openEnded: false, update: jest.fn(), ...values };
}

function arrange(found) {
    jest.spyOn(Reserva, 'findAll').mockResolvedValue(found.map(({ id }) => ({ id })));
    lockReservation = jest.spyOn(Reserva, 'findOne').mockImplementation(async ({ where }) => found.find((r) => r.id === where.id) ?? null);
    lockZone = jest.spyOn(Zona, 'findByPk').mockResolvedValue({ id: ZONE_ID, name: 'Centro', increment: jest.fn() });
    lockSpot = jest.spyOn(ParkingSpot, 'findByPk').mockResolvedValue({ id: SPOT_ID, status: 'Occupied', update: jest.fn() });
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
    ['expiration', expirarReservasVencidas, 'Expired'],
])('The %s job', (_name, runJob, status) => {
    test(`marks the reservation ${status} and gives the spot and the slot back`, async () => {
        // Arrange
        const reserva = reservation('r1');
        arrange([reserva]);

        // Act
        await runJob();

        // Assert
        expect(reserva.update).toHaveBeenCalledWith({ status }, { transaction });
        expect((await lockSpot.mock.results[0].value).update).toHaveBeenCalledWith({ status: 'Available' }, { transaction });
        expect((await lockZone.mock.results[0].value).increment).toHaveBeenCalledWith('availableSlots', { by: 1, transaction });
        expect(transaction.commit).toHaveBeenCalled();
    });

    test('locks the reservation, then the zone and then the spot, as a capacity edit does (zone, then spots) (#371)', async () => {
        // Arrange
        arrange([reservation('r1')]);

        // Act
        await runJob();

        // Assert
        expect(lockReservation).toHaveBeenCalledWith(expect.objectContaining({ transaction, lock: 'UPDATE' }));
        expect(lockZone).toHaveBeenCalledWith(ZONE_ID, { transaction, lock: 'UPDATE' });
        expect(lockSpot).toHaveBeenCalledWith(SPOT_ID, { transaction, lock: 'UPDATE' });
        expect(lockReservation.mock.invocationCallOrder[0]).toBeLessThan(lockZone.mock.invocationCallOrder[0]);
        expect(lockZone.mock.invocationCallOrder[0]).toBeLessThan(lockSpot.mock.invocationCallOrder[0]);
    });
});
