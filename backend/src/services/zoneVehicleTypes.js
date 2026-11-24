// HU-31: the vehicle types of the zones, as the API sends them. Every zone is
// sent with `vehicleTypes`, in the order of VEHICLE_TYPES:
//   { vehicleType, totalSlots, availableSlots, hourlyRate (a number) }
// and its `totalSlots` and `availableSlots` are the sums of the types it
// accepts. A type that is turned off is not sent, except to the
// administrator, who also gets for each type:
//   isAccepting, spotsInUse (the least spots it can have, HU-21) and
//   openReservations (the reservations that hold its spots from now on)
const { ZoneVehicleType } = require('../models');
const { VEHICLE_TYPES } = require('../constants/vehicleTypes');
const availability = require('./availability');

const order = (tipo) => VEHICLE_TYPES.indexOf(tipo.vehicleType);

// Adds `vehicleTypes`, `totalSlots` and `availableSlots` to each zone (Zona
// toJSON sends them), with one query for each kind of count, for all the
// zones. `forAdmin` sends the types that are turned off and the counts of the
// administrator.
async function withVehicleTypes(zonas, { transaction, now = new Date(), forAdmin = false } = {}) {
    const ids = zonas.map((zona) => zona.id);
    if (ids.length === 0) return zonas;

    // One after the other: the queries of a transaction share its connection
    const tipos = await ZoneVehicleType.findAll({
        where: forAdmin ? { zoneId: ids } : { zoneId: ids, isAccepting: true },
        transaction,
    });
    const libres = await availability.availableNowByZoneAndType(ids, { transaction, now });
    const enUso = forAdmin ? await availability.inUseByZoneAndType(ids, { transaction, now }) : new Map();

    for (const zona of zonas) {
        const suyos = tipos.filter((tipo) => tipo.zoneId === zona.id).sort((a, b) => order(a) - order(b));
        const vehicleTypes = suyos.map((tipo) => {
            const key = availability.typeKey(zona.id, tipo.vehicleType);
            const sent = {
                vehicleType: tipo.vehicleType,
                totalSlots: tipo.totalSlots,
                availableSlots: libres.get(key) ?? 0,
                // DECIMAL(10, 2) is read as text: the API sends it as a number
                hourlyRate: Number(tipo.hourlyRate),
            };
            if (forAdmin) {
                const uso = enUso.get(key) ?? { spots: 0, reservations: 0 };
                Object.assign(sent, { isAccepting: tipo.isAccepting, spotsInUse: uso.spots, openReservations: uso.reservations });
            }
            return sent;
        });
        const accepted = vehicleTypes.filter((tipo) => !forAdmin || tipo.isAccepting);
        zona.setDataValue('vehicleTypes', vehicleTypes);
        zona.setDataValue('totalSlots', accepted.reduce((sum, tipo) => sum + tipo.totalSlots, 0));
        zona.setDataValue('availableSlots', accepted.reduce((sum, tipo) => sum + tipo.availableSlots, 0));
    }
    return zonas;
}

module.exports = { withVehicleTypes };
