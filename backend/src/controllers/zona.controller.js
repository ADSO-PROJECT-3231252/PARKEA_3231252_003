const { Zona, Reserva } = require('../models');

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
      return res.status(400).json({ message: 'name, totalSlots, and hourlyRate are required' });
    }
    if (totalSlots < 0 || hourlyRate < 0) {
      return res.status(400).json({ message: 'totalSlots and hourlyRate cannot be negative' });
    }

    const existente = await Zona.findOne({ where: { name } });
    if (existente) {
      return res.status(409).json({ message: 'A zone with this name already exists' });
    }

    const zona = await Zona.create({
      name,
      address,
      latitude,
      longitude,
      totalSlots,
      availableSlots: totalSlots, // starts full
      hourlyRate,
    });

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
      return res.status(404).json({ message: 'Zone not found' });
    }

    const { name, address, latitude, longitude, totalSlots, hourlyRate } = req.body;

    if (totalSlots != null && totalSlots < 0) {
      return res.status(400).json({ message: 'totalSlots cannot be negative' });
    }
    if (hourlyRate != null && hourlyRate < 0) {
      return res.status(400).json({ message: 'hourlyRate cannot be negative' });
    }

    const updates = { name, address, latitude, longitude, hourlyRate };

    if (totalSlots != null) {
      const ocupados = await Reserva.count({
        where: { zoneId: id, status: ['Pending', 'Active'] },
      });
      if (totalSlots < ocupados) {
        return res.status(400).json({
          message: `Cannot reduce capacity below ${ocupados} spots currently in use`,
        });
      }
      updates.totalSlots = totalSlots;
      updates.availableSlots = totalSlots - ocupados;
    }

    await zona.update(updates);

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
      return res.status(404).json({ message: 'Zone not found' });
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