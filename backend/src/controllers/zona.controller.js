const { Op } = require('sequelize');
const { Zona, Reserva, ParkingSpot, sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

// GET /api/zones — public, list only active zones, ordered by highest availability first
async function getZonas(req, res, next) {
  try {
    const zonas = await Zona.findAll({
      where: { isActive: true },
      order: [
        [Zona.sequelize.literal('available_slots / total_slots'), 'DESC'],
      ],
    });
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
  return null;
}

// POST /api/zones — admin only
async function createZona(req, res, next) {
  const error = validarZona(req.body);
  if (error) {
    return res.status(error.status).json(error.body);
  }

  const name = req.body.name.trim();
  const address = req.body.address.trim();
  const { latitude, longitude, totalSlots, hourlyRate } = req.body;

  // The zone and its spots are created together: if the spots fail, the zone
  // must not stay behind without them
  const t = await sequelize.transaction();
  try {
    const existente = await Zona.findOne({ where: { name }, transaction: t });
    if (existente) {
      await t.rollback();
      return res.status(409).json({ code: ErrorCodes.ZONE_NAME_TAKEN, message: 'A zone with this name already exists' });
    }

    const zona = await Zona.create({
      name,
      address,
      latitude,
      longitude,
      totalSlots,
      availableSlots: totalSlots,
      hourlyRate,
    }, { transaction: t });

    const spots = Array.from({ length: totalSlots }, (_, i) => ({
      zoneId: zona.id,
      spotNumber: i + 1,
      status: 'Available',
    }));
    await ParkingSpot.bulkCreate(spots, { transaction: t });

    await t.commit();
    return res.status(201).json({ message: 'Zone created successfully', zone: zona });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// PUT /api/zones/:id — admin only
async function updateZona(req, res, next) {
  const error = validarZona(req.body);
  if (error) {
    return res.status(error.status).json(error.body);
  }

  const { id } = req.params;
  const name = req.body.name.trim();
  const address = req.body.address.trim();
  const { latitude, longitude, totalSlots, hourlyRate } = req.body;

  const t = await sequelize.transaction();
  try {
    // Locked so a reservation can't take a spot while the capacity changes
    const zona = await Zona.findByPk(id, { transaction: t, lock: t.LOCK.UPDATE });
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

    if (totalSlots < zona.totalSlots) {
      const ocupados = await Reserva.count({
        where: { zoneId: id, status: ['Pending', 'Active'] },
        transaction: t,
      });
      // HU-21 AC-03: spotsInUse lets the screen say how many spots are taken
      if (totalSlots < ocupados) {
        await t.rollback();
        return res.status(400).json({
          code: ErrorCodes.CAPACITY_BELOW_IN_USE,
          message: `Cannot reduce capacity below ${ocupados} spots currently in use`,
          spotsInUse: ocupados,
        });
      }

      const delta = zona.totalSlots - totalSlots;
      const candidatos = await ParkingSpot.findAll({
        where: { zoneId: id, status: 'Available' },
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

    const disponibles = await ParkingSpot.count({ where: { zoneId: id, status: 'Available' }, transaction: t });
    await zona.update({
      name,
      address,
      latitude,
      longitude,
      totalSlots,
      hourlyRate,
      availableSlots: disponibles,
    }, { transaction: t });

    await t.commit();
    return res.status(200).json({ message: 'Zone updated successfully', zone: zona });
  } catch (err) {
    await t.rollback();
    next(err);
  }
}

// PATCH /api/zones/:id/toggle — admin only, activate/deactivate instead of deleting
async function toggleZona(req, res, next) {
  try {
    const { id } = req.params;
    const zona = await Zona.findByPk(id);
    if (!zona) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }

    await zona.update({ isActive: !zona.isActive });

    return res.status(200).json({
      message: `Zone ${zona.isActive ? 'activated' : 'deactivated'} successfully`,
      zone: zona,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/zones/:id/spots — admin only, detailed view of every physical spot
async function getSpotsDeZona(req, res, next) {
  try {
    const { id } = req.params;

    const zona = await Zona.findByPk(id);
    if (!zona) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }

    const spots = await ParkingSpot.findAll({
      where: { zoneId: id },
      order: [['spotNumber', 'ASC']],
      attributes: ['id', 'spotNumber', 'status'],
    });

    const summary = spots.reduce(
      (acc, s) => {
        acc[s.status] = (acc[s.status] || 0) + 1;
        return acc;
      },
      { Available: 0, Occupied: 0, Disabled: 0 }
    );

    return res.status(200).json({
      zoneId: zona.id,
      zoneName: zona.name,
      summary,
      spots,
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

    const zona = await Zona.findByPk(id);
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
    const zonas = await Zona.findAll({
      attributes: {
        include: [[
          sequelize.literal(`(
            SELECT COUNT(*) FROM reservations AS r
            WHERE r.zone_id = Zona.id AND r.status IN ('Pending', 'Active')
          )`),
          'activeReservations',
        ]],
      },
      order: [['name', 'ASC']],
    });
    return res.status(200).json({ zones: zonas });
  } catch (error) {
    next(error);
  }
}

// validarZona is exported only so the tests can call it without a database
module.exports = { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getSpotsDeZona, getZonaPorId, validarZona };
