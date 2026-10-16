import { useCallback, useEffect, useRef, useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    Ban,
    Calendar,
    CircleCheck,
    Clock,
    CreditCard,
    Info,
    Landmark,
    Loader2,
    RefreshCw,
    TriangleAlert,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
import { payReservation } from '../services/paymentService';
import { formatCurrency, formatDate, formatDuration, formatTime } from '../utils/format';
import { translateError } from '../utils/errorMessages';
import { RESERVATION_STATUS } from '../utils/reservationStatus';

// Values the backend expects in paymentMethod (pago.controller.js).
const METHOD_CARD = 'card';
const METHOD_PSE = 'pse';

// AC-03: two methods, each with a short description.
const METHODS = [
    { value: METHOD_CARD, label: 'Tarjeta', description: 'Paga con tarjeta de crédito o débito', Icon: CreditCard },
    { value: METHOD_PSE, label: 'PSE', description: 'Paga desde tu cuenta bancaria', Icon: Landmark },
];

// AC-04: test values loaded by default. AC-11: a card ending in 0002 is
// always declined by the backend, so the user can try a rejection.
const TEST_CARD = {
    number: '4242 4242 4242 4242',
    expiry: '12/28',
    cvv: '123',
    name: 'Usuario de prueba',
};
const DECLINE_TEST_NUMBER = '4000 0000 0000 0002';

// Simulated payment: the overlay stays at least this long so it can be read
// and feels like a real payment. Change this one value to make it shorter.
const PROCESSING_MIN_MS = 3000;
// Time the "Pago aprobado" message stays before going to the confirmation.
const REDIRECT_DELAY_MS = 1500;

const PAGE_SHELL = 'mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6';
const CARD = 'rounded-lg border border-neutral-200 bg-white p-6';
const OUTLINE_BUTTON_SM =
    'flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600';

const onlyDigits = (value) => value.replace(/\D/g, '');

// "4242424242424242" -> "4242 4242 4242 4242"
const formatCardNumber = (value) =>
    onlyDigits(value)
        .slice(0, 19)
        .replace(/(\d{4})(?=\d)/g, '$1 ');

// "1228" -> "12/28"
const formatExpiry = (value) => {
    const digits = onlyDigits(value).slice(0, 4);
    return digits.length > 2 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : digits;
};

function validateCard(card) {
    const errors = {};
    const digits = onlyDigits(card.number);
    if (digits.length < 13 || digits.length > 19) {
        errors.number = 'Ingresa un número de tarjeta de 13 a 19 dígitos.';
    }

    const match = /^(0[1-9]|1[0-2])\/(\d{2})$/.exec(card.expiry);
    if (!match) {
        errors.expiry = 'Usa el formato MM/AA.';
    } else {
        const year = 2000 + Number(match[2]);
        const month = Number(match[1]);
        const today = new Date();
        if (year < today.getFullYear() || (year === today.getFullYear() && month < today.getMonth() + 1)) {
            errors.expiry = 'La tarjeta está vencida.';
        }
    }

    if (!/^\d{3,4}$/.test(card.cvv)) {
        errors.cvv = 'El CVV debe tener 3 o 4 dígitos.';
    }
    if (!card.name.trim()) {
        errors.name = 'Este campo es obligatorio.';
    }
    return errors;
}

function formatCountdown(ms) {
    const totalSeconds = Math.max(0, Math.floor(ms / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// groupStart draws the line that separates the groups of the mockup.
function SummaryItem({ label, children, groupStart = false }) {
    return (
        <div className={`py-3 ${groupStart ? 'border-t border-neutral-100' : ''}`}>
            <dt className="text-caption text-neutral-500">{label}</dt>
            <dd className="mt-0.5 break-words text-body text-neutral-900">{children}</dd>
        </div>
    );
}

// Below 360 px the icon is hidden so the full card number still fits.
function CardField({ id, label, Icon, error, className = '', ...inputProps }) {
    return (
        <div className={className}>
            <label htmlFor={id} className="block text-label text-neutral-700">
                {label}
            </label>
            <div className="relative mt-1">
                <input
                    id={id}
                    name={id}
                    type="text"
                    autoComplete="off"
                    aria-invalid={Boolean(error)}
                    aria-describedby={error ? `${id}-error` : undefined}
                    className={`w-full rounded-md border bg-white px-3 py-2.5 font-mono text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${
                        Icon ? 'min-[360px]:pr-10' : ''
                    } ${error ? 'border-danger' : 'border-neutral-200'}`}
                    {...inputProps}
                />
                {Icon && (
                    <Icon
                        className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-neutral-500 max-[359px]:hidden"
                        aria-hidden="true"
                    />
                )}
            </div>
            {error && (
                <p id={`${id}-error`} className="mt-1 text-caption text-danger">
                    {error}
                </p>
            )}
        </div>
    );
}

// Covers the whole screen, header included, while the payment is processed,
// so nothing behind it can be clicked or focused (AC-12).
function ProcessingOverlay({ amount }) {
    const boxRef = useRef(null);

    useEffect(() => {
        boxRef.current?.focus();
        // There is nothing to tab to inside, so Tab must not leave the overlay.
        const blockTab = (event) => {
            if (event.key === 'Tab') event.preventDefault();
        };
        document.addEventListener('keydown', blockTab);
        return () => document.removeEventListener('keydown', blockTab);
    }, []);

    return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center px-4">
            <div className="absolute inset-0 bg-neutral-900/50" aria-hidden="true" />
            <div
                ref={boxRef}
                tabIndex={-1}
                role="dialog"
                aria-modal="true"
                aria-labelledby="processing-title"
                aria-describedby="processing-message"
                className="relative flex w-full max-w-sm flex-col items-center rounded-lg bg-white p-8 text-center shadow-lg focus:outline-none"
            >
                <Loader2 className="h-10 w-10 animate-spin text-parkea-600 motion-reduce:animate-none" aria-hidden="true" />
                <h2 id="processing-title" className="mt-4 text-title font-display uppercase text-neutral-900">
                    Procesando pago
                </h2>
                <p id="processing-message" className="mt-2 text-body text-neutral-600">
                    Estamos confirmando tu pago de <span className="whitespace-nowrap font-mono">{formatCurrency(amount)}</span>.
                    No cierres ni recargues esta página.
                </p>
            </div>
        </div>
    );
}

export default function PayReservation() {
    const { id } = useParams();
    const navigate = useNavigate();

    const [reservation, setReservation] = useState(null);
    const [loading, setLoading] = useState(true);
    const [loadError, setLoadError] = useState(false);
    const [notFound, setNotFound] = useState(false);

    const [method, setMethod] = useState(METHOD_CARD); // AC-03: card by default
    const [card, setCard] = useState(TEST_CARD);
    const [fieldErrors, setFieldErrors] = useState({});

    // Current time for the countdown. Only updated from callbacks (the fetch
    // and the 1-second interval), never directly inside an effect.
    const [now, setNow] = useState(null);

    const [processing, setProcessing] = useState(false);
    const [approved, setApproved] = useState(false);
    const [expiredByServer, setExpiredByServer] = useState(false);
    const [message, setMessage] = useState(null); // { type: 'error' | 'success', text }
    const messageRef = useRef(null);
    const redirectTimerRef = useRef(null);

    const fetchReservation = useCallback(() => {
        getReservation(id)
            .then(({ data }) => {
                setNow(Date.now());
                setReservation(data.reservation);
                setLoadError(false);
                setNotFound(false);
            })
            .catch((err) => {
                // Another user's reservation also answers RESERVATION_NOT_FOUND (AC-14).
                if (err.response?.data?.code === 'RESERVATION_NOT_FOUND') {
                    setNotFound(true);
                } else {
                    setLoadError(true);
                }
            })
            .finally(() => setLoading(false));
    }, [id]);

    useEffect(() => {
        fetchReservation();
    }, [fetchReservation]);

    // AC-08: only a Pending reservation has a hold running.
    const holdExpiresAt = reservation?.status === 'Pending' ? reservation.holdExpiresAt : null;

    useEffect(() => {
        if (!holdExpiresAt) return;
        const interval = setInterval(() => setNow(Date.now()), 1000);
        return () => clearInterval(interval);
    }, [holdExpiresAt]);

    useEffect(() => () => clearTimeout(redirectTimerRef.current), []);

    // Move focus to the result once the overlay closes, so it is read out.
    useEffect(() => {
        if (message) messageRef.current?.focus();
    }, [message]);

    const handleRetry = () => {
        setLoading(true);
        setLoadError(false);
        fetchReservation();
    };

    // AC-09: back to the confirmation without touching the reservation.
    const goToConfirmation = () => navigate(`/reservations/${id}`);

    const handleCardChange = (e) => {
        const { name, value } = e.target;
        let next = value;
        if (name === 'number') next = formatCardNumber(value);
        if (name === 'expiry') next = formatExpiry(value);
        if (name === 'cvv') next = onlyDigits(value).slice(0, 4);
        setCard((prev) => ({ ...prev, [name]: next }));
        setFieldErrors((prev) => ({ ...prev, [name]: undefined }));
    };

    if (loading) {
        return (
            <div className={PAGE_SHELL}>
                <h1 className="sr-only">Pago de reserva</h1>
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando…
                </p>
            </div>
        );
    }

    if (notFound) {
        return (
            <div className={PAGE_SHELL}>
                <h1 className="sr-only">Pago de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                    <p className="flex items-center gap-2 text-body text-neutral-600">
                        <Ban className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                        No encontramos esta reserva.
                    </p>
                    <Link to="/reservations" className={OUTLINE_BUTTON_SM}>
                        Ver mis reservas
                    </Link>
                </div>
            </div>
        );
    }

    if (loadError || !reservation) {
        return (
            <div className={PAGE_SHELL}>
                <h1 className="sr-only">Pago de reserva</h1>
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

    // AC-13: an already paid reservation goes to its confirmation, which
    // explains why. After a payment made here the redirect is done below.
    if (reservation.status === 'Active' && !approved) {
        return <Navigate to={`/reservations/${reservation.id}`} replace state={{ flash: 'alreadyPaid' }} />;
    }

    // Expired, Cancelled or Finished: nothing left to pay.
    if (reservation.status !== 'Pending' && !approved) {
        return (
            <div className={PAGE_SHELL}>
                <h1 className="sr-only">Pago de reserva</h1>
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                    <p className="flex items-center gap-2 text-body text-neutral-900">
                        <Info className="h-4 w-4 shrink-0 text-info" aria-hidden="true" />
                        {translateError(reservation.status === 'Expired' ? 'RESERVATION_EXPIRED' : 'RESERVATION_NOT_PENDING')}
                    </p>
                    <Link to={`/reservations/${reservation.id}`} className={OUTLINE_BUTTON_SM}>
                        Ver la reserva
                    </Link>
                </div>
            </div>
        );
    }

    const { zone, vehicle, paymentSummary } = reservation;
    const total = paymentSummary.estimatedTotal;
    const pendingStatus = RESERVATION_STATUS.Pending;
    const remainingMs = holdExpiresAt && now !== null ? new Date(holdExpiresAt).getTime() - now : null;
    const isTimeUp = expiredByServer || (remainingMs !== null && remainingMs <= 0);
    const payDisabled = processing || approved || isTimeUp;

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (payDisabled) return;
        setMessage(null);

        if (method === METHOD_CARD) {
            const errors = validateCard(card);
            setFieldErrors(errors);
            const firstInvalid = Object.keys(errors)[0];
            if (firstInvalid) {
                document.getElementById(firstInvalid)?.focus();
                return;
            }
        }

        setProcessing(true);
        // AC-05: only the method and the last four digits leave the form.
        const payload =
            method === METHOD_CARD
                ? { paymentMethod: method, cardLastFour: onlyDigits(card.number).slice(-4) }
                : { paymentMethod: method };

        const [result] = await Promise.allSettled([payReservation(id, payload), wait(PROCESSING_MIN_MS)]);
        setProcessing(false);

        if (result.status === 'fulfilled') {
            // AC-10: message, then the confirmation with the new status.
            setApproved(true);
            setMessage({ type: 'success', text: 'Pago aprobado' });
            redirectTimerRef.current = setTimeout(
                () => navigate(`/reservations/${id}`, { replace: true, state: { flash: 'paymentApproved' } }),
                REDIRECT_DELAY_MS,
            );
            return;
        }

        const code = result.reason.response?.data?.code;
        if (code === 'PAYMENT_ALREADY_EXISTS') {
            // AC-13: paid meanwhile, for example in another tab.
            navigate(`/reservations/${id}`, { replace: true, state: { flash: 'alreadyPaid' } });
            return;
        }
        if (code === 'RESERVATION_EXPIRED') setExpiredByServer(true);
        // AC-11: on PAYMENT_DECLINED the reservation stays Pending and the
        // user can try again right away.
        setMessage({ type: 'error', text: translateError(code) });
    };

    return (
        <div className={PAGE_SHELL}>
            {/* AC-02: simulated environment notice, with the time left (AC-08) */}
            <div className="mb-6 flex flex-col gap-3 rounded-lg border border-warning/30 bg-warning-soft p-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0 text-warning" aria-hidden="true" />
                    <div>
                        <p className="text-label font-medium text-warning">Entorno de prueba</p>
                        <p className="text-caption text-warning">Este es un entorno de prueba. Ningún pago real será procesado.</p>
                    </div>
                </div>
                {remainingMs !== null && (
                    <p className="flex shrink-0 items-center gap-1.5 text-caption font-medium text-warning" aria-hidden="true">
                        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {isTimeUp ? 'El tiempo para pagar terminó' : `Se libera en ${formatCountdown(remainingMs)} si no pagas`}
                    </p>
                )}
            </div>

            <h1 className="text-title font-display uppercase text-neutral-900">Pago de reserva</h1>
            <p className="mt-1 text-body text-neutral-600">Completa el pago para confirmar tu reserva.</p>

            <form onSubmit={handleSubmit} noValidate className="mt-6">
                <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_400px]">
                    {/* AC-01, section 1: payment method */}
                    <section aria-labelledby="method-title" className={CARD}>
                        <h2 id="method-title" className="text-subtitle-sm text-neutral-900">
                            Método de pago
                        </h2>

                        <fieldset className="mt-4">
                            <legend className="sr-only">Elige un método de pago</legend>
                            <div className="grid gap-3 sm:grid-cols-2">
                                {METHODS.map(({ value, label, description, Icon }) => {
                                    const selected = method === value;
                                    return (
                                        <label
                                            key={value}
                                            className={`flex cursor-pointer items-start gap-3 rounded-lg border p-4 transition-colors focus-within:ring-2 focus-within:ring-parkea-600 ${
                                                selected
                                                    ? 'border-parkea-600 bg-parkea-50'
                                                    : 'border-neutral-200 bg-white hover:border-parkea-300'
                                            }`}
                                        >
                                            {/* AC-03: the filled radio marks the choice, not color alone */}
                                            <input
                                                type="radio"
                                                name="method"
                                                value={value}
                                                checked={selected}
                                                onChange={() => {
                                                    setMethod(value);
                                                    setMessage(null);
                                                }}
                                                className="mt-1 h-4 w-4 shrink-0 accent-parkea-600"
                                            />
                                            <span className="min-w-0">
                                                <span className="flex items-center gap-2 text-label font-medium text-neutral-900">
                                                    <Icon className="h-4 w-4 shrink-0 text-parkea-600" aria-hidden="true" />
                                                    {label}
                                                </span>
                                                <span className="mt-0.5 block text-caption text-neutral-600">{description}</span>
                                            </span>
                                        </label>
                                    );
                                })}
                            </div>
                        </fieldset>

                        {method === METHOD_CARD ? (
                            <div className="mt-6">
                                <h3 className="text-subtitle-sm text-neutral-900">Datos de la tarjeta</h3>
                                {/* AC-04: the pre-filled values are labelled as test data */}
                                <p className="mt-1 text-caption text-neutral-600">Ya están cargados datos de prueba.</p>

                                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                                    <CardField
                                        id="number"
                                        label="Número de tarjeta"
                                        Icon={CreditCard}
                                        inputMode="numeric"
                                        value={card.number}
                                        onChange={handleCardChange}
                                        error={fieldErrors.number}
                                        className="sm:col-span-2"
                                    />
                                    <CardField
                                        id="expiry"
                                        label="Fecha de vencimiento"
                                        Icon={Calendar}
                                        inputMode="numeric"
                                        placeholder="MM/AA"
                                        value={card.expiry}
                                        onChange={handleCardChange}
                                        error={fieldErrors.expiry}
                                    />
                                    {/* AC-06: no lock icon, the app does not encrypt anything */}
                                    <CardField
                                        id="cvv"
                                        label="CVV"
                                        inputMode="numeric"
                                        value={card.cvv}
                                        onChange={handleCardChange}
                                        error={fieldErrors.cvv}
                                    />
                                    <CardField
                                        id="name"
                                        label="Nombre en la tarjeta"
                                        value={card.name}
                                        onChange={handleCardChange}
                                        error={fieldErrors.name}
                                        className="sm:col-span-2"
                                    />
                                </div>

                                <p className="mt-4 flex items-start gap-2 rounded-md border border-parkea-200 bg-parkea-50 px-3 py-2.5 text-caption text-parkea-700">
                                    <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                    La información se usa únicamente para esta transacción de prueba.
                                </p>
                                <p className="mt-2 text-caption text-neutral-600">
                                    Para simular un pago rechazado, usa la tarjeta{' '}
                                    <span className="whitespace-nowrap font-mono">{DECLINE_TEST_NUMBER}</span>.
                                </p>
                            </div>
                        ) : (
                            <p className="mt-6 flex items-start gap-2 rounded-md border border-parkea-200 bg-parkea-50 px-3 py-2.5 text-caption text-parkea-700">
                                <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                Con PSE no necesitas ingresar datos. Al confirmar, el pago se aprueba de forma simulada.
                            </p>
                        )}
                    </section>

                    {/* AC-01/AC-07, section 2: reservation summary */}
                    <div className="flex flex-col gap-6">
                        <section aria-labelledby="summary-title" className={CARD}>
                            <h2 id="summary-title" className="text-subtitle-sm text-parkea-700">
                                Resumen de la reserva
                            </h2>

                            <dl className="mt-2">
                                <SummaryItem label="Código de reserva">
                                    <span className="break-all font-mono">{reservation.id}</span>
                                </SummaryItem>
                                <SummaryItem label="Zona">
                                    {zone.name}
                                    {zone.address && <span className="block text-caption text-neutral-600">{zone.address}</span>}
                                </SummaryItem>
                                <SummaryItem label="Cupo asignado" groupStart>
                                    <span className="font-mono">{reservation.spotNumber}</span>
                                </SummaryItem>
                                <SummaryItem label="Vehículo">
                                    <span className="font-mono">
                                        {vehicle.plate} - {vehicle.brand} {vehicle.model} - {vehicle.color}
                                    </span>
                                </SummaryItem>
                                <SummaryItem label="Fecha y hora de entrada">
                                    {formatDate(reservation.startTime)}, {formatTime(reservation.startTime)}
                                </SummaryItem>
                                <SummaryItem label="Fecha y hora de salida">
                                    {formatDate(reservation.endTime)}, {formatTime(reservation.endTime)}
                                </SummaryItem>
                                <SummaryItem label="Duración">
                                    {formatDuration(reservation.startTime, reservation.endTime)}
                                </SummaryItem>
                                <SummaryItem label="Tarifa por hora" groupStart>
                                    <span className="font-mono">{formatCurrency(paymentSummary.hourlyRate)}</span>
                                </SummaryItem>
                                <div className="flex items-center justify-between gap-3 pb-3">
                                    <dt className="text-body text-neutral-900">Total a pagar</dt>
                                    <dd className="whitespace-nowrap font-mono text-title font-bold text-neutral-900">
                                        {formatCurrency(total)}
                                    </dd>
                                </div>
                                <div className="flex items-center justify-between gap-3 border-t border-neutral-100 pt-3">
                                    <dt className="text-caption text-neutral-500">Estado</dt>
                                    <dd>
                                        <span className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption font-medium ${pendingStatus.badge}`}>
                                            <pendingStatus.Icon className="h-3.5 w-3.5" aria-hidden="true" />
                                            {pendingStatus.label}
                                        </span>
                                    </dd>
                                </div>
                            </dl>
                        </section>

                        {remainingMs !== null && (
                            <div className="rounded-lg border border-warning/30 bg-warning-soft p-4">
                                {/* AC-08: the timer stays silent; the text change is announced once */}
                                <div aria-live="polite">
                                    <p className="flex items-center gap-1.5 text-label font-medium text-warning">
                                        <Clock className="h-4 w-4 shrink-0" aria-hidden="true" />
                                        {isTimeUp ? 'El tiempo para pagar terminó' : 'Se libera si no pagas'}
                                    </p>
                                </div>
                                {!isTimeUp && (
                                    <p className="mt-1 text-caption text-warning">
                                        Tiempo restante:{' '}
                                        <span role="timer" className="font-mono text-label font-medium">
                                            {formatCountdown(remainingMs)}
                                        </span>
                                    </p>
                                )}
                                <p className="mt-3 text-label font-medium text-warning">Entorno de prueba</p>
                                <p className="text-caption text-warning">Este es un entorno de prueba. Ningún pago real será procesado.</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* AC-16: results inline and announced */}
                {message && (
                    <p
                        ref={messageRef}
                        tabIndex={-1}
                        role={message.type === 'error' ? 'alert' : 'status'}
                        className={`mt-6 flex items-center gap-2 rounded-md px-4 py-3 text-body focus:outline-none ${
                            message.type === 'error' ? 'bg-danger-soft text-danger' : 'bg-parkea-50 font-medium text-parkea-700'
                        }`}
                    >
                        {message.type === 'error' ? (
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        ) : (
                            <CircleCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
                        )}
                        {message.text}
                    </p>
                )}
                {isTimeUp && !message && (
                    <p role="alert" className="mt-6 flex items-center gap-2 rounded-md bg-danger-soft px-4 py-3 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {translateError('RESERVATION_EXPIRED')}
                    </p>
                )}

                {/* AC-09: same columns as the cards; on mobile "Confirmar pago" goes first */}
                <div className="mt-6 grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_400px] lg:gap-6">
                    <button
                        type="button"
                        onClick={goToConfirmation}
                        disabled={processing || approved}
                        className="order-last flex items-center justify-center gap-1.5 rounded-md border border-parkea-600 bg-white px-5 py-2.5 text-label text-parkea-700 transition-colors hover:bg-parkea-50 disabled:cursor-not-allowed disabled:opacity-60 lg:order-none"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Cancelar pago
                    </button>
                    <button
                        type="submit"
                        disabled={payDisabled}
                        className="flex items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <CreditCard className="h-4 w-4" aria-hidden="true" />
                        Confirmar pago
                        <span className="font-mono">{formatCurrency(total)}</span>
                    </button>
                </div>
            </form>

            <p className="mt-8 flex items-center justify-center gap-1.5 border-t border-neutral-200 pt-4 text-center text-caption text-neutral-600">
                <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                Este es un entorno de prueba. Ningún pago real será procesado.
            </p>

            {processing && <ProcessingOverlay amount={total} />}
        </div>
    );
}
