const { Op } = require('sequelize');
const { sequelize, Reserva, Pago } = require('../models');
const { openStayCharge, paidBeforeBalance } = require('../utils/stayPricing');
const { safeRollback } = require('../utils/transaction');

const INTERVALO_MS = 60 * 1000; // runs every minute, just like the expiration job

async function finalizarReservasVencidas() {
    const ahora = new Date();

    const vencidas = await Reserva.findAll({
        where: {
            status: 'Active',
            endTime: { [Op.lt]: ahora },
        },
    });

    for (const reserva of vencidas) {
        const t = await sequelize.transaction();
        try {
            // Read it again using lock, in case another thread has already processed it in the meantime
            const reservaActual = await Reserva.findOne({
                where: { id: reserva.id, status: 'Active' },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!reservaActual) {
                await t.rollback();
                continue;
            }

            // #373: the spot is free from the exit time whether this job ran
            // or not, so no spot or counter of the zone is changed: the job
            // marks the reservation Finished and charges an open stay
            await reservaActual.update({ status: 'Finished' }, { transaction: t });

            // HU-27 AC-10: an open stay not finished in time closes here. Its
            // exit time is already entry + 24 h, or the closing time of its
            // zone (HU-29 AC-04); the hours up to it are charged and what was
            // not paid yet stays as a pending balance. What it paid before is
            // the first hour, or more if it was extended before switching to
            // an open stay (HU-28).
            if (reservaActual.openEnded) {
                const pagos = await Pago.findAll({ where: { reservationId: reservaActual.id }, transaction: t });
                const cobro = openStayCharge(reservaActual, reservaActual.endTime, paidBeforeBalance(reservaActual, pagos));
                if (cobro.balance > 0) {
                    await Pago.create({
                        reservationId: reservaActual.id,
                        amount: cobro.balance,
                        paymentStatus: 'Pending',
                        type: 'balance',
                    }, { transaction: t });
                }
            }

            await t.commit();
            console.log(`[finalizar-reservas] Reserva ${reservaActual.id} finalizada`);
        } catch (error) {
            await safeRollback(t);
            console.error(`[finalizar-reservas] Error procesando reserva ${reserva.id}:`, error);
        }
    }
}

function iniciarJobFinalizacion() {
    console.log('[finalizar-reservas] Job de finalización iniciado (revisa cada 60s)');
    // If the database stops answering, the error is logged and the next run
    // tries again; without the catch, Node stops the whole API
    setInterval(() => {
        finalizarReservasVencidas().catch((error) => {
            console.error('[finalizar-reservas] Error reading reservations:', error.message);
        });
    }, INTERVALO_MS);
}

module.exports = { iniciarJobFinalizacion, finalizarReservasVencidas };
