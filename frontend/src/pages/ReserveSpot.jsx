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
