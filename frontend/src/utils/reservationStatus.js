import { Clock, CircleCheck, Flag, CircleX, Hourglass } from 'lucide-react';

// Shared by the booking history (HU-18) and, later, the reservation
// confirmation screen (HU-15), so both show the same label, icon and colors.
// AC-13: status is always conveyed by icon + text; the colored left border
// on each row is only a visual reinforcement, never the sole signal.
export const RESERVATION_STATUS = {
    Pending: {
        label: 'Pendiente de pago',
        Icon: Clock,
        badge: 'border-warning/30 bg-warning-soft text-warning',
        border: 'border-l-warning',
    },
    Active: {
        label: 'Activa',
        Icon: CircleCheck,
        badge: 'border-parkea-200 bg-parkea-50 text-parkea-700',
        border: 'border-l-parkea-600',
    },
    Finished: {
        label: 'Finalizada',
        Icon: Flag,
        badge: 'border-neutral-300 bg-neutral-100 text-neutral-700',
        border: 'border-l-neutral-400',
    },
    Cancelled: {
        label: 'Cancelada',
        Icon: CircleX,
        badge: 'border-danger/30 bg-danger-soft text-danger',
        border: 'border-l-danger',
    },
    Expired: {
        label: 'Expirada',
        Icon: Hourglass,
        badge: 'border-neutral-300 bg-neutral-100 text-neutral-700',
        border: 'border-l-neutral-400',
    },
};
export const FALLBACK_STATUS = {
    Icon: Clock,
    badge: 'border-neutral-300 bg-neutral-100 text-neutral-700',
    border: 'border-l-neutral-400',
};

// #347: a Pending reservation has 15 minutes to be paid. When they end it
// counts as expired for everything, even if it still says Pending: the
// backend job only marks it Expired once a minute. The backend applies the
// same rule (at that very moment included). Without holdExpiresAt the
// screen cannot know, so the backend decides.
export const holdHasEnded = (reservation, now) =>
    reservation.status === 'Pending' &&
    Boolean(reservation.holdExpiresAt) &&
    new Date(reservation.holdExpiresAt).getTime() <= now;

// HU-17 (#347): "Pagar" and "Ir al pago" are shown for a Pending reservation
// while its 15 minutes to pay last.
export const canPayReservation = (reservation, now) =>
    now !== null && reservation.status === 'Pending' && !holdHasEnded(reservation, now);

// HU-16 AC-01/AC-04/AC-05 (#316): a Pending reservation was not paid, so it
// can be cancelled while it waits for its payment, even after its start
// time, but only while its 15 minutes to pay last (#347). An Active one
// (already paid) only before its start time. The backend applies the same
// rule; this only decides whether the button is shown.
export const canCancelReservation = (reservation, now) => {
    if (now === null) return false;
    if (reservation.status === 'Pending') return !holdHasEnded(reservation, now);
    return reservation.status === 'Active' && new Date(reservation.startTime).getTime() > now;
};
