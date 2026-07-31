const { Zona } = require('../models');

// GET /api/zones — public, list all zones
async function getZonas(req, res, next) {
  try {
    const zonas = await Zona.findAll();
    return res.status(200).json({ zones: zonas });
  } catch (error) {
    next(error);
  }
}

// POST /api/zones — admin only
async function createZona(req, res, next) {
  try {
    const { name, address, totalSlots, hourlyRate } = req.body;

    if (!name || totalSlots == null || hourlyRate == null) {
      return res.status(400).json({ message: 'name, totalSlots, and hourlyRate are required' });
    }
    if (totalSlots < 0 || hourlyRate < 0) {
      return res.status(400).json({ message: 'totalSlots and hourlyRate cannot be negative' });
    }

    const zona = await Zona.create({
      name,
      address,
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

    const { name, address, totalSlots, availableSlots, hourlyRate } = req.body;

    if (availableSlots != null && availableSlots < 0) {
      return res.status(400).json({ message: 'availableSlots cannot be negative' });
    }
    if (totalSlots != null && totalSlots < 0) {
      return res.status(400).json({ message: 'totalSlots cannot be negative' });
    }
    if (hourlyRate != null && hourlyRate < 0) {
      return res.status(400).json({ message: 'hourlyRate cannot be negative' });
    }

    await zona.update({ name, address, totalSlots, availableSlots, hourlyRate });

    return res.status(200).json({ message: 'Zone updated successfully', zone: zona });
  } catch (error) {
    next(error);
  }
}

// DELETE /api/zones/:id — admin only
async function deleteZona(req, res, next) {
  try {
    const { id } = req.params;
    const zona = await Zona.findByPk(id);
    if (!zona) {
      return res.status(404).json({ message: 'Zone not found' });
    }

    await zona.destroy();

    return res.status(200).json({ message: 'Zone deleted successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = { getZonas, createZona, updateZona, deleteZona };