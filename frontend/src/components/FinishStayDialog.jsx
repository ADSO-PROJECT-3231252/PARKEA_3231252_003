import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { finishStay } from '../services/reservationService';
import { translateError } from '../utils/errorMessages';
import { formatCurrency } from '../utils/format';
import { formatMinutes, hoursLabel, openStayCharge } from '../utils/openStay';

// Codes that mean the screen behind the dialog is out of date (the stay
// already ended, was never started or no longer exists).
const STALE_CODES = ['STAY_NOT_ACTIVE', 'STAY_NOT_STARTED', 'NOT_AN_OPEN_STAY', 'RESERVATION_NOT_FOUND'];

function chargeMessage(charge, rate, zoneName) {
    const used = `Llevas ${formatMinutes(charge.usedMinutes)} en ${zoneName}.`;
    if (charge.balance <= 0) {
        return `${used} Solo se cobra la primera hora, que ya pagaste, así que no queda nada por pagar. Tu cupo quedará libre.`;
    }
    return (
        `${used} Se cobran ${hoursLabel(charge.chargedHours)} (${formatCurrency(charge.total)}). ` +
        `Ya pagaste la primera hora (${formatCurrency(rate)}), así que quedan ` +
        `${formatCurrency(charge.balance)} por pagar. Tu cupo quedará libre.`
    );
}

// HU-27 AC-05/AC-06: confirms the end of an open stay, showing what will be
// charged. Rendered only while open, so its state starts fresh every time.
// openedAt: the moment the user clicked "Terminar estadía" (the amount shown
// is the one for that moment, and the one the backend is asked to charge).
// onClose({ stale }): the user kept the stay; stale = reload the screen.
// onFinished(message): ended; message is the result to show on the screen.
export default function FinishStayDialog({ reservation, hourlyRate, openedAt, onClose, onFinished }) {
    const [charge, setCharge] = useState(() => openStayCharge(reservation.startTime, hourlyRate, openedAt));
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
            .then(({ data }) => {
                const result = data.charge;
                onFinished(
                    `Estadía terminada en ${zoneName}. Usaste ${formatMinutes(result.usedMinutes)}; se cobraron ` +
                        `${hoursLabel(result.chargedHours)} (${formatCurrency(result.total)}). ` +
                        (result.balance > 0
                            ? `Tienes un saldo pendiente de ${formatCurrency(result.balance)}.`
                            : 'No tienes saldo pendiente.')
                );
            })
            .catch((err) => {
                const code = err.response?.data?.code;
                // AC-06: another hour started while the dialog was open. Nothing
                // was charged; the new amount is shown so it can be confirmed again.
                if (code === 'STAY_AMOUNT_CHANGED' && err.response.data.charge) {
                    setCharge(err.response.data.charge);
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
