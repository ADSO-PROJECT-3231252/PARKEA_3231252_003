import { useCallback, useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    MapPin,
    SquareParking,
    Car,
    LogIn,
    LogOut,
    Clock,
    Banknote,
    Wallet,
    AlertCircle,
    RefreshCw,
    CalendarCheck,
    Ban,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
import { formatDate, formatTime, formatDuration, formatCurrency } from '../utils/format';
import { RESERVATION_STATUS, FALLBACK_STATUS } from '../utils/reservationStatus';

export default function ReservationConfirmation() {
    const { id } = useParams();

    const [reservation, setReservation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const fetchReservation = useCallback(() => {
        getReservation(id)
            .then(({ data }) => {
                setReservation(data.reservation);
                setError(false);
                setNotFound(false);
            })
            .catch((err) => {
                if (err.response?.data?.code === 'RESERVATION_NOT_FOUND') {
                    setNotFound(true);
                } else {
                    setError(true);
                }
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        fetchReservation();
    }, [fetchReservation]);

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchReservation();
    };

    if (loading) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando…
                </p>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                    <p className="flex items-center gap-2 text-body text-neutral-600">
                        <Ban className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                        No encontramos esta reserva.
                    </p>
                    <Link
                        to="/reservations"
                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                    >
                        Ver mis reservas
                    </Link>
                </div>
            </div>
        );
    }

    if (error || !reservation) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="sr-only">Confirmación de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft p-5">
                    <p className="flex items-center gap-2 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        No pudimos cargar esta reserva.
                    </p>
                    <button
                        type="button"
                        onClick={handleRetry}
                        className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-white"
                    >
                        <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    // An unknown status shows its own name instead of pretending to be Pending.
    const { label: statusLabel = reservation.status, Icon: StatusIcon, badge: statusBadge } =
        RESERVATION_STATUS[reservation.status] ?? FALLBACK_STATUS;
    const isPending = reservation.status === 'Pending';
    const durationLabel = formatDuration(reservation.startTime, reservation.endTime);

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="sr-only">Confirmación de reserva</h1>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-lg border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-title font-display uppercase text-neutral-900">Detalles de la reserva</h2>
                        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-medium ${statusBadge}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {statusLabel}
                        </span>
                    </div>

                    <div className="mt-4 space-y-4 divide-y divide-neutral-100">
                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4 first:pt-0">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Código de reserva</p>
                                    <p className="break-all font-mono text-body font-medium text-neutral-900">{reservation.id}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-3 pt-4">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <MapPin className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Zona</p>
                                    <p className="break-words text-body font-medium text-neutral-900">{reservation.zone.name}</p>
                                    {reservation.zone.address && (
                                        <p className="break-words text-caption text-neutral-600">{reservation.zone.address}</p>
                                    )}
                                </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <SquareParking className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-caption text-neutral-600">Cupo asignado</p>
                                    <p className="font-mono text-body font-medium text-neutral-900">{reservation.spotNumber}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 pt-4">
                            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                <Car className="h-4 w-4" aria-hidden="true" />
                            </span>
                            <div className="min-w-0">
                                <p className="text-caption text-neutral-600">Vehículo</p>
                                <p className="break-words text-body font-medium text-neutral-900">
                                    {reservation.vehicle.plate} - {reservation.vehicle.brand} {reservation.vehicle.model} - {reservation.vehicle.color}
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 gap-4 pt-4 sm:grid-cols-2">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <LogIn className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Entrada</p>
                                    <p className="break-words text-body font-medium text-neutral-900">{formatDate(reservation.startTime)}</p>
                                    <p className="flex items-center gap-1 text-caption text-neutral-600">
                                        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {formatTime(reservation.startTime)}
                                    </p>
                                </div>
                            </div>
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <LogOut className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Salida</p>
                                    <p className="break-words text-body font-medium text-neutral-900">{formatDate(reservation.endTime)}</p>
                                    <p className="flex items-center gap-1 text-caption text-neutral-600">
                                        <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                        {formatTime(reservation.endTime)}
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <Clock className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-caption text-neutral-600">Duración</p>
                                    <p className="text-body font-medium text-neutral-900">{durationLabel}</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div className="rounded-lg border border-neutral-200 bg-white p-6">
                    <h2 className="text-title font-display uppercase text-neutral-900">Resumen de pago</h2>

                    <div className="mt-4 space-y-3">
                        <div className="flex items-start justify-between gap-3">
                            <span className="flex shrink-0 items-center gap-2 text-body text-neutral-600">
                                <MapPin className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                                Zona
                            </span>
                            <span className="min-w-0 break-words text-right text-body font-medium text-neutral-900">
                                {reservation.paymentSummary.zoneName}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-body text-neutral-600">
                                <SquareParking className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                                Cupo asignado
                            </span>
                            <span className="font-mono text-body font-medium text-neutral-900">
                                {reservation.paymentSummary.spotNumber}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-body text-neutral-600">
                                <Banknote className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                                Tarifa por hora
                            </span>
                            <span className="font-mono text-body font-medium text-neutral-900">
                                {formatCurrency(reservation.paymentSummary.hourlyRate)}
                            </span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                            <span className="flex items-center gap-2 text-body text-neutral-600">
                                <Clock className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                                Duración
                            </span>
                            <span className="text-body font-medium text-neutral-900">{durationLabel}</span>
                        </div>
                    </div>

                    <div className="mt-4 flex items-center justify-between gap-3 rounded-lg bg-parkea-50 p-4">
                        <span className="flex items-center gap-2 text-body font-medium text-parkea-700">
                            <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {isPending ? 'Total a pagar' : 'Total de la reserva'}
                        </span>
                        <span className="font-mono text-title font-bold text-parkea-700">
                            {formatCurrency(reservation.paymentSummary.estimatedTotal)}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}