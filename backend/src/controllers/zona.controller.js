const { Op } = require('sequelize');
const { Zona, ParkingSpot, ZoneSchedule, sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');
const { scheduleErrors } = require('../utils/zoneHours');
const { safeRollback } = require('../utils/transaction');
const availability = require('../services/availability');

// HU-29: every zone is sent with its opening hours (Zona.toJSON)
const CON_HORARIO = { model: ZoneSchedule, as: 'schedules' };

// The share of the spots of a zone that is free now (#373)
const shareFree = (zona) => zona.get('availableSlots') / zona.totalSlots;

// #373: the zones and their free spots are read in one transaction, so all
// the reads see the same moment (REPEATABLE READ): a capacity changed between
// them would give a zone more free spots than its capacity
const enUnMomento = (work) => sequelize.transaction(work);

// GET /api/zones — public, list only active zones, ordered by highest availability first
async function getZonas(req, res, next) {
  try {
    // #373: availableSlots is calculated from the reservations, for all the
    // zones in one query, and they are ordered by it (then by name)
    const zonas = await enUnMomento(async (transaction) => availability.withAvailableSlots(
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

// Upper limit so a typo (e.g. 50000 instead of 50) can't create thousands of
// parking spots in a single request
const MAX_TOTAL_SLOTS = 500;
// DECIMAL(10, 2) in the database
const MAX_HOURLY_RATE = 99999999.99;

const textoVacio = (valor) => typeof valor !== 'string' || valor.trim() === '';

// Same rules for create (HU-20) and edit (HU-21, AC-02). Returns the status
// and body of the error to send, or null when the body is valid. Format errors
// use the same shape as express-validator: { code: VALIDATION_ERROR, errors }.
function validarZona({ name, address, latitude, longitude, totalSlots, hourlyRate }) {
  if (textoVacio(name) || textoVacio(address) || latitude == null || longitude == null
    || totalSlots == null || hourlyRate == null) {
    return { status: 400, body: { code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'name, address, latitude, longitude, totalSlots, and hourlyRate are required' } };
  }
  if (name.trim().length > 100) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'name', msg: 'name must be at most 100 characters' }] } };
  }
  if (address.trim().length > 255) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'address', msg: 'address must be at most 255 characters' }] } };
  }
  if (!Number.isInteger(totalSlots) || totalSlots <= 0 || totalSlots > MAX_TOTAL_SLOTS) {
    return { status: 400, body: { code: ErrorCodes.INVALID_CAPACITY, message: `totalSlots must be a whole number between 1 and ${MAX_TOTAL_SLOTS}` } };
  }
  if (typeof hourlyRate !== 'number' || !Number.isFinite(hourlyRate) || hourlyRate > MAX_HOURLY_RATE) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'hourlyRate', msg: `hourlyRate must be a number up to ${MAX_HOURLY_RATE}` }] } };
  }
  if (hourlyRate < 0) {
    return { status: 400, body: { code: ErrorCodes.NEGATIVE_VALUE, message: 'hourlyRate cannot be negative' } };
  }
  // #316: every zone charges for its hours. With a rate of 0 the reservation
  // would ask the user to pay $ 0
  if (hourlyRate === 0) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'hourlyRate', msg: 'hourlyRate must be greater than 0' }] } };
  }
  // hourly_rate is DECIMAL(10, 2): the database would round a third decimal
  // without any warning, so a rate is valid only when rounding it to 2
  // decimals does not change it. Checking rate * 100 for a whole number is not
  // safe: floating point makes 1.005 * 100 equal 100.49999999999999.
  if (Number(hourlyRate.toFixed(2)) !== hourlyRate) {
    return { status: 400, body: { code: ErrorCodes.VALIDATION_ERROR, errors: [{ path: 'hourlyRate', msg: 'hourlyRate must have at most 2 decimals' }] } };
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
// 500 for a change that was saved. #373: `availableSlots` was counted in the
// transaction, and the zone is sent with it like everywhere else.
async function responderZonaGuardada(res, status, message, zona, availableSlots) {
  try {
    await zona.reload({ include: [CON_HORARIO] });
  } catch (err) {
    console.error(`The zone ${zona.id} was saved, but reading it again failed:`, err);
  }
  zona.setDataValue('availableSlots', availableSlots);
  return res.status(status).json({ message, zone: zona });
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
  const { latitude, longitude, totalSlots, hourlyRate } = req.body;

  // The zone and its spots are created together: if the spots fail, the zone
  // must not stay behind without them
  const t = await sequelize.transaction();
  let zona;
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
      totalSlots,
      hourlyRate,
      open24h: req.body.open24h,
    }, { transaction: t });
    await ZoneSchedule.bulkCreate(filasHorario(zona.id, req.body), { transaction: t });

    const spots = Array.from({ length: totalSlots }, (_, i) => ({
      zoneId: zona.id,
      spotNumber: i + 1,
      status: 'Available',
    }));
    await ParkingSpot.bulkCreate(spots, { transaction: t });

    await t.commit();
  } catch (err) {
    await safeRollback(t);
    if (esNombreRepetido(err)) {
      return res.status(409).json(NOMBRE_REPETIDO);
    }
    return next(err);
  }

  // #371: out of the try, so an error after the commit never tries to undo it.
  // A new zone has no reservations, so all its spots are free.
  return responderZonaGuardada(res, 201, 'Zone created successfully', zona, totalSlots);
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
  const { latitude, longitude, totalSlots, hourlyRate } = req.body;

  const t = await sequelize.transaction();
  let zona;
  let disponibles;
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

    const ahora = new Date();
    if (totalSlots < zona.totalSlots) {
      // HU-21 AC-03, #373: a spot is in use while a Pending or Active
      // reservation holds it from now on (several reservations of one spot
      // count once), and only the other spots can be disabled. spotsInUse
      // lets the screen say how many spots are taken.
      const ocupados = await availability.spotsInUse(id, { transaction: t, now: ahora });
      if (totalSlots < ocupados) {
        await t.rollback();
        return res.status(400).json({
          code: ErrorCodes.CAPACITY_BELOW_IN_USE,
          message: `Cannot reduce capacity below ${ocupados} spots currently in use`,
          spotsInUse: ocupados,
        });
      }

      // The enabled spots with no reservation from now on, the highest
      // numbers first
      const delta = zona.totalSlots - totalSlots;
      const candidatos = await ParkingSpot.findAll({
        where: { zoneId: id, status: availability.ENABLED, [Op.and]: [availability.freeFromNow(ahora)] },
        order: [['spotNumber', 'DESC']],
        limit: delta,
        transaction: t,
      });
      if (candidatos.length < delta) {
        await t.rollback();
        return res.status(400).json({
          code: ErrorCodes.INSUFFICIENT_AVAILABLE_SPOTS,
          message: 'Cannot reduce capacity: not enough available spots to disable',
        });
      }
      await ParkingSpot.update(
        { status: 'Disabled' },
        { where: { id: candidatos.map((c) => c.id) }, transaction: t }
      );
    } else if (totalSlots > zona.totalSlots) {
      // HU-21 AC-04: spots disabled by an earlier reduction are reused first;
      // new ones continue after the highest number, so numbers never repeat
      const delta = totalSlots - zona.totalSlots;
      const deshabilitados = await ParkingSpot.findAll({
        where: { zoneId: id, status: 'Disabled' },
        order: [['spotNumber', 'ASC']],
        limit: delta,
        transaction: t,
      });
      if (deshabilitados.length > 0) {
        await ParkingSpot.update(
          { status: 'Available' },
          { where: { id: deshabilitados.map((s) => s.id) }, transaction: t }
        );
      }

      const faltan = delta - deshabilitados.length;
      if (faltan > 0) {
        const mayorNumero = (await ParkingSpot.max('spotNumber', { where: { zoneId: id }, transaction: t })) || 0;
        const nuevos = Array.from({ length: faltan }, (_, i) => ({
          zoneId: id,
          spotNumber: mayorNumero + i + 1,
          status: 'Available',
        }));
        await ParkingSpot.bulkCreate(nuevos, { transaction: t });
      }
    }

    // #373: the spots free now, with the new capacity
    disponibles = await availability.availableNow(id, { transaction: t, now: ahora });
    await zona.update({
      name,
      address,
      latitude,
      longitude,
      totalSlots,
      hourlyRate,
      open24h: req.body.open24h,
    }, { transaction: t });

    // HU-29: the new hours replace the old ones. The reservations that
    // already exist keep their times (decision 8, AC-07).
    await ZoneSchedule.destroy({ where: { zoneId: id }, transaction: t });
    await ZoneSchedule.bulkCreate(filasHorario(id, req.body), { transaction: t });

    await t.commit();
  } catch (err) {
    await safeRollback(t);
    if (esNombreRepetido(err)) {
      return res.status(409).json(NOMBRE_REPETIDO);
    }
    return next(err);
  }

  // #371: out of the try, so an error after the commit never tries to undo it
  return responderZonaGuardada(res, 200, 'Zone updated successfully', zona, disponibles);
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
      return encontrada && { zona: encontrada, disponibles: await availability.availableNow(encontrada.id, { transaction }) };
    });
    if (!leida) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }
    const { zona, disponibles } = leida;

    await zona.update({ isActive });
    zona.setDataValue('availableSlots', disponibles);

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

    // #373: the spots free now, calculated from the reservations
    const zona = await enUnMomento(async (transaction) => {
      const leida = await Zona.findByPk(id, { include: [CON_HORARIO], transaction });
      if (leida) leida.setDataValue('availableSlots', await availability.availableNow(leida.id, { transaction }));
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
      // (HU-21, AC-03). Each one is one query for all the zones.
      await availability.withAvailableSlots(leidas, { transaction });
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
module.exports = { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getZonaPorId, validarZona, validarHorario };
