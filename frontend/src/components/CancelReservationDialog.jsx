import { useState } from 'react';
import ConfirmDialog from './ConfirmDialog';
import { cancelReservation } from '../services/reservationService';
import { translateError } from '../utils/errorMessages';
import { formatDate, formatReservationCode, formatTime } from '../utils/format';

// Codes that mean the screen behind the dialog is out of date (the reservation
// started, changed status or no longer exists), so it should be loaded again.
const STALE_CODES = ['RESERVATION_ALREADY_STARTED', 'RESERVATION_NOT_CANCELLABLE', 'RESERVATION_NOT_FOUND'];

// "10 jun 2026, de 08:30 a. m. a 09:30 a. m." or, across two days,
// "del 10 jun 2026, 11:00 p. m. al 11 jun 2026, 01:00 a. m."
function formatRange(startIso, endIso) {
    const startDate = formatDate(startIso);
    const endDate = formatDate(endIso);
    if (startDate === endDate) {
        return `${startDate}, de ${formatTime(startIso)} a ${formatTime(endIso)}`;
    }
    return `del ${startDate}, ${formatTime(startIso)} al ${endDate}, ${formatTime(endIso)}`;
}

// HU-16: the cancel confirmation, shared by the booking history (HU-18) and the
// reservation confirmation (HU-15). It reuses ConfirmDialog, the same modal as
// "Eliminar vehículo" (HU-13), so focus, Escape and keyboard handling (AC-10)
// live in one place.
// reservation: the one to cancel, or null when the dialog is closed.
// onClose({ stale }): the user kept the reservation; stale = reload the screen.
// onCancelled(message): cancelled; message is the AC-06 confirmation text.
export default function CancelReservationDialog({ reservation, onClose, onCancelled }) {
    const [cancelling, setCancelling] = useState(false);
    const [error, setError] = useState('');
    const [stale, setStale] = useState(false);

    const code = reservation ? formatReservationCode(reservation.id) : '';
    const zoneName = reservation?.zone?.name ?? 'la zona';
    const range = reservation ? formatRange(reservation.startTime, reservation.endTime) : '';
    // An Active reservation is always a paid one (HU-17 sets it).
    const isPaid = reservation?.status === 'Active';

    const handleClose = () => {
        if (cancelling) return;
        setError('');
        setStale(false);
        onClose({ stale });
    };

    // AC-03/AC-04/AC-05/AC-08 are enforced by the backend in one transaction;
    // this only calls it and reacts to the result.
    const handleConfirm = () => {
        setCancelling(true);
        setError('');
        cancelReservation(reservation.id)
            .then(() => {
                setStale(false);
                // AC-06: reservation ID, zone and the freed time range.
                onCancelled(
                    `Reserva ${code} cancelada. Se liberó tu cupo en ${zoneName} (${range}).` +
                        (isPaid ? ' El pago se reembolsó (simulado).' : '')
                );
            })
            .catch((err) => {
                const errorCode = err.response?.data?.code;
                // Shown inside the dialog, as in "Eliminar vehículo": it is the
                // direct result of the action the user just confirmed.
                setError(translateError(errorCode));
                if (STALE_CODES.includes(errorCode)) setStale(true);
            })
            .finally(() => setCancelling(false));
    };

    return (
        <ConfirmDialog
            open={Boolean(reservation)}
            variant="danger"
            title="Cancelar reserva"
            // AC-02: the question, plus which reservation it is.
            message={
                reservation
                    ? `¿Estás seguro de que deseas cancelar esta reserva? Reserva ${code} en ` +
                      `${zoneName} (${range}). El cupo quedará libre para otros usuarios.` +
                      (isPaid ? ' El pago se reembolsará (simulado).' : '')
                    : ''
            }
            confirmLabel="Cancelar reserva"
            cancelLabel="Conservar reserva"
            confirming={cancelling}
            error={error}
            onConfirm={handleConfirm}
            onCancel={handleClose}
        />
    );
}
