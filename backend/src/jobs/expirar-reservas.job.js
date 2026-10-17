const { Op } = require('sequelize');
const { sequelize, Reserva, Zona, ParkingSpot } = require('../models');

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
            // Vuelve a leer con lock, por si otro ciclo ya la procesó mientras tanto
            const reservaActual = await Reserva.findOne({
                where: { id: reserva.id, status: 'Pending' },
                transaction: t,
                lock: t.LOCK.UPDATE,
            });

            if (!reservaActual) {
                await t.rollback();
                continue;
            }

            // Release the physical spot, not just the zone counter
            if (reservaActual.parkingSpotId) {
                const cupo = await ParkingSpot.findByPk(reservaActual.parkingSpotId, {
                    transaction: t,
                    lock: t.LOCK.UPDATE,
                });
                if (cupo && cupo.status === 'Occupied') {
                    await cupo.update({ status: 'Available' }, { transaction: t });
                }
            }

            await reservaActual.update({ status: 'Expired' }, { transaction: t });

            const zona = await Zona.findByPk(reservaActual.zoneId, {
                transaction: t,
                lock: t.LOCK.UPDATE,
            });
            await zona.increment('availableSlots', { by: 1, transaction: t });

            await t.commit();
            console.log(`[expirar-reservas] Reserva ${reservaActual.id} expirada, cupo liberado en "${zona.name}"`);
        } catch (error) {
            await t.rollback();
            console.error(`[expirar-reservas] Error procesando reserva ${reserva.id}:`, error);
        }
    }
}

function iniciarJobExpiracion() {
    console.log('[expirar-reservas] Job de expiración iniciado (revisa cada 60s)');
    setInterval(expirarReservasVencidas, INTERVALO_MS);
}

module.exports = { iniciarJobExpiracion, expirarReservasVencidas };