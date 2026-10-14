import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import {
    CheckCircle2,
    MapPin,
    SquareParking,
    Car,
    LogIn,
    LogOut,
    Clock,
    Copy,
    Check,
    Map as MapIcon,
    Banknote,
    Wallet,
    Timer,
    AlertCircle,
    RefreshCw,
    CalendarCheck,
    Plus,
    Ban,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
import { formatDate, formatTime, formatDuration, formatCurrency } from '../utils/format';
import { RESERVATION_STATUS, FALLBACK_STATUS } from '../utils/reservationStatus';

// Once the 15-minute hold runs out, the backend job (every 60 s) is what
// actually marks the reservation as Expired, so the screen asks again every
// few seconds until the new status arrives.
const EXPIRED_POLL_MS = 5000;
const COPY_FEEDBACK_MS = 2000;

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

export default function ReservationConfirmation() {
    const { id } = useParams();

    const [reservation, setReservation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [notFound, setNotFound] = useState(false);

    // Current time, used to derive the countdown during render. It is only
    // updated from callbacks (the fetch and the 1-second interval), never
    // directly inside an effect.
    const [now, setNow] = useState(null);
    const lastPollRef = useRef(0);

    // 'idle' | 'copied' | 'failed'
    const [copyState, setCopyState] = useState('idle');
    const copyTimerRef = useRef(null);

    // silent = background refresh after the hold expires: a network error
    // there must not replace the whole screen with the error state.
    const fetchReservation = useCallback(
        (silent = false) => {
            getReservation(id)
                .then(({ data }) => {
                    setNow(Date.now());
                    setReservation(data.reservation);
                    setError(false);
                    setNotFound(false);
                })
                .catch((err) => {
                    if (silent) return;
                    if (err.response?.data?.code === 'RESERVATION_NOT_FOUND') {
                        setNotFound(true);
                    } else {
                        setError(true);
                    }
                })
                .finally(() => setLoading(false));
        },
        [id]
    );

    useEffect(() => {
        fetchReservation();
    }, [fetchReservation]);

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchReservation();
    };

    // Only a Pending reservation has a running hold.
    const holdExpiresAt = reservation?.status === 'Pending' ? reservation.holdExpiresAt : null;

    useEffect(() => {
        if (!holdExpiresAt) return;

        const expiresAtMs = new Date(holdExpiresAt).getTime();
        const interval = setInterval(() => {
            const current = Date.now();
            setNow(current);
            if (current >= expiresAtMs && current - lastPollRef.current >= EXPIRED_POLL_MS) {
                lastPollRef.current = current;
                fetchReservation(true);
            }
        }, 1000);

        return () => clearInterval(interval);
    }, [holdExpiresAt, fetchReservation]);

    useEffect(() => {
        return () => clearTimeout(copyTimerRef.current);
    }, []);

    const handleCopy = async () => {
        clearTimeout(copyTimerRef.current);
        try {
            await navigator.clipboard.writeText(reservation.id);
            setCopyState('copied');
        } catch {
            // Clipboard unavailable (e.g. permission denied or non-HTTPS origin).
            setCopyState('failed');
        }
        copyTimerRef.current = setTimeout(() => setCopyState('idle'), COPY_FEEDBACK_MS);
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
    const remainingMs = holdExpiresAt && now !== null ? new Date(holdExpiresAt).getTime() - now : null;
    const isTimeUp = remainingMs !== null && remainingMs <= 0;
    const canPay = isPending && !isTimeUp;
    const durationLabel = formatDuration(reservation.startTime, reservation.endTime);
    const { latitude, longitude } = reservation.zone;
    const hasCoordinates = latitude != null && longitude != null;
    const mapUrl = hasCoordinates ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="sr-only">Confirmación de reserva</h1>

            {canPay && (
                <div className="mb-6 flex items-start gap-3 rounded-lg border border-parkea-200 bg-parkea-50 p-5">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-600 text-white">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <p className="text-body font-medium text-neutral-900">¡Reserva realizada con éxito!</p>
                        <p className="text-body text-neutral-600">
                            Hemos reservado tu cupo. Completa el pago para asegurar tu espacio.
                        </p>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
                <div className="rounded-lg border border-neutral-200 bg-white p-6">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                        <h2 className="text-title font-display uppercase text-neutral-900">Detalles de la reserva</h2>
                        <span className={`flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-label font-medium ${statusBadge}`}>
                            <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
                            {statusLabel}
                        </span>
                    </div>

                    <div className="mt-4 divide-y divide-neutral-100">
                        <div className="flex flex-wrap items-center justify-between gap-3 pb-4">
                            <div className="flex min-w-0 items-start gap-3">
                                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                                    <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Código de reserva</p>
                                    <p className="break-all font-mono text-body font-medium text-neutral-900">{reservation.id}</p>
                                </div>
                            </div>
                            <button
                                type="button"
                                onClick={handleCopy}
                                aria-label="Copiar código de reserva"
                                className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                            >
                                {copyState === 'copied' && (
                                    <>
                                        <Check className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                                        ¡Copiado!
                                    </>
                                )}
                                {copyState === 'failed' && (
                                    <>
                                        <AlertCircle className="h-3.5 w-3.5 text-danger" aria-hidden="true" />
                                        No se pudo copiar
                                    </>
                                )}
                                {copyState === 'idle' && (
                                    <>
                                        <Copy className="h-3.5 w-3.5" aria-hidden="true" />
                                        Copiar
                                    </>
                                )}
                            </button>
                            {/* The button keeps a fixed aria-label, so the result is announced here. */}
                            <span role="status" className="sr-only">
                                {copyState === 'copied' && 'Código copiado'}
                                {copyState === 'failed' && 'No se pudo copiar el código'}
                            </span>
                        </div>

                        <div className="flex flex-wrap items-start justify-between gap-3 py-4">
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

                        <div className="flex items-start gap-3 py-4">
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

                        <div className="flex flex-wrap items-start justify-between gap-3 py-4">
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
                            <div className="flex shrink-0 items-start gap-3">
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
                            {/* Coordinates are optional on a zone, so the link only appears when both exist. */}
                            {hasCoordinates && (
                                <a
                                    href={mapUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                                >
                                    <MapIcon className="h-3.5 w-3.5" aria-hidden="true" />
                                    Ver en el mapa
                                    <span className="sr-only"> (se abre en una pestaña nueva)</span>
                                </a>
                            )}
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

                    {remainingMs !== null && (
                        <div className="mt-4 flex items-center justify-between gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4">
                            <div className="min-w-0">
                                <p className="flex items-center gap-1.5 text-label font-medium text-warning">
                                    <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {isTimeUp ? 'Tiempo agotado' : 'Se libera si no pagas'}
                                </p>
                                <p className="mt-0.5 text-caption text-warning">
                                    {isTimeUp
                                        ? 'Actualizando el estado de tu reserva…'
                                        : 'Tienes 15 minutos para realizar el pago. Pasado este tiempo, el cupo se libera.'}
                                </p>
                            </div>
                            <span role="timer" className="shrink-0 rounded-md bg-white px-3 py-2 font-mono text-title text-warning">
                                {formatCountdown(remainingMs)}
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Same columns as the cards above: the secondary actions sit under the
                details card and "Ir al pago" under the payment summary. When the
                reservation can no longer be paid, the secondary actions take the
                full width so the row still spans both cards. */}
            <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6">
                <div className={`flex flex-col gap-3 sm:flex-row ${canPay ? '' : 'lg:col-span-2'}`}>
                    <Link
                        to="/reservations"
                        className="flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-5 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 sm:flex-1"
                    >
                        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                        Ver mis reservas
                    </Link>
                    <Link
                        to="/zones"
                        className="flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-5 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 sm:flex-1"
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Hacer otra reserva
                    </Link>
                </div>
                {/* On mobile the primary action goes first, right below the payment summary. */}
                {canPay && (
                    <Link
                        to={`/reservations/${reservation.id}/payment`}
                        className="order-first flex items-center justify-center gap-1.5 rounded-md bg-parkea-600 px-5 py-2 text-label text-white transition-colors hover:bg-parkea-700 lg:order-none"
                    >
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                        Ir al pago
                    </Link>
                )}
            </div>
        </div>
    );
}