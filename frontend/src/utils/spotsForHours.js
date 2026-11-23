// #375: the line of the reserve screen that says whether there is room for
// the chosen hours (components/SpotsForHours.jsx)
import { translateError } from './errorMessages';
import { hoursErrorMessage } from './zoneHours';

// A sentence ends with a period, also the general texts of the errors
const withPeriod = (text) => (text.endsWith('.') ? text : `${text}.`);

// #375: what the line says for each answer of useSpotsForHours, and how it
// looks: { tone, text }
export function spotsForHoursMessage(spots, openEnded) {
    if (spots.state === 'waiting') {
        return { tone: 'waiting', text: 'Buscando cupos para ese horario…' };
    }
    if (spots.state === 'done') {
        if (spots.availableSlots > 0) {
            const count = spots.availableSlots === 1 ? 'Hay 1 cupo' : `Hay ${spots.availableSlots} cupos`;
            return { tone: 'room', text: `${count} para ese horario.` };
        }
        // An open stay needs its spot until the closing time or for 24
        // hours: a stay with an exit time may still find room
        return spots.openEnded
            ? { tone: 'full', text: 'No hay cupos para una estadía sin hora de salida desde esa entrada. Prueba con una hora de salida.' }
            : { tone: 'full', text: 'No hay cupos para ese horario. Prueba con otras horas.' };
    }
    if (spots.state === 'error') {
        // The hours of the zone may have changed since the page opened
        const hours = spots.code === 'OUTSIDE_ZONE_HOURS' || spots.code === 'ZONE_CLOSED_THAT_DAY'
            ? hoursErrorMessage(spots.code, spots.hours)
            : null;
        if (hours) return { tone: 'error', text: hours };
        if (spots.code) return { tone: 'error', text: withPeriod(translateError(spots.code)) };
        return { tone: 'error', text: 'No pudimos consultar los cupos para ese horario. Igual puedes intentar reservar.' };
    }
    return {
        tone: 'idle',
        text: openEnded
            ? 'Cuando la entrada sea válida, te diremos si hay cupos desde esa hora.'
            : 'Cuando la entrada y la salida sean válidas, te diremos si hay cupos para ese horario.',
    };
}
