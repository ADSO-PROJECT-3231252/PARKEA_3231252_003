// What an account still has open: the reservations that hold a spot and the
// balance of an open stay that ended without paying it. Creating a
// reservation (HU-27 AC-12) and changing the role or the status of an
// account (#348) ask the same questions.
const { Op } = require('sequelize');
const { Reserva, Pago } = require('../models');
const availability = require('./availability');

// HU-27 AC-12: the balance (type 'balance') of an open stay of the account
// that is still waiting for its payment
function pendingBalance(userId, { transaction } = {}) {
    return Pago.findOne({
        where: { type: 'balance', paymentStatus: 'Pending' },
        include: [{ model: Reserva, as: 'reservation', where: { userId }, attributes: [] }],
        transaction,
    });
}

// #348: the account has a reservation that is Active, or Pending with its 15
// minutes to pay still running (a Pending one whose 15 minutes ended counts
// as expired, #347, with the same rule as the spots), or a balance to pay.
async function hasOpenReservationsOrBalance(userId, { transaction, now = new Date() } = {}) {
    const abiertas = await Reserva.count({
        where: { userId, [Op.and]: [availability.holdsItsSpot(now)] },
        transaction,
    });
    if (abiertas > 0) return true;
    return Boolean(await pendingBalance(userId, { transaction }));
}

module.exports = { pendingBalance, hasOpenReservationsOrBalance };
