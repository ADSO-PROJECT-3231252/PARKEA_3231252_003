import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { finishStay } from '../services/reservationService';
import { translateError } from '../utils/errorMessages';
import { formatCurrency, keepTogether } from '../utils/format';
import { formatMinutes, hoursLabel, openStayCharge, paidBeforeEnd, paidOnlyFirstHour } from '../utils/openStay';

// Codes that mean the screen behind the dialog is out of date (the stay
// already ended, was never started or no longer exists).
const STALE_CODES = ['STAY_NOT_ACTIVE', 'STAY_NOT_STARTED', 'NOT_AN_OPEN_STAY', 'RESERVATION_NOT_FOUND'];

// An amount inside a sentence: "$" and the number stay on the same line.
const money = (amount) => keepTogether(formatCurrency(amount));

// HU-28: a reservation switched to an open stay may have paid more (or less)
// than the first hour, so the text names what was really paid.
function chargeMessage(charge, rate, zoneName) {
    const used = `Llevas ${formatMinutes(charge.usedMinutes)} en ${zoneName}.`;
    const firstHourOnly = paidOnlyFirstHour(charge.paid, rate);
    if (charge.balance <= 0) {
        return firstHourOnly
            ? `${used} Solo se cobra la primera hora, que ya pagaste, así que no queda nada por pagar. Tu cupo quedará libre.`
            : `${used} Ya pagaste ${money(charge.paid)}, que alcanza para ese tiempo, así que no queda nada por pagar. Tu cupo quedará libre.`;
    }
    return (
        `${used} Se cobran ${hoursLabel(charge.chargedHours)} (${money(charge.total)}). ` +
        `Ya pagaste ${firstHourOnly ? `la primera hora (${money(rate)})` : money(charge.paid)}, así que quedan ` +
        `${money(charge.balance)} por pagar. Tu cupo quedará libre.`
    );
}

// What was charged, after the stay ended. When what was already paid
// covered more than the hours used, it says so instead of showing an amount
// that does not match the hours.
function resultMessage(result, rate, zoneName) {
    const used = `Estadía terminada en ${zoneName}. Usaste ${formatMinutes(result.usedMinutes)}`;
    const byHours = Math.round(result.chargedHours * Number(rate) * 100) / 100;
    if (result.balance <= 0 && result.total - byHours > 0.005) {
        return `${used}, que ya estaban cubiertos por lo que pagaste (${money(result.total)}). No tienes saldo pendiente.`;
    }
    return (
        `${used}; se ${result.chargedHours === 1 ? 'cobró' : 'cobraron'} ` +
        `${hoursLabel(result.chargedHours)} (${money(result.total)}). ` +
        (result.balance > 0
            ? `Tienes un saldo pendiente de ${money(result.balance)}.`
            : 'No tienes saldo pendiente.')
    );
}

// HU-27 AC-05/AC-06: confirms the end of an open stay, showing what will be
// charged. Rendered only while open, so its state starts fresh every time.
// openedAt: the moment the user clicked "Terminar estadía" (the amount shown
// is the one for that moment, and the one the backend is asked to charge).
// onClose({ stale }): the user kept the stay; stale = reload the screen.
// onFinished(message): ended; message is the result to show on the screen.
export default function FinishStayDialog({ reservation, hourlyRate, openedAt, onClose, onFinished }) {
    const [charge, setCharge] = useState(() =>
        openStayCharge(reservation.startTime, hourlyRate, openedAt, paidBeforeEnd(reservation, hourlyRate))
    );
    const [finishing, setFinishing] = useState(false);
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);

    const zoneName = reservation.zone?.name ?? 'la zona';

    const handleClose = () => {
        if (finishing) return;
        onClose({ stale });
    };

    const handleConfirm = () => {
        setFinishing(true);
        setError('');
        finishStay(reservation.id, charge.chargedHours)
            .then(({ data }) => onFinished(resultMessage(data.charge, hourlyRate, zoneName)))
            .catch((err) => {
                const code = err.response?.data?.code;
                // AC-06: another hour started while the dialog was open. Nothing
                // was charged; the new amount is shown so it can be confirmed
                // again (what was paid stays the same).
                if (code === 'STAY_AMOUNT_CHANGED' && err.response.data.charge) {
                    setCharge((current) => ({ ...current, ...err.response.data.charge }));
                }
                setError(translateError(code));
                if (STALE_CODES.includes(code)) setStale(true);
            })
            .finally(() => setFinishing(false));
    };

    return (
        <ConfirmDialog
            open
            title="Terminar estadía"
            message={chargeMessage(charge, hourlyRate, zoneName)}
            confirmLabel="Terminar estadía"
            cancelLabel="Seguir en mi cupo"
            confirming={finishing}
            error={error}
            onConfirm={handleConfirm}
            onCancel={handleClose}
        />
    );
}
