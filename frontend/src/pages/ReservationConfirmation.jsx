import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, Link, useLocation, useNavigate } from 'react-router-dom';
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
    X,
    Flag,
    ClockPlus,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
import CancelReservationDialog from '../components/CancelReservationDialog';
import FinishStayDialog from '../components/FinishStayDialog';
import ExtendStayDialog from '../components/ExtendStayDialog';
import { formatCountdown, formatCurrency, formatDate, formatDuration, formatTime, keepTogether } from '../utils/format';
import { RESERVATION_STATUS, FALLBACK_STATUS, canCancelReservation } from '../utils/reservationStatus';
import {
    MAX_OPEN_STAY_MS,
    canFinishStay,
    formatMinutes,
    hoursLabel,
    isRunningStay,
    openStayCharge,
    paidBeforeEnd,
    paidOnlyFirstHour,
    pendingBalanceOf,
    stayEndSoFar,
} from '../utils/openStay';
import { MAX_TIMER_MS, canExtendStay, limitedByClosing } from '../utils/extendStay';

// Once the 15-minute hold runs out, the backend job (every 60 s) is what
// actually marks the reservation as Expired, so the screen asks again every
// few seconds until the new status arrives.
const EXPIRED_POLL_MS = 5000;
// HU-27: while an open stay runs, the time and the amount so far are updated
// every few seconds.
const OPEN_STAY_TICK_MS = 5000;
const COPY_FEEDBACK_MS = 2000;

// HU-17: messages sent by the payment screen through location.state.flash
// (AC-10 after a successful payment, AC-13 when it was already paid; HU-27
// after paying the balance of an open stay, or when it was already paid;
// HU-28 after paying an extension).
const FLASH_MESSAGES = {
    paymentApproved: 'Pago aprobado. Tu reserva quedó activa.',
    alreadyPaid: 'Esta reserva ya fue pagada.',
    balancePaid: 'Saldo pagado. Tu estadía quedó al día.',
    noBalance: 'Esta estadía ya no tiene saldo pendiente.',
    stayExtended: 'Pago aprobado. Tu estadía quedó ampliada con la nueva hora de salida.',
};

// Shared class strings, so the same look is written once.
const ICON_CIRCLE = 'flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600';
const OUTLINE_BUTTON_SM =
    'flex shrink-0 items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600';
const OUTLINE_ACTION =
    'flex items-center justify-center gap-1.5 rounded-md border border-neutral-200 px-5 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 sm:flex-1';
// Same size as the other actions, in the danger colors of the "Cancelar" button
// of the booking history (HU-18).
const DANGER_ACTION =
    'flex items-center justify-center gap-1.5 rounded-md border border-danger px-5 py-2 text-label text-danger transition-colors hover:bg-danger-soft sm:flex-1';
// The main action of the screen ("Ir al pago", "Terminar estadía", "Pagar
// saldo", "Ampliar estadía"), under the payment summary; on mobile it goes
// first. The breakpoint where it moves beside the others is added in the page.
const PRIMARY_ACTION =
    'order-first flex items-center justify-center gap-1.5 rounded-md bg-parkea-600 px-5 py-2 text-label text-white transition-colors hover:bg-parkea-700';

// An amount inside a sentence: "$" and the number stay on the same line.
const money = (amount) => keepTogether(formatCurrency(amount));

// HU-27 AC-03/AC-07: how an open stay is charged, and what is left to pay.
// HU-28: a reservation switched to an open stay paid another amount than the
// first hour, so the text names it.
// HU-29: in a zone that is not open 24 hours, the stay lasts until the
// closing time of the zone (`limit`), not 24 hours.
function openStayNote(isRunning, soFar, paid, hourlyRate, limit = 'hasta 24 horas') {
    const firstHourOnly = paidOnlyFirstHour(paid, hourlyRate);
    const rate = money(hourlyRate);
    if (!isRunning) {
        return firstHourOnly
            ? `Se cobra ${rate} por cada hora empezada, ${limit}. La primera hora se paga al confirmar y el resto al terminar.`
            : `Se cobra ${rate} por cada hora empezada desde la entrada, ${limit}. Ya pagaste ${money(paid)} y el resto se paga al terminar.`;
    }
    const started = hoursLabel(soFar.chargedHours, 'empezada');
    if (soFar.balance > 0) {
        return `Llevas ${started}. Ya pagaste ${firstHourOnly ? 'la primera' : money(paid)}; si terminas ahora, quedan ${money(soFar.balance)} por pagar.`;
    }
    return firstHourOnly
        ? 'Vas en tu primera hora, que ya pagaste: si terminas ahora, no queda nada por pagar.'
        : `Llevas ${started} y ya pagaste ${money(paid)}: si terminas ahora, no queda nada por pagar.`;
}

// HU-27: what a finished open stay was charged. HU-28: when what was already
// paid covered more than the hours used, it says so instead.
function finishedStayNote(openStay, hourlyRate) {
    const byHours = Math.round(openStay.chargedHours * Number(hourlyRate) * 100) / 100;
    const paid = `Pagado: ${money(openStay.paid)}.`;
    if (openStay.total - byHours > 0.005) {
        return `Usaste ${formatMinutes(openStay.usedMinutes)}, que ya estaban cubiertos por lo que habías pagado. ${paid}`;
    }
    return `${hoursLabel(openStay.chargedHours, 'cobrada')}. ${paid}`;
}

export default function ReservationConfirmation() {
    const { id } = useParams();
    const location = useLocation();
    const navigate = useNavigate();

    // Read once; the state is then cleared so a page refresh doesn't show it again.
    const [flash] = useState(() => FLASH_MESSAGES[location.state?.flash] ?? '');
    const flashRef = useRef(null);

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

    // HU-16: the cancel dialog. HU-27: the finish dialog, open since the
    // moment it was clicked (null = closed). The message after either action.
    const [cancelOpen, setCancelOpen] = useState(false);
    const [finishOpenedAt, setFinishOpenedAt] = useState(null);
    // HU-28: the extend dialog, open since the moment it was clicked.
    const [extendOpenedAt, setExtendOpenedAt] = useState(null);
    const [resultMessage, setResultMessage] = useState('');
    const resultMessageRef = useRef(null);

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

    // HU-27: a paid open stay. Before it starts, the tick makes "Terminar
    // estadía" appear on time; while it runs, it updates the amount so far.
    const openStaySince =
        reservation?.openEnded && reservation.status === 'Active' ? reservation.startTime : null;
    const openStayLatestEnd = openStaySince ? reservation.latestEndTime : null;

    useEffect(() => {
        if (!openStaySince) return;

        // HU-29: the closing time of the zone when it comes before 24 hours
        const limitMs = Math.min(
            new Date(openStaySince).getTime() + MAX_OPEN_STAY_MS,
            openStayLatestEnd ? new Date(openStayLatestEnd).getTime() : Infinity,
        );
        const interval = setInterval(() => {
            const current = Date.now();
            setNow(current);
            // AC-10: after 24 hours (or at the closing time of the zone, HU-29)
            // the backend job ends the stay by itself, so the screen asks again
            // until the new status arrives.
            if (current >= limitMs && current - lastPollRef.current >= EXPIRED_POLL_MS) {
                lastPollRef.current = current;
                fetchReservation(true);
            }
        }, OPEN_STAY_TICK_MS);

        return () => clearInterval(interval);
    }, [openStaySince, openStayLatestEnd, fetchReservation]);

    // HU-28 AC-01: "Ampliar estadía" is offered until the exit time, so the
    // screen updates itself at that moment. A timer cannot wait more than
    // about 24 days, so a longer wait is done in steps.
    const extendableUntil = reservation?.status === 'Active' && !reservation.openEnded ? reservation.endTime : null;

    useEffect(() => {
        if (!extendableUntil) return;
        const delay = new Date(extendableUntil).getTime() - Date.now();
        if (delay <= 0) return;
        const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 100, MAX_TIMER_MS));
        return () => clearTimeout(timer);
    }, [extendableUntil, now]);

    useEffect(() => {
        return () => clearTimeout(copyTimerRef.current);
    }, []);

    useEffect(() => {
        if (location.state?.flash) navigate(location.pathname, { replace: true, state: null });
    }, [location.state, location.pathname, navigate]);

    // The message is already on screen when it mounts, so a live region alone
    // may not be read; moving the focus to it makes sure it is announced.
    useEffect(() => {
        if (flash && !loading) flashRef.current?.focus();
    }, [flash, loading]);

    // HU-16: after cancelling, the reservation is loaded again in the
    // background, so the screen shows it as "Cancelada" without the loading state.
    const handleCancelled = (message) => {
        setCancelOpen(false);
        setResultMessage(message);
        fetchReservation(true);
    };
    const handleCancelClose = ({ stale }) => {
        setCancelOpen(false);
        if (stale) fetchReservation(true);
    };

    // HU-27: same as cancelling, the stay is loaded again as "Finalizada".
    const handleFinished = (message) => {
        setFinishOpenedAt(null);
        setResultMessage(message);
        fetchReservation(true);
    };
    const handleFinishClose = ({ stale }) => {
        setFinishOpenedAt(null);
        if (stale) fetchReservation(true);
    };

    // HU-28: after switching to an open stay, loaded again without an exit time.
    const handleExtended = (message) => {
        setExtendOpenedAt(null);
        setResultMessage(message);
        fetchReservation(true);
    };
    const handleExtendClose = ({ stale }) => {
        setExtendOpenedAt(null);
        if (stale) fetchReservation(true);
    };

    // The "Cancelar reserva" or "Terminar estadía" button disappears after
    // the action, so the focus goes to the message, which also makes sure it
    // is read aloud.
    useEffect(() => {
        if (resultMessage) resultMessageRef.current?.focus();
    }, [resultMessage]);

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
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6">
                <title>Confirmación de reserva | PARKEA</title>
                <h1 className="sr-only">Confirmación de reserva</h1>
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando…
                </p>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6">
                <title>Confirmación de reserva | PARKEA</title>
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
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6">
                <title>Confirmación de reserva | PARKEA</title>
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
    const canCancel = canCancelReservation(reservation, now);
    // HU-27: an open stay has no exit time until it ends (endTime is null).
    const isOpenStay = Boolean(reservation.openEnded);
    const hasExit = Boolean(reservation.endTime);
    const isRunning = isRunningStay(reservation, now);
    const canFinish = canFinishStay(reservation, now);
    const canExtend = canExtendStay(reservation, now);
    const pendingBalance = pendingBalanceOf(reservation);
    const hourlyRate = reservation.paymentSummary.hourlyRate;
    // HU-28: what was paid, extensions included, and how many there were.
    const { paidTotal = 0, extensions = 0 } = reservation.paymentSummary;
    // What an open stay paid before it ends: the first hour, or another amount
    // if it was switched from a reservation with an exit time (HU-28).
    const paidBefore = isOpenStay ? paidBeforeEnd(reservation, hourlyRate) : 0;
    const soFar = isRunning ? openStayCharge(reservation.startTime, hourlyRate, now, paidBefore, reservation.latestEndTime) : null;
    let durationLabel = '—';
    if (hasExit) {
        durationLabel = formatDuration(reservation.startTime, reservation.endTime);
    } else if (isRunning) {
        durationLabel = `${formatDuration(reservation.startTime, stayEndSoFar(reservation.startTime, now, reservation.latestEndTime))} hasta ahora`;
    } else if (['Pending', 'Active'].includes(reservation.status)) {
        durationLabel = 'Tiempo indefinido';
    }
    // The amount in the green box and its label.
    let totalLabel = isPending ? 'Total a pagar' : 'Total de la reserva';
    let totalAmount = reservation.paymentSummary.estimatedTotal;
    if (isOpenStay) {
        if (isRunning) {
            totalLabel = 'Total hasta ahora';
            totalAmount = soFar.total;
        } else if (reservation.status === 'Finished') {
            totalLabel = 'Total de la estadía';
            totalAmount = reservation.openStay.total;
        } else if (isPending) {
            totalLabel = 'Primera hora a pagar';
        } else if (reservation.status === 'Active') {
            totalLabel = paidOnlyFirstHour(paidBefore, hourlyRate) ? 'Primera hora pagada' : 'Ya pagado';
            totalAmount = paidBefore;
        }
    }
    // HU-28 AC-09: the total paid, extensions included. A cancelled
    // reservation shows what it cost before the refund.
    if (reservation.status === 'Cancelled' && paidTotal > 0) {
        totalAmount = paidTotal;
    } else if (!isOpenStay && extensions > 0) {
        totalLabel = 'Total pagado';
        totalAmount = paidTotal;
    }
    const hasPrimaryAction = canPay || canFinish || pendingBalance > 0 || canExtend;
    // HU-28: "Cancelar reserva" plus a main action ("Ir al pago" or "Ampliar
    // estadía") are four buttons. The three secondary ones only fit beside the
    // main one from xl up; below that the main action keeps its own row, first.
    const fourActions = canCancel && hasPrimaryAction;
    const actionsGrid = fourActions
        ? 'xl:grid-cols-[minmax(0,1fr)_360px] xl:gap-6'
        : 'lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-6';
    const primaryAction = `${PRIMARY_ACTION} ${fourActions ? 'xl:order-none' : 'lg:order-none'}`;
    const { latitude, longitude } = reservation.zone;
    const hasCoordinates = latitude != null && longitude != null;
    const mapUrl = hasCoordinates ? `https://www.google.com/maps?q=${latitude},${longitude}` : null;

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6">
            <title>Confirmación de reserva | PARKEA</title>
            <h1 className="sr-only">Confirmación de reserva</h1>

            {flash && (
                <p
                    ref={flashRef}
                    tabIndex={-1}
                    role="status"
                    className="mb-6 flex items-center gap-2 rounded-lg border border-parkea-200 bg-parkea-50 px-4 py-3 text-body font-medium text-parkea-700 focus:outline-none"
                >
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {flash}
                </p>
            )}

            {/* HU-16 AC-06, HU-27 AC-09 */}
            {resultMessage && (
                <p
                    ref={resultMessageRef}
                    tabIndex={-1}
                    role="status"
                    className="mb-6 flex items-center gap-2 rounded-lg border border-parkea-200 bg-parkea-50 px-4 py-3 text-body font-medium text-parkea-700 focus:outline-none"
                >
                    <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {resultMessage}
                </p>
            )}

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
                                <span className={ICON_CIRCLE}>
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
                                className={OUTLINE_BUTTON_SM}
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
                                <span className={ICON_CIRCLE}>
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
                                <span className={ICON_CIRCLE}>
                                    <SquareParking className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div>
                                    <p className="text-caption text-neutral-600">Cupo asignado</p>
                                    <p className="font-mono text-body font-medium text-neutral-900">{reservation.spotNumber}</p>
                                </div>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 py-4">
                            <span className={ICON_CIRCLE}>
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
                                <span className={ICON_CIRCLE}>
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
                            {/* HU-29: without an exit time, the text of its latest end can wrap */}
                            <div className={`flex items-start gap-3 ${hasExit ? 'shrink-0' : 'min-w-0'}`}>
                                <span className={ICON_CIRCLE}>
                                    <LogOut className="h-4 w-4" aria-hidden="true" />
                                </span>
                                <div className="min-w-0">
                                    <p className="text-caption text-neutral-600">Salida</p>
                                    {hasExit ? (
                                        <>
                                            <p className="break-words text-body font-medium text-neutral-900">{formatDate(reservation.endTime)}</p>
                                            <p className="flex items-center gap-1 text-caption text-neutral-600">
                                                <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                                {formatTime(reservation.endTime)}
                                            </p>
                                        </>
                                    ) : (
                                        <>
                                            <p className="text-body font-medium text-neutral-900">Sin hora de salida</p>
                                            {/* HU-29 AC-04: when it ends by itself at the latest */}
                                            {['Pending', 'Active'].includes(reservation.status) &&
                                                (reservation.latestEndTime ? (
                                                    <>
                                                        <p className="break-words text-caption text-neutral-600">
                                                            Termina a más tardar el {formatDate(reservation.latestEndTime)}
                                                        </p>
                                                        <p className="flex items-center gap-1 text-caption text-neutral-600">
                                                            <Clock className="h-3 w-3 shrink-0" aria-hidden="true" />
                                                            {formatTime(reservation.latestEndTime)}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <p className="text-caption text-neutral-600">Máximo 24 horas</p>
                                                ))}
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>

                        <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
                            <div className="flex min-w-0 items-center gap-3">
                                <span className={ICON_CIRCLE}>
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
                                    className={OUTLINE_BUTTON_SM}
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

                    <div className="mt-4 flex flex-col items-start gap-1 rounded-lg bg-parkea-50 p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                        <span className="flex items-center gap-2 text-body font-medium text-parkea-700">
                            <Wallet className="h-4 w-4 shrink-0" aria-hidden="true" />
                            {totalLabel}
                        </span>
                        <span className="whitespace-nowrap font-mono text-title font-bold text-parkea-700">
                            {formatCurrency(totalAmount)}
                        </span>
                    </div>

                    {/* HU-27 AC-03/AC-07: how an open stay is charged, and what is left to pay */}
                    {isOpenStay && ['Pending', 'Active'].includes(reservation.status) && (
                        <p className="mt-3 text-caption text-neutral-600">
                            {openStayNote(
                                isRunning,
                                soFar,
                                paidBefore,
                                hourlyRate,
                                reservation.latestEndTime && limitedByClosing(reservation)
                                    ? `hasta las ${keepTogether(formatTime(reservation.latestEndTime))}, cuando cierra la zona`
                                    : undefined,
                            )}
                        </p>
                    )}
                    {isOpenStay && reservation.status === 'Finished' && (
                        <p className="mt-3 text-caption text-neutral-600">
                            {finishedStayNote(reservation.openStay, hourlyRate)}
                        </p>
                    )}
                    {/* HU-28 AC-09 */}
                    {!isOpenStay && extensions > 0 && (
                        <p className="mt-3 text-caption text-neutral-600">
                            Incluye {extensions === 1 ? '1 ampliación' : `${extensions} ampliaciones`} de la estadía.
                        </p>
                    )}
                    {pendingBalance > 0 && (
                        <div className="mt-4 flex flex-col items-start gap-1 rounded-lg border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                            <span className="flex items-center gap-2 text-body font-medium text-warning">
                                <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                                Saldo pendiente
                            </span>
                            <span className="whitespace-nowrap font-mono text-title font-bold text-warning">
                                {formatCurrency(pendingBalance)}
                            </span>
                        </div>
                    )}

                    {remainingMs !== null && (
                        <div className="mt-4 flex flex-col items-start gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
                            {/* Announces "Tiempo agotado" when the text changes; the timer itself stays silent. */}
                            <div className="min-w-0" aria-live="polite">
                                <p className="flex items-center gap-1.5 text-label font-medium text-warning">
                                    <Timer className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    {isTimeUp ? 'Tiempo agotado' : 'Se libera si no pagas'}
                                </p>
                                <p className="mt-0.5 text-caption text-warning">
                                    {isTimeUp
                                        ? 'Actualizando el estado de tu reserva…'
                                        : 'Completa el pago antes de que el contador llegue a 00:00; si no, el cupo se libera.'}
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
            <div className={`mt-6 grid grid-cols-1 gap-3 ${actionsGrid}`}>
                {/* With "Cancelar reserva" there are three buttons, which only fit
                    side by side from md up. */}
                <div className={`flex flex-col gap-3 ${canCancel ? 'md:flex-row' : 'sm:flex-row'} ${hasPrimaryAction ? '' : 'lg:col-span-2'}`}>
                    <Link
                        to="/reservations"
                        className={OUTLINE_ACTION}
                    >
                        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                        Ver mis reservas
                    </Link>
                    <Link
                        to="/zones"
                        className={OUTLINE_ACTION}
                    >
                        <Plus className="h-4 w-4" aria-hidden="true" />
                        Hacer otra reserva
                    </Link>
                    {/* HU-16 AC-01: Pending or Active reservations that have not started. */}
                    {canCancel && (
                        <button
                            type="button"
                            onClick={() => setCancelOpen(true)}
                            className={DANGER_ACTION}
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                            Cancelar reserva
                        </button>
                    )}
                </div>
                {/* On mobile the primary action goes first, right below the payment summary. */}
                {canPay && (
                    <Link to={`/reservations/${reservation.id}/payment`} className={primaryAction}>
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                        Ir al pago
                    </Link>
                )}
                {/* HU-27 AC-05 */}
                {canFinish && (
                    <button type="button" onClick={() => setFinishOpenedAt(Date.now())} className={primaryAction}>
                        <Flag className="h-4 w-4" aria-hidden="true" />
                        Terminar estadía
                    </button>
                )}
                {/* HU-27 AC-07: the balance is paid on the same payment screen */}
                {pendingBalance > 0 && (
                    <Link to={`/reservations/${reservation.id}/payment`} className={primaryAction}>
                        <Wallet className="h-4 w-4" aria-hidden="true" />
                        Pagar saldo
                        <span className="font-mono">{formatCurrency(pendingBalance)}</span>
                    </Link>
                )}
                {/* HU-28 AC-01: paid, with an exit time that has not been reached */}
                {canExtend && (
                    <button type="button" onClick={() => setExtendOpenedAt(Date.now())} className={primaryAction}>
                        <ClockPlus className="h-4 w-4" aria-hidden="true" />
                        Ampliar estadía
                    </button>
                )}
            </div>

            <CancelReservationDialog
                reservation={cancelOpen ? reservation : null}
                onClose={handleCancelClose}
                onCancelled={handleCancelled}
            />
            {finishOpenedAt !== null && (
                <FinishStayDialog
                    reservation={reservation}
                    hourlyRate={hourlyRate}
                    openedAt={finishOpenedAt}
                    onClose={handleFinishClose}
                    onFinished={handleFinished}
                />
            )}
            {extendOpenedAt !== null && (
                <ExtendStayDialog
                    reservation={reservation}
                    hourlyRate={hourlyRate}
                    paid={paidTotal}
                    openedAt={extendOpenedAt}
                    onClose={handleExtendClose}
                    onExtended={handleExtended}
                />
            )}
        </div>
    );
}
