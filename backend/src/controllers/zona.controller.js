const { Op } = require('sequelize');
const { Zona, ParkingSpot, ZoneSchedule, ZoneVehicleType, sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');
const { scheduleErrors, checkStay } = require('../utils/zoneHours');
const { safeRollback } = require('../utils/transaction');
const { checkStayTimes, outsideHoursError } = require('../utils/stayRequest');
const availability = require('../services/availability');
const { withVehicleTypes, acceptedType } = require('../services/zoneVehicleTypes');
const { VEHICLE_TYPES } = require('../constants/vehicleTypes');
const { vehicleTypesErrors, vehicleTypesOf } = require('../utils/zoneVehicleTypes');

// HU-29: every zone is sent with its opening hours (Zona.toJSON)
const CON_HORARIO = { model: ZoneSchedule, as: 'schedules' };

// The share of the spots of a zone that is free now (#373). HU-31: of the
// vehicle types it accepts (withVehicleTypes)
const shareFree = (zona) => (zona.get('totalSlots') > 0 ? zona.get('availableSlots') / zona.get('totalSlots') : 0);

// #373: the zones and their free spots are read in one transaction, so all
// the reads see the same moment (REPEATABLE READ): a capacity changed between
// them would give a zone more free spots than its capacity
const enUnMomento = (work) => sequelize.transaction(work);

// GET /api/zones — public, list only active zones, ordered by highest availability first
async function getZonas(req, res, next) {
  try {
    // #373: availableSlots is calculated from the reservations, for all the
    // zones in one query, and they are ordered by it (then by name). HU-31:
    // each zone with the vehicle types it accepts.
    const zonas = await enUnMomento(async (transaction) => withVehicleTypes(
      await Zona.findAll({ where: { isActive: true }, include: [CON_HORARIO], transaction }),
      { transaction },
    ));
    zonas.sort((a, b) => shareFree(b) - shareFree(a) || a.name.localeCompare(b.name, 'es'));
    return res.status(200).json({ zones: zonas });
  } catch (error) {
    next(error);
  }
}

function coordenadasValidas(lat, lng) {
  return (
    typeof lat === 'number' && lat >= -90 && lat <= 90 &&
    typeof lng === 'number' && lng >= -180 && lng <= 180
  );
}

// Rectangle that covers Colombia, San Andrés and Leticia included (audit of
// Oct 20, 2026). It also takes in small border areas of the neighboring
// countries, which is accepted. A point on an edge counts as inside.
const COLOMBIA_BOUNDS = { minLat: -4.3, maxLat: 13.5, minLng: -82, maxLng: -66.8 };

function dentroDeColombia(lat, lng) {
  return (
    lat >= COLOMBIA_BOUNDS.minLat && lat <= COLOMBIA_BOUNDS.maxLat &&
    lng >= COLOMBIA_BOUNDS.minLng && lng <= COLOMBIA_BOUNDS.maxLng
  );
}

const textoVacio = (valor) => typeof valor !== 'string' || valor.trim() === '';

// Same rules for create (HU-20) and edit (HU-21, AC-02). Returns the status
// and body of the error to send, or null when the body is valid. Format errors
// use the same shape as express-validator: { code: VALIDATION_ERROR, errors }.
// HU-31: the spots and the rate are the ones of each vehicle type
// (vehicleTypes), and all their errors are sent together.
function validarZona({ name, address, latitude, longitude, vehicleTypes }) {
  if (textoVacio(name) || textoVacio(address) || latitude == null || longitude == null || vehicleTypes == null) {
    return { status: 400, body: { code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'name, address, latitude, longitude, and vehicleTypes are required' } };
  }
  if (name.trim().length > 100) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'name', msg: 'name must be at most 100 characters' }] } };
  }
  if (address.trim().length > 255) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'address', msg: 'address must be at most 255 characters' }] } };
  }
  const errores = vehicleTypesErrors(vehicleTypes);
  if (errores.length > 0) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: errores } };
  }
  if (!coordenadasValidas(latitude, longitude)) {
    return { status: 400, body: { code: ErrorCodes.INVALID_COORDINATES, message: 'latitude must be between -90 and 90, and longitude between -180 and 180' } };
  }
  if (!dentroDeColombia(latitude, longitude)) {
    return { status: 400, body: { code: ErrorCodes.COORDINATES_OUTSIDE_COLOMBIA, message: `latitude must be between ${COLOMBIA_BOUNDS.minLat} and ${COLOMBIA_BOUNDS.maxLat}, and longitude between ${COLOMBIA_BOUNDS.minLng} and ${COLOMBIA_BOUNDS.maxLng} (Colombia)` } };
  }
  return null;
}

// HU-29 (AC-01, AC-02): the admin chooses "Abierta 24 horas" (open24h: true)
// or a custom schedule (open24h: false) with the days the zone opens. Same
// shape of error as validarZona; an error about one day carries that day.
function validarHorario({ open24h, schedule }) {
  if (typeof open24h !== 'boolean') {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'open24h', msg: 'open24h must be true or false' }] } };
  }
  if (open24h) return null;
  const errors = scheduleErrors(schedule);
  if (errors.length > 0) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors } };
  }
  return null;
}

// The rows of zone_schedules for a custom schedule (none when open 24 hours)
function filasHorario(zoneId, { open24h, schedule }) {
  if (open24h) return [];
  return schedule.map(({ day, opensAt, closesAt }) => ({ zoneId, dayOfWeek: day, opensAt, closesAt }));
}

// #371: the answer to a zone that is already saved (after the commit).
// Reading it again with its hours is only for the answer: if that read fails,
// the answer keeps the saved zone and the error goes to the log, instead of a
// 500 for a change that was saved. #373, HU-31: its vehicle types and free
// spots were counted in the transaction (lasCuentas), and the zone is sent
// with them like everywhere else.
async function responderZonaGuardada(res, status, message, zona, cuentas) {
  try {
    await zona.reload({ include: [CON_HORARIO] });
  } catch (err) {
    console.error(`The zone ${zona.id} was saved, but reading it again failed:`, err);
  }
  conCuentas(zona, cuentas);
  return res.status(status).json({ message, zone: zona });
}

// HU-31: what withVehicleTypes added to a zone, to add it again after the
// zone is read or saved again (reload and update replace its values)
async function lasCuentas(zona, options) {
  await withVehicleTypes([zona], { ...options, forAdmin: true });
  return { vehicleTypes: zona.get('vehicleTypes'), totalSlots: zona.get('totalSlots'), availableSlots: zona.get('availableSlots') };
}

function conCuentas(zona, cuentas) {
  for (const [key, value] of Object.entries(cuentas)) zona.setDataValue(key, value);
  return zona;
}

// HU-21 for one vehicle type (HU-31): its spots go from `desde` to `hasta`.
// A reduction disables the spots with no reservation from now on, the
// highest numbers first, and cannot go below the spots in use. An increase
// reuses the spots disabled by an earlier reduction first, and the new ones
// continue after the highest number of the type, so the numbers of a type
// never repeat. Returns the error to answer with, or null.
async function cambiarCupos(zoneId, vehicleType, desde, hasta, { transaction, now }) {
  if (hasta < desde) {
    // A spot is in use while a Pending or Active reservation holds it from
    // now on (several reservations of one spot count once). spotsInUse lets
    // the screen say how many spots of the type are taken.
    const ocupados = await availability.spotsOfTypeInUse(zoneId, vehicleType, { transaction, now });
    if (hasta < ocupados) {
      return {
        status: 400,
        body: {
          code: ErrorCodes.CAPACITY_BELOW_IN_USE,
          message: `Cannot reduce the ${vehicleType} spots below ${ocupados} spots currently in use`,
          vehicleType,
          spotsInUse: ocupados,
        },
      };
    }
    const delta = desde - hasta;
    const candidatos = await ParkingSpot.findAll({
      where: { zoneId, vehicleType, status: availability.ENABLED, [Op.and]: [availability.freeFromNow(now)] },
      order: [['spotNumber', 'DESC']],
      limit: delta,
      transaction,
    });
    if (candidatos.length < delta) {
      return {
        status: 400,
        body: {
          code: ErrorCodes.INSUFFICIENT_AVAILABLE_SPOTS,
          message: `Cannot reduce the ${vehicleType} spots: not enough available spots to disable`,
          vehicleType,
        },
      };
    }
    await ParkingSpot.update({ status: 'Disabled' }, { where: { id: candidatos.map((c) => c.id) }, transaction });
  } else if (hasta > desde) {
    const delta = hasta - desde;
    const deshabilitados = await ParkingSpot.findAll({
      where: { zoneId, vehicleType, status: 'Disabled' },
      order: [['spotNumber', 'ASC']],
      limit: delta,
      transaction,
    });
    if (deshabilitados.length > 0) {
      await ParkingSpot.update({ status: 'Available' }, { where: { id: deshabilitados.map((s) => s.id) }, transaction });
    }
    const faltan = delta - deshabilitados.length;
    if (faltan > 0) {
      const mayorNumero = (await ParkingSpot.max('spotNumber', { where: { zoneId, vehicleType }, transaction })) || 0;
      const nuevos = Array.from({ length: faltan }, (_, i) => ({
        zoneId,
        vehicleType,
        spotNumber: mayorNumero + i + 1,
        status: 'Available',
      }));
      await ParkingSpot.bulkCreate(nuevos, { transaction });
    }
  }
  return null;
}

// #304: the unique index of zones.name (zones_name_unique) rejected the name.
// Two requests can pass the check of the name at the same time (two
// creations, two renames, or one of each); the index lets only the first one
// save it, and the other one answers 409 like the check does.
function esNombreRepetido(err) {
  if (err.name !== 'SequelizeUniqueConstraintError') return false;
  return Object.keys(err.fields ?? {}).some((field) => {
    const key = field.split('.').pop();
    return key === 'name' || key === 'zones_name_unique';
  });
}

const NOMBRE_REPETIDO = { code: ErrorCodes.ZONE_NAME_TAKEN, message: 'A zone with this name already exists' };

// POST /api/zones — admin only
async function createZona(req, res, next) {
  const error = validarZona(req.body) || validarHorario(req.body);
  if (error) {
    return res.status(error.status).json(error.body);
  }

  const name = req.body.name.trim();
  const address = req.body.address.trim();
  const { latitude, longitude } = req.body;
  // HU-31: the vehicle types the zone accepts, with their spots and rates
  const tipos = vehicleTypesOf(req.body.vehicleTypes);

  // The zone, its types and its spots are created together: if the spots
  // fail, the zone must not stay behind without them
  const t = await sequelize.transaction();
  let zona;
  let cuentas;
  try {
    const existente = await Zona.findOne({ where: { name }, transaction: t });
    if (existente) {
      await t.rollback();
      return res.status(409).json({ code: ErrorCodes.ZONE_NAME_TAKEN, message: 'A zone with this name already exists' });
    }

    zona = await Zona.create({
      name,
      address,
      latitude,
      longitude,
      open24h: req.body.open24h,
    }, { transaction: t });
    await ZoneSchedule.bulkCreate(filasHorario(zona.id, req.body), { transaction: t });

    // The types go before the spots, which must belong to one of them. The
    // spots of each type are numbered from 1.
    await ZoneVehicleType.bulkCreate(
      tipos.map((tipo) => ({ zoneId: zona.id, ...tipo, isAccepting: true })),
      { transaction: t }
    );
    const spots = tipos.flatMap((tipo) => Array.from({ length: tipo.totalSlots }, (_, i) => ({
      zoneId: zona.id,
      vehicleType: tipo.vehicleType,
      spotNumber: i + 1,
      status: 'Available',
    })));
    await ParkingSpot.bulkCreate(spots, { transaction: t });

    cuentas = await lasCuentas(zona, { transaction: t });
    await t.commit();
  } catch (err) {
    await safeRollback(t);
    if (esNombreRepetido(err)) {
      return res.status(409).json(NOMBRE_REPETIDO);
    }
    return next(err);
  }

  // #371: out of the try, so an error after the commit never tries to undo it
  return responderZonaGuardada(res, 201, 'Zone created successfully', zona, cuentas);
}

// PUT /api/zones/:id — admin only
async function updateZona(req, res, next) {
  const error = validarZona(req.body) || validarHorario(req.body);
  if (error) {
    return res.status(error.status).json(error.body);
  }

  const { id } = req.params;
  const name = req.body.name.trim();
  const address = req.body.address.trim();
  const { latitude, longitude } = req.body;
  // HU-31: the vehicle types the zone accepts from now on
  const tipos = vehicleTypesOf(req.body.vehicleTypes);

  const t = await sequelize.transaction();
  let zona;
  let cuentas;
  try {
    // Locked so a reservation can't take a spot while the capacity changes.
    // #371: the zone first and then its spots; crear and ampliar lock the
    // zone first too, and the payment after its reservation, so they wait
    // instead of a deadlock (#373: cancelar, terminar and the two jobs no
    // longer lock the zone or a spot).
    zona = await Zona.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
    if (!zona) {
      await t.rollback();
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }

    // HU-21 AC-02: the new name must not belong to another zone
    const mismoNombre = await Zona.findOne({ where: { name, id: { [Op.ne]: id } }, transaction: t });
    if (mismoNombre) {
      await t.rollback();
      return res.status(409).json({ code: ErrorCodes.ZONE_NAME_TAKEN, message: 'A zone with this name already exists' });
    }

    // HU-31 AC-05: a type that the zone accepted and is not in the list is
    // turned off. It takes no new reservations, and keeps its spots, its
    // rate and the reservations it has. The lock of the zone keeps its types
    // as they are read here until the commit.
    const ahora = new Date();
    const actuales = await ZoneVehicleType.findAll({ where: { zoneId: id }, transaction: t });
    const pedidos = new Set(tipos.map((tipo) => tipo.vehicleType));
    const apagados = actuales.filter((actual) => actual.isAccepting && !pedidos.has(actual.vehicleType));
    if (apagados.length > 0) {
      await ZoneVehicleType.update(
        { isAccepting: false },
        { where: { id: apagados.map((actual) => actual.id) }, transaction: t }
      );
    }

    // Each type of the list: its spots change from the ones it has (HU-21,
    // AC-03 and AC-04). A type that was turned off takes reservations again
    // with its spots, and a new type gets its spots from 1, after its row,
    // which they must belong to.
    for (const tipo of tipos) {
      const actual = actuales.find((fila) => fila.vehicleType === tipo.vehicleType);
      if (!actual) {
        await ZoneVehicleType.create({ zoneId: id, ...tipo, isAccepting: true }, { transaction: t });
      }
      const fallo = await cambiarCupos(id, tipo.vehicleType, actual ? actual.totalSlots : 0, tipo.totalSlots, { transaction: t, now: ahora });
      if (fallo) {
        await t.rollback();
        return res.status(fallo.status).json(fallo.body);
      }
      if (actual) {
        await actual.update({ totalSlots: tipo.totalSlots, hourlyRate: tipo.hourlyRate, isAccepting: true }, { transaction: t });
      }
    }

    await zona.update({
      name,
      address,
      latitude,
      longitude,
      open24h: req.body.open24h,
    }, { transaction: t });

    // HU-29: the new hours replace the old ones. The reservations that
    // already exist keep their times (decision 8, AC-07).
    await ZoneSchedule.destroy({ where: { zoneId: id }, transaction: t });
    await ZoneSchedule.bulkCreate(filasHorario(id, req.body), { transaction: t });

    // #373: the spots free now, with the new spots of each type
    cuentas = await lasCuentas(zona, { transaction: t, now: ahora });
    await t.commit();
  } catch (err) {
    await safeRollback(t);
    if (esNombreRepetido(err)) {
      return res.status(409).json(NOMBRE_REPETIDO);
    }
    return next(err);
  }

  // #371: out of the try, so an error after the commit never tries to undo it
  return responderZonaGuardada(res, 200, 'Zone updated successfully', zona, cuentas);
}

// PATCH /api/zones/:id/toggle — admin only, activate/deactivate instead of deleting
// #304: the body says the state wanted ({ isActive: true | false }) and the
// zone gets it, so two admins who deactivate it at the same time both leave
// it inactive, instead of the second one activating it again.
async function toggleZona(req, res, next) {
  // Without a body, req.body is undefined (Express 5)
  const isActive = req.body?.isActive;
  if (typeof isActive !== 'boolean') {
    return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'isActive', msg: 'isActive must be true or false' }] });
  }

  try {
    const { id } = req.params;
    // #373: the zone is sent as everywhere else, with its free spots, read
    // with it in one moment. They are counted before saving: activating or
    // deactivating does not change them, and if counting fails nothing was
    // changed, so the request can be repeated.
    const leida = await enUnMomento(async (transaction) => {
      const encontrada = await Zona.findByPk(id, { include: [CON_HORARIO], transaction });
      return encontrada && { zona: encontrada, cuentas: await lasCuentas(encontrada, { transaction }) };
    });
    if (!leida) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }
    const { zona, cuentas } = leida;

    await zona.update({ isActive });
    conCuentas(zona, cuentas);

    return res.status(200).json({
      message: `Zone ${zona.isActive ? 'activated' : 'deactivated'} successfully`,
      zone: zona,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/zones/:id — single zone detail (used for reservations AND admin editing,
// so it must NOT filter by isActive — an admin needs to reach a deactivated zone
// to reactivate it)
async function getZonaPorId(req, res, next) {
  try {
    const { id } = req.params;

    // #373: the spots free now, calculated from the reservations. HU-31: of
    // each vehicle type the zone accepts
    const zona = await enUnMomento(async (transaction) => {
      const leida = await Zona.findByPk(id, { include: [CON_HORARIO], transaction });
      if (leida) await withVehicleTypes([leida], { transaction });
      return leida;
    });
    if (!zona) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }

    return res.status(200).json({ zone: zona });
  } catch (error) {
    next(error);
  }
}

// GET /api/zones/:id/availability — public (#375): how many spots of the zone
// are free for some hours, with the same rules as POST /reservations: the
// same checks of the times (utils/stayRequest.js), the hours of the zone and
// the free spots with the 10 minutes before and after. ?startTime=&endTime=,
// or ?startTime=&openEnded=true for a stay without an exit time, which holds
// its spot until the closing time of the zone or for 24 hours, as when it is
// reserved. HU-31: and &vehicleType=, the type of the chosen vehicle: the
// answer counts the spots of that type, with its rate. It only informs: the
// reservation still decides when it is sent.
async function getDisponibilidadPorHoras(req, res, next) {
  try {
    const { id } = req.params;
    const { startTime, endTime, openEnded, vehicleType } = req.query;

    // A repeated value (?startTime=a&startTime=b) arrives as a list
    for (const [name, value] of Object.entries({ startTime, endTime, openEnded, vehicleType })) {
      if (value !== undefined && typeof value !== 'string') {
        return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, message: `${name} must be text` });
      }
    }
    if (openEnded !== undefined && openEnded !== 'true' && openEnded !== 'false') {
      return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, message: 'openEnded must be true or false' });
    }
    // HU-31: the spots of one vehicle type, the one of the chosen vehicle
    if (!VEHICLE_TYPES.includes(vehicleType)) {
      return res.status(400).json({ code: ErrorCodes.VALIDATION_ERROR, message: `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}` });
    }
    const isOpenStay = openEnded === 'true';

    const now = new Date();
    const horas = checkStayTimes({ startTime, endTime, openEnded: isOpenStay }, now);
    if (horas.error) {
      return res.status(horas.error.status).json(horas.error.body);
    }

    // The zone and its free spots are read at the same moment
    const respuesta = await enUnMomento(async (transaction) => {
      const zona = await Zona.findByPk(id, { include: [CON_HORARIO], transaction });
      if (!zona) {
        return { status: 404, body: { code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' } };
      }
      if (!zona.isActive) {
        return { status: 409, body: { code: ErrorCodes.ZONE_INACTIVE, message: 'This zone is no longer accepting reservations' } };
      }
      // HU-31: the zone must take that type, as in POST /reservations
      const aceptado = await acceptedType(zona.id, vehicleType, { transaction });
      if (aceptado.error) return aceptado.error;
      // HU-29: the stay must fit the hours of the day of the entry, and an
      // open stay holds its spot until the closing time of that day
      const horario = checkStay(zona, horas.start, isOpenStay ? null : horas.end);
      if (horario.problem) return outsideHoursError(horario.problem);
      const end = isOpenStay && horario.closesAt ? horario.closesAt : horas.end;

      const libres = await availability.freeSpotsBetween(zona.id, vehicleType, horas.start, end, { transaction, now });
      return {
        status: 200,
        body: {
          zoneId: zona.id,
          vehicleType,
          startTime: horas.start,
          endTime: end,
          openEnded: isOpenStay,
          availableSlots: libres,
          totalSlots: aceptado.tipo.totalSlots,
          hourlyRate: Number(aceptado.tipo.hourlyRate),
        },
      };
    });
    return res.status(respuesta.status).json(respuesta.body);
  } catch (error) {
    next(error);
  }
}

// GET /api/zones/all — admin only, ALL zones regardless of active status (HU-19, AC-01)
async function getTodasLasZonas(req, res, next) {
  try {
    // activeReservations: Pending or Active reservations of each zone, so the
    // screen can warn before deactivating it (HU-19, AC-08)
    const zonas = await enUnMomento(async (transaction) => {
      const leidas = await Zona.findAll({
        attributes: {
          include: [[
            sequelize.literal(`(
              SELECT COUNT(*) FROM reservations AS r
              WHERE r.zone_id = Zona.id AND r.status IN ('Pending', 'Active')
            )`),
            'activeReservations',
          ]],
        },
        include: [CON_HORARIO],
        order: [['name', 'ASC']],
        transaction,
      });
      // #373: availableSlots, and spotsInUse: the spots with a Pending or
      // Active reservation from now on, the least capacity the zone can have
      // (HU-21, AC-03). Each one is one query for all the zones. HU-31: also
      // for each vehicle type, the ones turned off included.
      await withVehicleTypes(leidas, { transaction, forAdmin: true });
      const enUso = await availability.spotsInUseByZone(leidas.map((zona) => zona.id), { transaction });
      for (const zona of leidas) zona.setDataValue('spotsInUse', enUso.get(zona.id));
      return leidas;
    });
    return res.status(200).json({ zones: zonas });
  } catch (error) {
    next(error);
  }
}

// validarZona and validarHorario are exported only so the tests can call them without a database
module.exports = { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getZonaPorId, getDisponibilidadPorHoras, validarZona, validarHorario };
