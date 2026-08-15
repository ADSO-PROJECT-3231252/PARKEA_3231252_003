const { Pago, Reserva } = require('../models');
const { sequelize } = require('../models');
const ErrorCodes = require('../constants/errorCodes');

const DECLINED_TEST_CARD = '0002'; // simulated decline test card

// POST /api/payments/:reservationId
const crearPago = async (req, res) => {
  const { reservationId } = req.params;
  const { paymentMethod, cardLastFour } = req.body; // 'card' | 'pse', last 4 if card
  const usuarioId = req.usuario.id;

  if (!paymentMethod || !['card', 'pse'].includes(paymentMethod)) {
    return res.status(400).json({ code: ErrorCodes.INVALID_PAYMENT_METHOD, message: 'Invalid payment method' });
  }
  if (paymentMethod === 'card') {
    if (!cardLastFour || !/^\d{4}$/.test(cardLastFour)) {
      return res.status(400).json({ code: ErrorCodes.CARD_DIGITS_REQUIRED, message: 'The last 4 digits of the card are required' });
    }
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
    if (reserva.status === 'Expired') {
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

    const pagoExistente = await Pago.findOne({ where: { reservationId }, transaction: t });
    if (pagoExistente) {
      await t.rollback();
      return res.status(400).json({ code: ErrorCodes.PAYMENT_ALREADY_EXISTS, message: 'This reservation already has a payment on record' });
    }

    // Simulated decline: a reserved test card number always fails (HU-17, AC-11)
    const isDeclined = paymentMethod === 'card' && cardLastFour === DECLINED_TEST_CARD;

    if (isDeclined) {
      await t.rollback();
      return res.status(402).json({
        code: ErrorCodes.PAYMENT_DECLINED,
        message: 'Payment declined. Please try another payment method.',
      });
    }

    const horas = (new Date(reserva.endTime) - new Date(reserva.startTime)) / (1000 * 60 * 60);
    const amount = Number((horas * Number(reserva.appliedHourlyRate)).toFixed(2));

    const pago = await Pago.create({
      reservationId: reserva.id,
      amount,
      paymentStatus: 'Paid',
      paymentMethod,
      cardLastFour: paymentMethod === 'card' ? cardLastFour : null,
      paidAt: new Date(),
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

module.exports = { crearPago };