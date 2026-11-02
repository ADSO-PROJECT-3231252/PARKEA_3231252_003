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

// HU-16 AC-01/AC-04/AC-05: a reservation can be cancelled while it is Pending
// or Active (already paid) and its start time has not passed. The backend
// applies the same rule; this only decides whether the button is shown.
export const canCancelReservation = (reservation, now) =>
    ['Pending', 'Active'].includes(reservation.status) &&
    now !== null &&
    new Date(reservation.startTime).getTime() > now;
