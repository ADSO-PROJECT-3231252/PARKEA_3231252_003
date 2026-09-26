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