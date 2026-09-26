import { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import {
    MapPin,
    Banknote,
    Users,
    Calendar,
    Clock,
    Car,
    ChevronDown,
    ArrowLeft,
    CalendarCheck,
    AlertCircle,
    RefreshCw,
    Info,
} from 'lucide-react';
import { getZone } from '../services/zoneService';
import { getVehicles } from '../services/vehicleService';
import { createReservation } from '../services/reservationService';
import { formatCurrency, formatDuration } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';
import { isNotEmpty } from '../utils/validators';
import { translateError } from '../utils/errorMessages';

// Same palette used by Zones.jsx's ZoneCard badge, reused here so the
// availability badge looks identical across both screens.
const BADGE_CLASSES = {
    full: 'bg-danger-soft text-danger',
    almost: 'bg-warning-soft text-warning',
    available: 'bg-parkea-50 text-parkea-600',
};

const MAX_ADVANCE_HOURS = 48; // AC-19
const MIN_DURATION_MINUTES = 30; // AC-07
const MAX_DURATION_MINUTES = 24 * 60; // AC-07

function combineDateTime(date, time) {
    if (!date || !time) return null;
    const d = new Date(`${date}T${time}`);
    return Number.isNaN(d.getTime()) ? null : d;
}

export default function ReserveSpot() {
    const { zoneId } = useParams();
    const navigate = useNavigate();

    const [zone, setZone] = useState(null);
    const [zoneLoading, setZoneLoading] = useState(true);
    const [zoneError, setZoneError] = useState(false);

    const [vehicles, setVehicles] = useState([]);
    const [vehiclesLoading, setVehiclesLoading] = useState(true);
    const [vehiclesError, setVehiclesError] = useState(false);

    const [form, setForm] = useState({
        vehicleId: '',
        startDate: '',
        startTime: '',
        endDate: '',
        endTime: '',
    });
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [submitting, setSubmitting] = useState(false);


    const fetchZone = useCallback(() => {
        getZone(zoneId)
            .then(({ data }) => {
                setZone(data.zone);
                setZoneError(false);
            })
            .catch(() => setZoneError(true))
            .finally(() => setZoneLoading(false));
    }, [zoneId]);

    const fetchVehicleList = useCallback(() => {
        getVehicles()
            .then(({ data }) => {
                setVehicles(data.vehicles);
                setVehiclesError(false);
                // AC-03: the list already comes with the default vehicle first
                // no need to search for isDefault manually.
                if (data.vehicles.length > 0) {
                    setForm((prev) => ({ ...prev, vehicleId: data.vehicles[0].id }));
                }
            })
            .catch(() => setVehiclesError(true))
            .finally(() => setVehiclesLoading(false));
    }, []);

    useEffect(() => {
        fetchZone();
        fetchVehicleList();
    }, [fetchZone, fetchVehicleList]);

    // Same handleRetry pattern already used in VehicleList.jsx: the reset
    // (loading=true, error=false) lives here, in the click handler, never
    // synchronously inside the effect itself, which is what triggered the
    // "setState synchronously within an effect" warning.
    const handleRetryZone = () => {
        setZoneLoading(true);
        setZoneError(false);
        fetchZone();
    };

    const handleRetryVehicles = () => {
        setVehiclesLoading(true);
        setVehiclesError(false);
        fetchVehicleList();
    };


    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    const startDateTime = combineDateTime(form.startDate, form.startTime);
    const endDateTime = combineDateTime(form.endDate, form.endTime);

    // AC-09/AC-10: only compute duration/cost once both ends form a valid range
    // otherwise showing a number here would be meaningless.
    const hasValidRange = Boolean(startDateTime && endDateTime && endDateTime > startDateTime);
    let durationLabel = '';
    let estimatedCost = 0;
    let hoursLabel = '';

    if (hasValidRange && zone) {
        durationLabel = formatDuration(startDateTime, endDateTime);
        const totalMinutes = Math.round((endDateTime - startDateTime) / 60000);
        const hoursDecimal = totalMinutes / 60;
        estimatedCost = Math.round(hoursDecimal * Number(zone.hourlyRate));
        hoursLabel = Number.isInteger(hoursDecimal) ? String(hoursDecimal) : hoursDecimal.toFixed(1);
    }

    const validate = () => {
        const newErrors = {};
        const now = new Date();

        if (!isNotEmpty(form.vehicleId)) {
            newErrors.vehicle = 'Este campo es obligatorio.';
        }

        if (!startDateTime) {
            newErrors.start = 'Este campo es obligatorio.';
        } else if (startDateTime <= now) {
            newErrors.start = translateError('START_TIME_IN_PAST');
        } else if (startDateTime - now > MAX_ADVANCE_HOURS * 60 * 60 * 1000) {
            newErrors.start = translateError('RESERVATION_TOO_FAR_AHEAD');
        }

        if (!endDateTime) {
            newErrors.end = 'Este campo es obligatorio.';
        } else if (startDateTime && endDateTime <= startDateTime) {
            newErrors.end = translateError('END_BEFORE_START');
        } else if (startDateTime) {
            const totalMinutes = Math.round((endDateTime - startDateTime) / 60000);
            if (totalMinutes < MIN_DURATION_MINUTES || totalMinutes > MAX_DURATION_MINUTES) {
                newErrors.end = translateError('INVALID_DURATION');
            }
        }

        setErrors(newErrors);
        return Object.keys(newErrors).length === 0;
    };


    const handleSubmit = async (e) => {
        e.preventDefault();
        setServerError('');
        if (!validate()) return;

        setSubmitting(true);
        try {
            const { data } = await createReservation({
                zoneId,
                vehicleId: form.vehicleId,
                startTime: startDateTime.toISOString(),
                endTime: endDateTime.toISOString(),
            });
            // AC-12: redirect to the confirmation screen (HU-15).
            navigate(`/reservations/${data.reservation.id}`);
        } catch (err) {
            const code = err.response?.data?.code;
            // AC-08/AC-14: these are only detectable server-side (need the vehicle's
            // other reservations, or a live lock on the zone's spots) the client
            // validation above can never catch them on its own.
            if (code === 'START_TIME_IN_PAST' || code === 'RESERVATION_TOO_FAR_AHEAD') {
                setErrors((prev) => ({ ...prev, start: translateError(code) }));
            } else if (code === 'END_BEFORE_START' || code === 'INVALID_DURATION') {
                setErrors((prev) => ({ ...prev, end: translateError(code) }));
            } else if (code === 'VEHICLE_RESERVATION_OVERLAP' || code === 'VEHICLE_NOT_FOUND') {
                setErrors((prev) => ({ ...prev, vehicle: translateError(code) }));
            } else {
                // NO_SPOTS_AVAILABLE (AC-14), ZONE_NOT_FOUND, ZONE_INACTIVE,
                // MISSING_REQUIRED_FIELDS, or anything else generic banner.
                setServerError(translateError(code));
            }
        } finally {
            setSubmitting(false);
        }
    };

    const handleBack = () => navigate('/zones'); // AC-11: explicit route, not navigate(-1)


    if (zoneLoading || vehiclesLoading) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <p role="status" aria-live="polite" className="text-body text-neutral-600">
                    Cargando…
                </p>
            </div>
        );
    }

    if (zoneError || !zone) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft p-5">
                    <p className="flex items-center gap-2 text-body text-danger">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        No pudimos cargar esta zona.
                    </p>
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={handleRetryZone}
                            className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-white"
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reintentar
                        </button>
                        <Link
                            to="/zones"
                            className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                        >
                            Volver a zonas
                        </Link>
                    </div>
                </div>
            </div>
        );
    }


    const availability = getZoneAvailability(zone.availableSlots, zone.totalSlots);

    // AC-04: no vehicles at all block the flow entirely, don't render the form.
    if (!vehiclesError && vehicles.length === 0) {
        return (
            <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
                <h1 className="text-title font-display uppercase text-neutral-900">Reservar cupo</h1>
                <div className="mt-6 flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                    <p className="text-body text-neutral-600">
                        Necesitas registrar un vehículo antes de hacer una reserva.
                    </p>
                    <Link
                        to="/vehicles/new"
                        className="flex items-center gap-2 rounded-md bg-parkea-600 px-4 py-2 text-label text-white transition-colors hover:bg-parkea-700"
                    >
                        <Car className="h-4 w-4" aria-hidden="true" />
                        Registrar vehículo
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="text-title font-display uppercase text-neutral-900">Reservar cupo</h1>
            <p className="mt-1 text-body text-neutral-600">Completa la información para asegurar tu cupo de parqueo.</p>

            {/* AC-01: zone context, read-only */}
            <div className="mt-6 flex flex-col gap-4 rounded-lg border border-neutral-200 bg-white p-5 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-start gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                        <MapPin className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div className="min-w-0">
                        <h2 className="break-words text-subtitle-sm font-display uppercase text-neutral-900">{zone.name}</h2>
                        {zone.address && <p className="break-words text-body text-neutral-600">{zone.address}</p>}
                        <div className="mt-1.5 flex flex-wrap items-center gap-2">
                            <span className={`rounded-full px-2.5 py-1 text-label font-medium ${BADGE_CLASSES[availability.state]}`}>
                                {availability.text}
                            </span>
                            <span className="flex flex-wrap items-center gap-1 text-body text-neutral-600">
                                <Users className="h-3.5 w-3.5 shrink-0 text-neutral-500" aria-hidden="true" />
                                <span className="font-mono tabular-nums">{zone.availableSlots}</span>
                                <span>de</span>
                                <span className="font-mono tabular-nums">{zone.totalSlots}</span>
                                <span>cupos disponibles</span>
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex shrink-0 items-center gap-3 sm:border-l sm:border-neutral-200 sm:pl-6">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-parkea-600">
                        <Banknote className="h-5 w-5" aria-hidden="true" />
                    </span>
                    <div>
                        <p className="text-caption text-neutral-500">Tarifa por hora</p>
                        <p className="font-mono text-subtitle-sm text-neutral-900">{formatCurrency(zone.hourlyRate)}</p>
                    </div>
                </div>
            </div>


            <form onSubmit={handleSubmit} noValidate className="mt-6 w-full rounded-lg border border-neutral-200 bg-white p-8">
                <h3 className="text-body font-medium text-neutral-900">Información de la reserva</h3>
                <div className="mt-4 border-t border-neutral-100" />

                <div className="mt-6 space-y-6">
                    {vehiclesError && (
                        <div role="alert" className="flex items-center justify-between gap-3 rounded-md bg-danger-soft px-3 py-2">
                            <p className="text-caption text-danger">No pudimos cargar tus vehículos.</p>
                            <button
                                type="button"
                                onClick={handleRetryVehicles}
                                className="flex items-center gap-1.5 rounded-md border border-danger px-2.5 py-1 text-caption text-danger transition-colors hover:bg-white"
                            >
                                <RefreshCw className="h-3 w-3" aria-hidden="true" />
                                Reintentar
                            </button>
                        </div>
                    )}

                    {/* AC-02/AC-03: vehicle selector */}
                    <div>
                        <label htmlFor="vehicleId" className="block text-label text-neutral-700">
                            Vehículo <span className="text-danger">*</span>
                        </label>
                        <div className="relative mt-1">
                            <Car className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parkea-600" aria-hidden="true" />
                            <select
                                id="vehicleId"
                                name="vehicleId"
                                value={form.vehicleId}
                                onChange={handleChange}
                                aria-invalid={Boolean(errors.vehicle)}
                                aria-describedby={errors.vehicle ? 'vehicleId-error' : undefined}
                                className={`w-full appearance-none rounded-md border bg-white py-2.5 pl-9 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.vehicle ? 'border-danger' : 'border-neutral-200'
                                    }`}
                            >
                                {vehicles.map((v) => (
                                    <option key={v.id} value={v.id}>
                                        {v.plate} - {v.brand} {v.model} - {v.color}
                                        {v.isDefault ? ' (Predeterminado)' : ''}
                                    </option>
                                ))}
                            </select>
                            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
                        </div>
                        {errors.vehicle ? (
                            <p id="vehicleId-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.vehicle}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">Este vehículo se usará para tu reserva.</p>
                        )}
                    </div>

                    {/* AC-02/AC-05/AC-19: start date + time */}
                    <div>
                        <span className="block text-label text-neutral-700">
                            Fecha y hora de entrada <span className="text-danger">*</span>
                        </span>
                        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="relative">
                                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parkea-600" aria-hidden="true" />
                                <label htmlFor="startDate" className="sr-only">
                                    Fecha de entrada
                                </label>
                                <input
                                    id="startDate"
                                    name="startDate"
                                    type="date"
                                    value={form.startDate}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.start)}
                                    aria-describedby={errors.start ? 'start-error' : undefined}
                                    className={`w-full rounded-md border py-2.5 pl-9 pr-3 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.start ? 'border-danger' : 'border-neutral-200'
                                        }`}
                                />
                            </div>
                            <div className="relative">
                                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parkea-600" aria-hidden="true" />
                                <label htmlFor="startTime" className="sr-only">
                                    Hora de entrada
                                </label>
                                <input
                                    id="startTime"
                                    name="startTime"
                                    type="time"
                                    value={form.startTime}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.start)}
                                    aria-describedby={errors.start ? 'start-error' : undefined}
                                    className={`w-full rounded-md border py-2.5 pl-9 pr-3 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.start ? 'border-danger' : 'border-neutral-200'
                                        }`}
                                />
                            </div>
                        </div>
                        {errors.start ? (
                            <p id="start-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.start}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">Selecciona cuándo vas a ingresar al parqueadero.</p>
                        )}
                    </div>


                    {/* AC-02/AC-06/AC-07: end date + time */}
                    <div>
                        <span className="block text-label text-neutral-700">
                            Fecha y hora de salida <span className="text-danger">*</span>
                        </span>
                        <div className="mt-1 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="relative">
                                <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parkea-600" aria-hidden="true" />
                                <label htmlFor="endDate" className="sr-only">
                                    Fecha de salida
                                </label>
                                <input
                                    id="endDate"
                                    name="endDate"
                                    type="date"
                                    value={form.endDate}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.end)}
                                    aria-describedby={errors.end ? 'end-error' : undefined}
                                    className={`w-full rounded-md border py-2.5 pl-9 pr-3 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.end ? 'border-danger' : 'border-neutral-200'
                                        }`}
                                />
                            </div>
                            <div className="relative">
                                <Clock className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-parkea-600" aria-hidden="true" />
                                <label htmlFor="endTime" className="sr-only">
                                    Hora de salida
                                </label>
                                <input
                                    id="endTime"
                                    name="endTime"
                                    type="time"
                                    value={form.endTime}
                                    onChange={handleChange}
                                    aria-invalid={Boolean(errors.end)}
                                    aria-describedby={errors.end ? 'end-error' : undefined}
                                    className={`w-full rounded-md border py-2.5 pl-9 pr-3 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${errors.end ? 'border-danger' : 'border-neutral-200'
                                        }`}
                                />
                            </div>
                        </div>
                        {errors.end ? (
                            <p id="end-error" role="alert" className="mt-1 text-caption text-danger">
                                {errors.end}
                            </p>
                        ) : (
                            <p className="mt-1 text-caption text-neutral-500">Selecciona cuándo planeas salir del parqueadero.</p>
                        )}
                    </div>

                    {/* AC-09/AC-10: real-time duration + cost, hidden until the range is valid */}
                    {hasValidRange && (
                        <div className="rounded-lg bg-parkea-50 p-5">
                            <h4 className="text-label font-medium uppercase text-parkea-700">Resumen de la reserva</h4>
                            <div className="mt-3 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-parkea-600">
                                        <Clock className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-caption text-neutral-500">Duración</p>
                                        <p className="break-words text-body font-medium text-neutral-900">{durationLabel}</p>
                                    </div>
                                </div>
                                <div className="flex min-w-0 items-center gap-3">
                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-parkea-600">
                                        <Banknote className="h-4 w-4" aria-hidden="true" />
                                    </span>
                                    <div className="min-w-0">
                                        <p className="text-caption text-neutral-500">Costo total estimado</p>
                                        <p className="font-mono text-body font-medium text-neutral-900">{formatCurrency(estimatedCost)}</p>
                                        <p className="text-caption text-neutral-500">
                                            (Tarifa: {formatCurrency(zone.hourlyRate)} x {hoursLabel} {hoursLabel === '1' ? 'hora' : 'horas'})
                                        </p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}

                    <p className="flex items-center gap-1.5 text-caption text-neutral-500">
                        <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        El costo final puede variar según el tiempo real de uso.
                    </p>

                    {serverError && (
                        <p role="alert" className="rounded-md bg-danger-soft px-3 py-2 text-center text-caption text-danger">
                            {serverError}
                        </p>
                    )}
                </div>

                <div className="mt-8 flex items-center justify-between border-t border-neutral-200 pt-6">
                    <button
                        type="button"
                        onClick={handleBack}
                        className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-5 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                    >
                        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                        Volver a zonas
                    </button>
                    <button
                        type="submit"
                        disabled={submitting}
                        className="flex items-center gap-2 rounded-md bg-parkea-600 px-5 py-2 text-label text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <CalendarCheck className="h-4 w-4" aria-hidden="true" />
                        {submitting ? 'Reservando…' : 'Reservar cupo'}
                    </button>
                </div>
            </form>
        </div>
    );
}
