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

// POST /api/zones — admin only
async function createZona(req, res, next) {
  try {
    const { name, address, latitude, longitude, totalSlots, hourlyRate } = req.body;

    if (!name || totalSlots == null || hourlyRate == null) {
      return res.status(400).json({ code: ErrorCodes.MISSING_REQUIRED_FIELDS, message: 'name, totalSlots, and hourlyRate are required' });
    }
    if (totalSlots < 0 || hourlyRate < 0) {
      return res.status(400).json({ code: ErrorCodes.NEGATIVE_VALUE, message: 'totalSlots and hourlyRate cannot be negative' });
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

    // Create one physical spot per slot, numbered 1..totalSlots
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

    if (totalSlots != null && totalSlots < 0) {
      return res.status(400).json({ code: ErrorCodes.NEGATIVE_VALUE, message: 'totalSlots cannot be negative' });
    }
    if (hourlyRate != null && hourlyRate < 0) {
      return res.status(400).json({ code: ErrorCodes.NEGATIVE_VALUE, message: 'hourlyRate cannot be negative' });
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
        // Grow: add the missing physical spots, numbered after the highest existing one
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
        // Shrink: disable the highest-numbered spots that are currently Available.
        // Occupied spots can never be disabled, that's already guaranteed by the
        // "ocupados" check above, but we still only pick from Available spots here
        // as a second layer of protection.
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

    // Recompute availableSlots directly from the physical spots, so it's always
    // the source of truth instead of a manually maintained counter
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

module.exports = { getZonas, createZona, updateZona, toggleZona };