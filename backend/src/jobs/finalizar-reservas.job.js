const { Op } = require('sequelize');
const { sequelize, Reserva, Zona, ParkingSpot } = require('../models');

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

            // Release the physical spot — this is the whole point of this job:
            // without it, a finished (but never re-checked) reservation would
            // keep its spot Occupied forever
            if (reservaActual.parkingSpotId) {
                const cupo = await ParkingSpot.findByPk(reservaActual.parkingSpotId, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });
                if (cupo && cupo.status === 'Occupied') {
                    await cupo.update({ status: 'Available' }, { transaction: t });
                }
            }

            await reservaActual.update({ status: 'Finished' }, { transaction: t });

            const zona = await Zona.findByPk(reservaActual.zoneId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            await zona.increment('availableSlots', { by: 1, transaction: t });

            await t.commit();
            console.log(`[finalizar-reservas] Reserva ${reservaActual.id} finalizada, cupo liberado en "${zona.name}"`);
        } catch (error) {
            await t.rollback();
            console.error(`[finalizar-reservas] Error procesando reserva ${reserva.id}:`, error);
        }
    }
}

function iniciarJobFinalizacion() {
    console.log('[finalizar-reservas] Job de finalización iniciado (revisa cada 60s)');
    setInterval(finalizarReservasVencidas, INTERVALO_MS);
}

module.exports = { iniciarJobFinalizacion, finalizarReservasVencidas };