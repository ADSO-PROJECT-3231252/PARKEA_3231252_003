import { useCallback, useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams, Link } from 'react-router-dom';
import {
    AlertCircle,
    ArrowLeft,
    Ban,
    CreditCard,
    Info,
    Landmark,
    RefreshCw,
} from 'lucide-react';
import { getReservation } from '../services/reservationService';
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

const PAGE_SHELL = 'mx-auto w-[92%] max-w-[1800px] px-4 pt-6 pb-4 sm:px-6';
const CARD = 'rounded-lg border border-neutral-200 bg-white p-6';
const OUTLINE_BUTTON_SM =
    'flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600';

// groupStart draws the line that separates the groups of the mockup.
function SummaryItem({ label, children, groupStart = false }) {
    return (
        <div className={`py-3 ${groupStart ? 'border-t border-neutral-100' : ''}`}>
            <dt className="text-caption text-neutral-500">{label}</dt>
            <dd className="mt-0.5 break-words text-body text-neutral-900">{children}</dd>
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

    const fetchReservation = useCallback(() => {
        getReservation(id)
            .then(({ data }) => {
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

    const handleRetry = () => {
        setLoading(true);
        setLoadError(false);
        fetchReservation();
    };

    // AC-09: back to the confirmation without touching the reservation.
    const goToConfirmation = () => navigate(`/reservations/${id}`);

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
    if (reservation.status === 'Active') {
        return <Navigate to={`/reservations/${reservation.id}`} replace state={{ flash: 'alreadyPaid' }} />;
    }

    // Expired, Cancelled or Finished: nothing left to pay.
    if (reservation.status !== 'Pending') {
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

    return (
        <div className={PAGE_SHELL}>
            <h1 className="text-title font-display uppercase text-neutral-900">Pago de reserva</h1>
            <p className="mt-1 text-body text-neutral-600">Completa el pago para confirmar tu reserva.</p>

            <div className="mt-6">
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
                                                onChange={() => setMethod(value)}
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
                    </div>
                </div>

                {/* AC-09: back to the confirmation without touching the reservation */}
                <div className="mt-6">
                    <button
                        type="button"
                        onClick={goToConfirmation}
                        className="flex items-center justify-center gap-1.5 rounded-md border border-parkea-600 bg-white px-5 py-2.5 text-label text-parkea-700 transition-colors hover:bg-parkea-50"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Cancelar pago
                    </button>
                </div>
            </div>
        </div>
    );
}