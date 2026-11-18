import { pendingBalanceOf } from './openStay';

// HU-18 AC-02: the payment status of each reservation in "Mis reservas". The
// admin panel uses the same words for each payment (#309).
export const PAYMENT_STATUS_LABELS = {
    Pending: 'Pendiente',
    Paid: 'Pagado',
    Cancelled: 'Cancelado',
    Refunded: 'Reembolsado',
};

// A reservation that was cancelled or expired before it was paid will never be
// paid. The API sends Pending when a reservation has no payment, so here it is
// "Sin pago" instead of "Pendiente" (#349)
const CLOSED_STATUSES = ['Cancelled', 'Expired'];

export function paymentLabelOf(reservation) {
    // HU-27: an open stay that ended with a balance to pay
    if (pendingBalanceOf(reservation) > 0) return 'Saldo pendiente';
    if (reservation.paymentStatus === 'Pending' && CLOSED_STATUSES.includes(reservation.status)) {
        return 'Sin pago';
    }
    return PAYMENT_STATUS_LABELS[reservation.paymentStatus] ?? reservation.paymentStatus;
}
