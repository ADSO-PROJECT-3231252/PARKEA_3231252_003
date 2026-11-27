// #373: a spot is taken only for the hours of its reservations, so whether a
// spot is free is calculated from them, for the hours asked, instead of being
// stored. parking_spots.status only says whether a spot is enabled
// (Available) or Disabled.
const { Op, fn, col, literal } = require('sequelize');
const { ParkingSpot, Reserva, sequelize } = require('../models');

const MINUTE_MS = 60 * 1000;

// Two reservations of the same spot keep this time between them, so one car
// can leave before the next one comes in
const MARGIN_MS = 10 * MINUTE_MS;

// The shortest stay (HU-14). `availableSlots` in the API is the number of
// spots free for it from now.
const MIN_STAY_MS = 30 * MINUTE_MS;

const plus = (date, ms) => new Date(new Date(date).getTime() + ms);

// A spot that is not Disabled can be reserved
const ENABLED = { [Op.ne]: 'Disabled' };

// A reservation holds its spot while it is Active, or Pending with its 15
// minutes to pay still running. One whose 15 minutes ended no longer holds
// it, even if the job has not marked it Expired yet (#347, countsAsExpired);
// a Pending one without a deadline never expires, so it holds it.
function holdsItsSpot(now) {
    return {
        [Op.or]: [
            { status: 'Active' },
            { status: 'Pending', [Op.or]: [{ holdExpiresAt: null }, { holdExpiresAt: { [Op.gt]: now } }] },
        ],
    };
}

// The same rule in SQL, for a reservation `r`
function holdsItsSpotSql(now) {
    return `r.status IN ('Pending', 'Active')
        AND (r.status = 'Active' OR r.hold_expires_at IS NULL OR r.hold_expires_at > ${sequelize.escape(now)})`;
}

// For a query of ParkingSpot: the spots that no reservation holds between
// `from` and `to`, with the margin before and after. A Finished stay keeps
// the 10 minutes after its exit time too, so the answer is the same before
// and after the job marks it Finished. It always ended in the past (the job
// and terminar save the real exit time), so only those 10 minutes change.
function freeBetween(from, to, now) {
    return literal(`NOT EXISTS (
        SELECT 1 FROM reservations AS r
        WHERE r.parking_spot_id = \`ParkingSpot\`.\`id\`
            AND (r.status = 'Finished' OR (${holdsItsSpotSql(now)}))
            AND r.start_time < ${sequelize.escape(plus(to, MARGIN_MS))}
            AND r.end_time > ${sequelize.escape(plus(from, -MARGIN_MS))}
    )`);
}

// For a query of ParkingSpot: the spots with no reservation that holds them
// from now on (HU-21: only these can be disabled)
function freeFromNow(now) {
    return literal(`NOT EXISTS (
        SELECT 1 FROM reservations AS r
        WHERE r.parking_spot_id = \`ParkingSpot\`.\`id\`
            AND ${holdsItsSpotSql(now)}
            AND r.end_time > ${sequelize.escape(now)}
    )`);
}

// HU-14: the free spot with the lowest number for a stay from `start` to
// `end`, or null when none is free. HU-31: a spot of the type of the vehicle.
// The caller holds the lock of the zone, so no other reservation of the zone
// can be saved meanwhile.
function firstFreeSpot(zoneId, vehicleType, start, end, { transaction, now = new Date() } = {}) {
    return ParkingSpot.findOne({
        where: { zoneId, vehicleType, status: ENABLED, [Op.and]: [freeBetween(start, end, now)] },
        order: [['spotNumber', 'ASC']],
        transaction,
    });
}

// #375: how many spots of one zone are free from `from` to `to`: the spots
// that POST /reservations could give to a stay with those hours. HU-31: of
// one vehicle type, like the spot it gives
function freeSpotsBetween(zoneId, vehicleType, from, to, { transaction, now = new Date() } = {}) {
    return ParkingSpot.count({
        where: { zoneId, vehicleType, status: ENABLED, [Op.and]: [freeBetween(from, to, now)] },
        transaction,
    });
}

// HU-31: the key of one vehicle type of one zone in the Maps below
const typeKey = (zoneId, vehicleType) => `${zoneId}:${vehicleType}`;

// HU-31: how many spots of each vehicle type of each zone are free from
// `from` to `to`, in one query for all of them: a Map from typeKey(zone,
// type) to its number (a type with no free spot is missing)
async function freeSpotsByZoneAndType(zoneIds, from, to, { transaction, now = new Date() } = {}) {
    const free = new Map();
    if (zoneIds.length === 0) return free;
    const rows = await ParkingSpot.findAll({
        attributes: ['zoneId', 'vehicleType', [fn('COUNT', col('ParkingSpot.id')), 'free']],
        where: { zoneId: zoneIds, status: ENABLED, [Op.and]: [freeBetween(from, to, now)] },
        group: ['zoneId', 'vehicleType'],
        raw: true,
        transaction,
    });
    for (const row of rows) free.set(typeKey(row.zoneId, row.vehicleType), Number(row.free));
    return free;
}

// HU-31: `availableSlots` of each vehicle type of each zone
function availableNowByZoneAndType(zoneIds, { transaction, now = new Date() } = {}) {
    return freeSpotsByZoneAndType(zoneIds, now, plus(now, MIN_STAY_MS), { transaction, now });
}

// HU-28: the first other reservation that holds the spot of `reserva` from
// `from` to `to` (with the margin), or null when the spot is free for that
// time. A stay never changes spot, so an extension needs its own spot free.
function nextHolderOfSpot(reserva, from, to, { transaction, now = new Date() } = {}) {
    if (!reserva.parkingSpotId) return null;
    return Reserva.findOne({
        where: {
            id: { [Op.ne]: reserva.id },
            parkingSpotId: reserva.parkingSpotId,
            startTime: { [Op.lt]: plus(to, MARGIN_MS) },
            endTime: { [Op.gt]: plus(from, -MARGIN_MS) },
            [Op.and]: [holdsItsSpot(now)],
        },
        attributes: ['id', 'startTime'],
        order: [['startTime', 'ASC']],
        transaction,
    });
}

// Until when a spot is free before the reservation that holds it next
const freeUntil = (holder) => plus(holder.startTime, -MARGIN_MS);

// #375: until when the spot of `reserva` is free after its exit time, for the
// screens that offer an extension: 10 minutes before the next reservation
// that holds it, looked for up to `latest`, the furthest exit the stay can
// have (entry + 24 hours, or the closing time of its zone, HU-29). It is the
// same search as the extension (nextHolderOfSpot), so what the screens offer
// is what the extension accepts. Null when no reservation holds the spot
// until then, or when the stay cannot go past its exit time.
async function spotFreeUntil(reserva, latest, { transaction, now = new Date() } = {}) {
    if (!latest || new Date(latest) <= new Date(reserva.endTime)) return null;
    const holder = await nextHolderOfSpot(reserva, reserva.endTime, latest, { transaction, now });
    return holder ? freeUntil(holder) : null;
}

// HU-21: how many spots of each zone hold a reservation from now on, in one
// query: a Map from the id of each zone to its number (0 when none)
async function spotsInUseByZone(zoneIds, { transaction, now = new Date() } = {}) {
    const inUse = new Map(zoneIds.map((id) => [id, 0]));
    if (zoneIds.length === 0) return inUse;
    const rows = await Reserva.findAll({
        attributes: ['zoneId', [fn('COUNT', fn('DISTINCT', col('parking_spot_id'))), 'spots']],
        where: { zoneId: zoneIds, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: now }, [Op.and]: [holdsItsSpot(now)] },
        group: ['zoneId'],
        raw: true,
        transaction,
    });
    for (const row of rows) inUse.set(row.zoneId, Number(row.spots));
    return inUse;
}

// HU-31: the spots in use of each vehicle type of each zone, and how many
// reservations hold those spots from now on: a Map from typeKey(zone, type)
// to { spots, reservations } (a type with none is missing)
async function inUseByZoneAndType(zoneIds, { transaction, now = new Date() } = {}) {
    const inUse = new Map();
    if (zoneIds.length === 0) return inUse;
    const rows = await Reserva.findAll({
        attributes: [
            'zoneId',
            [col('parkingSpot.vehicle_type'), 'vehicleType'],
            [fn('COUNT', fn('DISTINCT', col('Reserva.parking_spot_id'))), 'spots'],
            [fn('COUNT', col('Reserva.id')), 'reservations'],
        ],
        include: [{ model: ParkingSpot, as: 'parkingSpot', attributes: [] }],
        where: { zoneId: zoneIds, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: now }, [Op.and]: [holdsItsSpot(now)] },
        group: ['zoneId', 'parkingSpot.vehicle_type'],
        raw: true,
        transaction,
    });
    for (const row of rows) {
        inUse.set(typeKey(row.zoneId, row.vehicleType), { spots: Number(row.spots), reservations: Number(row.reservations) });
    }
    return inUse;
}

// HU-21 and HU-31: how many spots of one vehicle type of the zone hold a
// reservation from now on: the least spots that type can have
function spotsOfTypeInUse(zoneId, vehicleType, { transaction, now = new Date() } = {}) {
    return Reserva.count({
        include: [{ model: ParkingSpot, as: 'parkingSpot', attributes: [], where: { vehicleType } }],
        where: { zoneId, parkingSpotId: { [Op.ne]: null }, endTime: { [Op.gt]: now }, [Op.and]: [holdsItsSpot(now)] },
        distinct: true,
        // The column, not the attribute: with an include, Sequelize writes
        // `col` as it is given
        col: 'parking_spot_id',
        transaction,
    });
}

module.exports = {
    MARGIN_MS,
    MIN_STAY_MS,
    ENABLED,
    holdsItsSpot,
    freeFromNow,
    firstFreeSpot,
    freeSpotsBetween,
    typeKey,
    freeSpotsByZoneAndType,
    availableNowByZoneAndType,
    inUseByZoneAndType,
    spotsOfTypeInUse,
    nextHolderOfSpot,
    freeUntil,
    spotFreeUntil,
    spotsInUseByZone,
};
