const { Op } = require('sequelize');
const { sequelize, Reserva } = require('../models');
const { safeRollback } = require('../utils/transaction');

const INTERVALO_MS = 60 * 1000; // corre cada minuto

async function expirarReservasVencidas() {
    const ahora = new Date();

    const vencidas = await Reserva.findAll({
        where: {
            status: 'Pending',
            holdExpiresAt: { [Op.lt]: ahora },
        },
    });

    for (const reserva of vencidas) {
        const t = await sequelize.transaction();
        try {
            // Read it again with a lock, in case another run already processed it in the meantime
            const reservaActual = await Reserva.findOne({
                where: { id: reserva.id, status: 'Pending' },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!reservaActual) {
                await t.rollback();
                continue;
            }

            // #373: the reservation stopped holding its spot when its 15
            // minutes ended (#347), so marking it Expired is the only change:
            // no spot or counter of the zone is changed
            await reservaActual.update({ status: 'Expired' }, { transaction: t });

            await t.commit();
            console.log(`[expirar-reservas] Reservation ${reservaActual.id} expired`);
        } catch (error) {
            await safeRollback(t);
            console.error(`[expirar-reservas] Error processing reservation ${reserva.id}:`, error);
        }
    }
}

function iniciarJobExpiracion() {
    console.log('[expirar-reservas] Expiration job started (runs every 60s)');
    // If the database stops answering, the error is logged and the next run
    // tries again; without the catch, Node stops the whole API
    setInterval(() => {
        expirarReservasVencidas().catch((error) => {
            console.error('[expirar-reservas] Error reading reservations:', error.message);
        });
    }, INTERVALO_MS);
}

module.exports = { iniciarJobExpiracion, expirarReservasVencidas };
