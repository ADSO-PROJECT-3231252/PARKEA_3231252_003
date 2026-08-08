const { Usuario, Rol, Zona, Reserva, Pago, sequelize } = require('../models');
const { Op } = require('sequelize');

function getRangoFecha(range) {
  const ahora = new Date();
  const inicio = new Date(ahora);
  if (range === 'today') {
    inicio.setHours(0, 0, 0, 0);
  } else if (range === 'week') {
    inicio.setDate(inicio.getDate() - 7);
  } else {
    inicio.setMonth(inicio.getMonth() - 1);
  }
  return { inicio, fin: ahora };
}

// GET /api/admin/dashboard?range=today|week|month
async function getDashboard(req, res, next) {
  try {
    const range = req.query.range || 'today';
    const { inicio, fin } = getRangoFecha(range);

    const [activeReservations, activeZones, registeredUsers, revenueResult] = await Promise.all([
      Reserva.count({ where: { status: 'Active' } }),
      Zona.count({ where: { isActive: true } }),
      Usuario.count(),
      Pago.sum('amount', {
        where: { paymentStatus: 'Paid', paidAt: { [Op.between]: [inicio, fin] } },
      }),
    ]);

    return res.status(200).json({
      metrics: {
        activeReservations,
        revenue: revenueResult || 0,
        activeZones,
        registeredUsers,
      },
      range,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/dashboard/occupancy
async function getOcupacionPorZona(req, res, next) {
  try {
    const zonas = await Zona.findAll({
      where: { isActive: true },
      attributes: ['id', 'name', 'totalSlots', 'availableSlots'],
    });
    const ocupacion = zonas.map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      totalSlots: z.totalSlots,
      occupiedSlots: z.totalSlots - z.availableSlots,
    }));
    return res.status(200).json({ occupancy: ocupacion });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/dashboard/payments-status
async function getEstadoPagos(req, res, next) {
  try {
    const resultados = await Pago.findAll({
      attributes: ['paymentStatus', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      group: ['paymentStatus'],
    });
    const resumen = resultados.reduce((acc, r) => {
      acc[r.paymentStatus] = Number(r.get('count'));
      return acc;
    }, { Pending: 0, Paid: 0, Cancelled: 0, Refunded: 0 });

    return res.status(200).json({ paymentStatus: resumen });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/dashboard/recent-payments
async function getPagosRecientes(req, res, next) {
  try {
    const pagos = await Pago.findAll({
      order: [['created_at', 'DESC']],
      limit: 5,
      include: [{
        model: Reserva,
        as: 'reservation',
        include: [
          { model: Zona, as: 'zone', attributes: ['name'] },
          { model: Usuario, as: 'user', attributes: ['fullName'] },
        ],
      }],
    });
    return res.status(200).json({ recentPayments: pagos });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users
async function getUsuarios(req, res, next) {
  try {
    const { search, role, status } = req.query;
    const where = {};

    if (search) {
      where[Op.or] = [
        { fullName: { [Op.like]: `%${search}%` } },
        { email: { [Op.like]: `%${search}%` } },
        { documentNumber: { [Op.like]: `%${search}%` } },
      ];
    }
    if (status === 'active') where.isActive = true;
    if (status === 'inactive') where.isActive = false;

    const include = [{ model: Rol, as: 'role' }];
    if (role) {
      include[0].where = { name: role === 'admin' ? 'admin' : 'user' };
    }

    const usuarios = await Usuario.findAll({ where, include });

    const [total, activos, inactivos, admins] = await Promise.all([
      Usuario.count(),
      Usuario.count({ where: { isActive: true } }),
      Usuario.count({ where: { isActive: false } }),
      Usuario.count({ include: [{ model: Rol, as: 'role', where: { name: 'admin' } }] }),
    ]);

    return res.status(200).json({
      users: usuarios,
      summary: { total, active: activos, inactive: inactivos, admins },
    });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id/role
async function cambiarRol(req, res, next) {
  try {
    const { id } = req.params;
    const { role } = req.body; // 'admin' | 'user'
    const solicitanteId = req.usuario.id;

    if (id === solicitanteId) {
      return res.status(403).json({ message: 'You cannot change your own role' });
    }

    const usuario = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'role' }] });
    if (!usuario) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (usuario.isPrimaryAdmin) {
      return res.status(403).json({ message: 'The primary administrator role cannot be changed' });
    }

    // If demoting an admin, make sure at least one active admin remains
    if (usuario.role.name === 'admin' && role === 'user') {
      const admins = await Usuario.count({
        where: { isActive: true },
        include: [{ model: Rol, as: 'role', where: { name: 'admin' } }],
      });
      if (admins <= 1) {
        return res.status(400).json({ message: 'The system must always keep at least one active administrator' });
      }
    }

    const nuevoRol = await Rol.findOne({ where: { name: role } });
    if (!nuevoRol) {
      return res.status(400).json({ message: 'Invalid role' });
    }

    await usuario.update({ roleId: nuevoRol.id });
    return res.status(200).json({ message: 'Role updated successfully' });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id/status
async function cambiarEstado(req, res, next) {
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const solicitanteId = req.usuario.id;

    if (id === solicitanteId) {
      return res.status(403).json({ message: 'You cannot deactivate your own account' });
    }

    const usuario = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'role' }] });
    if (!usuario) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (usuario.isPrimaryAdmin) {
      return res.status(403).json({ message: 'The primary administrator cannot be deactivated' });
    }

    if (usuario.role.name === 'admin' && isActive === false) {
      const admins = await Usuario.count({
        where: { isActive: true },
        include: [{ model: Rol, as: 'role', where: { name: 'admin' } }],
      });
      if (admins <= 1) {
        return res.status(400).json({ message: 'The system must always keep at least one active administrator' });
      }
    }

    await usuario.update({ isActive });
    return res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  getDashboard,
  getOcupacionPorZona,
  getEstadoPagos,
  getPagosRecientes,
  getUsuarios,
  cambiarRol,
  cambiarEstado,
};