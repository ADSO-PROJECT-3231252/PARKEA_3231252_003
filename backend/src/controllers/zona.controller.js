const { Zona, Reserva, ParkingSpot } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

// GET /api/zones — public, list only active zones
async function getZonas(req, res, next) {
  try {
    const zonas = await Zona.findAll({ where: { isActive: true } });
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

// POST /api/zones — admin only
async function createZona(req, res, next) {
  try {
    const { name, address, latitude, longitude, totalSlots, hourlyRate } = req.body;

    if (!name || totalSlots == null || hourlyRate == null || latitude == null || longitude == null) {
      return res.status(400).json({ code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'name, latitude, longitude, totalSlots, and hourlyRate are required' });
    }
    if (!Number.isInteger(totalSlots) || totalSlots <= 0) {
      return res.status(400).json({ code: ErrorCodes.INVALID_CAPACITY, message: 'totalSlots must be a whole number greater than zero' });
    }
    if (hourlyRate < 0) {
      return res.status(400).json({ code: ErrorCodes.NEGATIVE_VALUE, message: 'hourlyRate cannot be negative' });
    }
    if (!coordenadasValidas(latitude, longitude)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_COORDINATES, message: 'latitude must be between -90 and 90, and longitude between -180 and 180' });
    }

    const existente = await Zona.findOne({ where: { name } });
    if (existente) {
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
    });

    const spots = Array.from({ length: totalSlots }, (_, i) => ({
      zoneId: zona.id,
      spotNumber: i + 1,
      status: 'Available',
    }));
    await ParkingSpot.bulkCreate(spots);

    return res.status(201).json({ message: 'Zone created successfully', zone: zona });
  } catch (error) {
    next(error);
  }
}

// PUT /api/zones/:id — admin only
async function updateZona(req, res, next) {
  try {
    const { id } = req.params;
    const zona = await Zona.findByPk(id);
    if (!zona) {
      return res.status(404).json({ code: ErrorCodes.ZONE_NOT_FOUND, message: 'Zone not found' });
    }

    const { name, address, latitude, longitude, totalSlots, hourlyRate } = req.body;

    if (totalSlots != null && (!Number.isInteger(totalSlots) || totalSlots <= 0)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_CAPACITY, message: 'totalSlots must be a whole number greater than zero' });
    }
    if (hourlyRate != null && hourlyRate < 0) {
      return res.status(400).json({ code: ErrorCodes.NEGATIVE_VALUE, message: 'hourlyRate cannot be negative' });
    }
    if ((latitude != null || longitude != null) && !coordenadasValidas(latitude, longitude)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_COORDINATES, message: 'latitude must be between -90 and 90, and longitude between -180 and 180' });
    }

    const updates = { name, address, latitude, longitude, hourlyRate };

    if (totalSlots != null) {
      const ocupados = await Reserva.count({
        where: { zoneId: id, status: ['Pending', 'Active'] },
      });
      if (totalSlots < ocupados) {
        return res.status(400).json({
          code: ErrorCodes.CAPACITY_BELOW_IN_USE,
          message: `Cannot reduce capacity below ${ocupados} spots currently in use`,
        });
      }

      if (totalSlots > zona.totalSlots) {
        const nuevos = Array.from(
          { length: totalSlots - zona.totalSlots },
          (_, i) => ({
            zoneId: id,
            spotNumber: zona.totalSlots + i + 1,
            status: 'Available',
          })
        );
        await ParkingSpot.bulkCreate(nuevos);
      } else if (totalSlots < zona.totalSlots) {
        const delta = zona.totalSlots - totalSlots;
        const candidatos = await ParkingSpot.findAll({
          where: { zoneId: id, status: 'Available' },
          order: [['spotNumber', 'DESC']],
          limit: delta,
        });

        if (candidatos.length < delta) {
          return res.status(400).json({
            code: ErrorCodes.INSUFFICIENT_AVAILABLE_SPOTS,
            message: 'Cannot reduce capacity: some of the highest-numbered spots are currently occupied',
          });
        }

        await ParkingSpot.update(
          { status: 'Disabled' },
          { where: { id: candidatos.map((c) => c.id) } }
        );
      }

      updates.totalSlots = totalSlots;
    }

    await zona.update(updates);

    const disponibles = await ParkingSpot.count({ where: { zoneId: id, status: 'Available' } });
    await zona.update({ availableSlots: disponibles });

    return res.status(200).json({ message: 'Zone updated successfully', zone: zona });
  } catch (error) {
    next(error);
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
    const zonas = await Zona.findAll({ order: [['name', 'ASC']] });
    return res.status(200).json({ zones: zonas });
  } catch (error) {
    next(error);
  }
}

module.exports = { getZonas, getTodasLasZonas, createZona, updateZona, toggleZona, getSpotsDeZona, getZonaPorId };