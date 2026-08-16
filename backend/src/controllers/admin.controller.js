const { Usuario, Rol, Zona, Reserva, Pago, AdminActionLog, sequelize } = require('../models');
const { Op } = require('sequelize');
const ErrorCodes = require('../constants/errorCodes');

const RANGOS_VALIDOS = ['today', 'week', 'month'];

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
    if (!RANGOS_VALIDOS.includes(range)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_RANGE, message: 'range must be one of: today, week, month' });
    }
    const { inicio, fin } = getRangoFecha(range);

    const [activeReservations, activeZones, newUsers, revenueResult] = await Promise.all([
      // Reservations that were Active at some point overlapping the selected range
      Reserva.count({
        where: {
          status: 'Active',
          startTime: { [Op.lte]: fin },
          endTime: { [Op.gte]: inicio },
        },
      }),
      // Active zones is a current-state snapshot: the system doesn't keep a
      // history of when a zone was activated/deactivated, so this can't be
      // meaningfully scoped to the selected range
      Zona.count({ where: { isActive: true } }),
      // New registrations within the selected range
      Usuario.count({ where: { created_at: { [Op.between]: [inicio, fin] } } }),
      Pago.sum('amount', {
        where: { paymentStatus: 'Paid', paidAt: { [Op.between]: [inicio, fin] } },
      }),
    ]);

    return res.status(200).json({
      metrics: {
        activeReservations,
        revenue: revenueResult || 0,
        activeZones,
        newUsers,
      },
      range,
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/dashboard/reservations-by-zone?range=today|week|month
async function getReservasPorZona(req, res, next) {
  try {
    const range = req.query.range || 'today';
    if (!RANGOS_VALIDOS.includes(range)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_RANGE, message: 'range must be one of: today, week, month' });
    }
    const { inicio, fin } = getRangoFecha(range);

    const zonas = await Zona.findAll({
      where: { isActive: true },
      attributes: [
        'id',
        'name',
        [
          sequelize.fn('COUNT', sequelize.col('reservations.id')),
          'reservationCount',
        ],
      ],
      include: [{
        model: Reserva,
        as: 'reservations',
        attributes: [],
        required: false,
        where: { startTime: { [Op.between]: [inicio, fin] } },
      }],
      group: ['Zona.id'],
    });

    const result = zonas.map((z) => ({
      zoneId: z.id,
      zoneName: z.name,
      reservationCount: Number(z.get('reservationCount')),
    }));

    return res.status(200).json({ reservationsByZone: result, range });
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

// GET /api/admin/dashboard/payments-status?range=today|week|month
async function getEstadoPagos(req, res, next) {
  try {
    const range = req.query.range || 'today';
    if (!RANGOS_VALIDOS.includes(range)) {
      return res.status(400).json({ code: ErrorCodes.INVALID_RANGE, message: 'range must be one of: today, week, month' });
    }
    const { inicio, fin } = getRangoFecha(range);

    const resultados = await Pago.findAll({
      attributes: ['paymentStatus', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
      where: { created_at: { [Op.between]: [inicio, fin] } },
      group: ['paymentStatus'],
    });
    const resumen = resultados.reduce((acc, r) => {
      acc[r.paymentStatus] = Number(r.get('count'));
      return acc;
    }, { Pending: 0, Paid: 0, Cancelled: 0, Refunded: 0 });

    return res.status(200).json({ paymentStatus: resumen, range });
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

// GET /api/admin/dashboard/alerts
async function getAlertas(req, res, next) {
  try {
    const zonasLlenas = await Zona.findAll({
      where: { isActive: true, availableSlots: 0 },
      attributes: ['id', 'name'],
    });

    const alerts = zonasLlenas.map((z) => ({
      type: 'zone_full',
      severity: 'warning',
      message: `Zone "${z.name}" has reached full capacity`,
      zoneId: z.id,
    }));

    return res.status(200).json({ alerts });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users?search=&role=&status=&page=&limit=
async function getUsuarios(req, res, next) {
  try {
    const { search, role, status } = req.query;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.max(parseInt(req.query.limit, 10) || 10, 1);
    const offset = (page - 1) * limit;

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

    const { count, rows } = await Usuario.findAndCountAll({
      where,
      include,
      // Never expose the password hash in this list
      attributes: { exclude: ['password'] },
      limit,
      offset,
      order: [['created_at', 'DESC']],
    });

    // Reservation count per listed user (AC-03)
    const userIds = rows.map((u) => u.id);
    const conteos = userIds.length
      ? await Reserva.findAll({
          attributes: ['userId', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
          where: { userId: userIds },
          group: ['userId'],
        })
      : [];
    const conteoPorUsuario = conteos.reduce((acc, r) => {
      acc[r.userId] = Number(r.get('count'));
      return acc;
    }, {});

    const users = rows.map((u) => ({
      id: u.id,
      fullName: u.fullName,
      email: u.email,
      documentNumber: u.documentNumber,
      role: u.role.name,
      isActive: u.isActive,
      isPrimaryAdmin: u.isPrimaryAdmin,
      createdAt: u.created_at,
      reservationCount: conteoPorUsuario[u.id] || 0,
    }));

    const [total, activos, inactivos, admins] = await Promise.all([
      Usuario.count(),
      Usuario.count({ where: { isActive: true } }),
      Usuario.count({ where: { isActive: false } }),
      Usuario.count({ include: [{ model: Rol, as: 'role', where: { name: 'admin' } }] }),
    ]);

    return res.status(200).json({
      users,
      summary: { total, active: activos, inactive: inactivos, admins },
      pagination: { page, limit, total: count, totalPages: Math.ceil(count / limit) },
    });
  } catch (error) {
    next(error);
  }
}

// GET /api/admin/users/logs — most recent admin actions (AC-14)
async function getRegistroDeCambios(req, res, next) {
  try {
    const logs = await AdminActionLog.findAll({
      order: [['created_at', 'DESC']],
      limit: 10,
      include: [
        { model: Usuario, as: 'admin', attributes: ['fullName'] },
        { model: Usuario, as: 'targetUser', attributes: ['fullName'] },
      ],
    });
    return res.status(200).json({ logs });
  } catch (error) {
    next(error);
  }
}

// PATCH /api/admin/users/:id/role
async function cambiarRol(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { role } = req.body; // 'admin' | 'user'
    const solicitanteId = req.usuario.id;

    if (id === solicitanteId) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.CANNOT_MODIFY_SELF, message: 'You cannot change your own role' });
    }

    const usuario = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'role' }], transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
    }
    if (usuario.isPrimaryAdmin) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.PRIMARY_ADMIN_PROTECTED, message: 'The primary administrator role cannot be changed' });
    }

    const rolAnterior = usuario.role.name;

    if (usuario.role.name === 'admin' && role === 'user') {
      const admins = await Usuario.count({
        where: { isActive: true },
        include: [{ model: Rol, as: 'role', where: { name: 'admin' } }],
        transaction: t,
      });
      if (admins <= 1) {
        await t.rollback();
        return res.status(400).json({ code: ErrorCodes.MIN_ONE_ADMIN_REQUIRED, message: 'The system must always keep at least one active administrator' });
      }
    }

    const nuevoRol = await Rol.findOne({ where: { name: role }, transaction: t });
    if (!nuevoRol) {
      await t.rollback();
      return res.status(400).json({ code: ErrorCodes.INVALID_ROLE, message: 'Invalid role' });
    }

    await usuario.update({ roleId: nuevoRol.id }, { transaction: t });

    await AdminActionLog.create({
      adminId: solicitanteId,
      targetUserId: id,
      action: 'role_changed',
      details: `Role changed from "${rolAnterior}" to "${role}"`,
    }, { transaction: t });

    await t.commit();

    return res.status(200).json({ message: 'Role updated successfully' });
  } catch (error) {
    await t.rollback();
    next(error);
  }
}

// PATCH /api/admin/users/:id/status
async function cambiarEstado(req, res, next) {
  const t = await sequelize.transaction();
  try {
    const { id } = req.params;
    const { isActive } = req.body;
    const solicitanteId = req.usuario.id;

    if (id === solicitanteId) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.CANNOT_MODIFY_SELF, message: 'You cannot deactivate your own account' });
    }

    const usuario = await Usuario.findByPk(id, { include: [{ model: Rol, as: 'role' }], transaction: t });
    if (!usuario) {
      await t.rollback();
      return res.status(404).json({ code: ErrorCodes.USER_NOT_FOUND, message: 'User not found' });
    }
    if (usuario.isPrimaryAdmin) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.PRIMARY_ADMIN_PROTECTED, message: 'The primary administrator cannot be deactivated' });
    }

    if (usuario.role.name === 'admin' && isActive === false) {
      const admins = await Usuario.count({
        where: { isActive: true },
        include: [{ model: Rol, as: 'role', where: { name: 'admin' } }],
        transaction: t,
      });
      if (admins <= 1) {
        await t.rollback();
        return res.status(400).json({ code: ErrorCodes.MIN_ONE_ADMIN_REQUIRED, message: 'The system must always keep at least one active administrator' });
      }
    }

    await usuario.update({ isActive }, { transaction: t });

    await AdminActionLog.create({
      adminId: solicitanteId,
      targetUserId: id,
      action: 'status_changed',
      details: `Status changed to ${isActive ? 'active' : 'inactive'}`,
    }, { transaction: t });

    await t.commit();

    return res.status(200).json({ message: 'Status updated successfully' });
  } catch (error) {
    await t.rollback();
    next(error);
  }
}

module.exports = {
  getDashboard,
  getReservasPorZona,
  getOcupacionPorZona,
  getEstadoPagos,
  getPagosRecientes,
  getAlertas,
  getUsuarios,
  getRegistroDeCambios,
  cambiarRol,
  cambiarEstado,
};