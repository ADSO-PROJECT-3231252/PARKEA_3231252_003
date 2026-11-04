const { Pago, Reserva } = require('../models');
const { sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

const DECLINED_TEST_CARD = '0002'; // simulated decline test card

// Checks the payment method and, for a card, its last 4 digits. Returns the
// error to answer, or null when they are valid (HU-17, also used to pay the
// balance of an open stay, HU-27).
function validarMetodoPago({ paymentMethod, cardLastFour }) {
  if (!paymentMethod || !['card', 'pse'].includes(paymentMethod)) {
    return { status: 400, body: { code: ErrorCodes.INVALID_PAYMENT_METHOD, message: 'Invalid payment method' } };
  }
  if (paymentMethod === 'card') {
    // Only text: a list or a number would pass the regular expression below
    if (typeof cardLastFour !== 'string' || !/^\d{4}$/.test(cardLastFour)) {
      return { status: 400, body: { code: ErrorCodes.CARD_DIGITS_REQUIRED, message: 'The last 4 digits of the card are required' } };
    }
  }
  return null;
}

// Simulated decline: a reserved test card number always fails (HU-17, AC-11)
const esRechazado = ({ paymentMethod, cardLastFour }) => paymentMethod === 'card' && cardLastFour === DECLINED_TEST_CARD;

const RECHAZADO = {
  code: ErrorCodes.PAYMENT_DECLINED,
  message: 'Payment declined. Please try another payment method.',
};

// POST /api/payments/:reservationId
const crearPago = async (req, res) => {
  const { reservationId } = req.params;
  const { paymentMethod, cardLastFour } = req.body; // 'card' | 'pse', last 4 if card
  const usuarioId = req.usuario.id;

  const errorMetodo = validarMetodoPago(req.body);
  if (errorMetodo) {
    return res.status(errorMetodo.status).json(errorMetodo.body);
  }

  const t = await sequelize.transaction();
  try {
    const reserva = await Reserva.findByPk(reservationId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reserva) {
      await t.rollback();
      return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
    }
    if (reserva.userId !== usuarioId) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.RESERVATION_NOT_OWNED, message: 'This reservation does not belong to you' });
    }
    // The expiration job only runs every 60 s, so a reservation can still say
    // Pending for up to a minute after its hold deadline. The deadline itself is
    // what decides whether it can still be paid (HU-26, AC-06).
    const holdVencido = reserva.status === 'Pending'
      && reserva.holdExpiresAt
      && new Date(reserva.holdExpiresAt) <= new Date();
    if (reserva.status === 'Expired' || holdVencido) {
      await t.rollback();
      return res.status(400).json({
        code: ErrorCodes.RESERVATION_EXPIRED,
        message: 'This reservation expired because it was not paid in time. Please make a new reservation.',
      });
    }
    if (reserva.status !== 'Pending') {
      await t.rollback();
      return res.status(400).json({ code: ErrorCodes.RESERVATION_NOT_PENDING, message: 'This reservation is not pending payment' });
    }

    // Only the initial payment is unique: a balance or an extension may come later
    const pagoExistente = await Pago.findOne({ where: { reservationId, type: 'initial' }, transaction: t });
    if (pagoExistente) {
      await t.rollback();
      return res.status(400).json({ code: ErrorCodes.PAYMENT_ALREADY_EXISTS, message: 'This reservation already has a payment on record' });
    }

    if (esRechazado(req.body)) {
      await t.rollback();
      return res.status(402).json(RECHAZADO);
    }

    // HU-27 AC-03: an open stay is confirmed by paying its first hour
    const horas = reserva.openEnded
      ? 1
      : (new Date(reserva.endTime) - new Date(reserva.startTime)) / (1000 * 60 * 60);
    const amount = Number((horas * Number(reserva.appliedHourlyRate)).toFixed(2));

    const pago = await Pago.create({
      reservationId: reserva.id,
      amount,
      paymentStatus: 'Paid',
      paymentMethod,
      cardLastFour: paymentMethod === 'card' ? cardLastFour : null,
      paidAt: new Date(),
      type: 'initial',
    }, { transaction: t });

    reserva.status = 'Active';
    reserva.holdExpiresAt = null;
    await reserva.save({ transaction: t });

    await t.commit();

    return res.status(201).json({ message: 'Payment approved', payment: pago });
  } catch (error) {
    await t.rollback();
    console.error('Error creating payment:', error);
    return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error processing the payment' });
  }
};

// POST /api/payments/:reservationId/balance — pay what an open stay still owes (HU-27, AC-07, AC-11)
const pagarSaldo = async (req, res) => {
  const { reservationId } = req.params;
  const { paymentMethod, cardLastFour } = req.body;
  const usuarioId = req.usuario.id;

  const errorMetodo = validarMetodoPago(req.body);
  if (errorMetodo) {
    return res.status(errorMetodo.status).json(errorMetodo.body);
  }

  const t = await sequelize.transaction();
  try {
    // Locked so that two payments of the same balance at the same time
    // cannot both be approved
    const reserva = await Reserva.findByPk(reservationId, { transaction: t, lock: t.LOCK.UPDATE });
    if (!reserva) {
      await t.rollback();
      return res.status(404).json({ code: ErrorCodes.RESERVATION_NOT_FOUND, message: 'Reservation not found' });
    }
    if (reserva.userId !== usuarioId) {
      await t.rollback();
      return res.status(403).json({ code: ErrorCodes.RESERVATION_NOT_OWNED, message: 'This reservation does not belong to you' });
    }

    const saldo = await Pago.findOne({
      where: { reservationId, type: 'balance', paymentStatus: 'Pending' },
      transaction: t,
    });
    if (!saldo) {
      await t.rollback();
      return res.status(400).json({ code: ErrorCodes.NO_PENDING_BALANCE, message: 'This reservation has no pending balance' });
    }

    if (esRechazado(req.body)) {
      await t.rollback();
      return res.status(402).json(RECHAZADO);
    }

    await saldo.update({
      paymentStatus: 'Paid',
      paymentMethod,
      cardLastFour: paymentMethod === 'card' ? cardLastFour : null,
      paidAt: new Date(),
    }, { transaction: t });

    await t.commit();

    return res.status(200).json({ message: 'Balance paid', payment: saldo });
  } catch (error) {
    await t.rollback();
    console.error('Error paying the balance:', error);
    return res.status(500).json({ code: ErrorCodes.INTERNAL_ERROR, message: 'Internal error processing the payment' });
  }
};

module.exports = { crearPago, pagarSaldo };
