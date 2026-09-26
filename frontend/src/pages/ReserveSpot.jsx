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
