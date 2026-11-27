import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ZONE_FIELDS,
    EMPTY_ZONE_FORM,
    parseCoordinatePair,
    formatCoordinate,
    getValidPosition,
    validateZoneCoordinates,
    mapZoneApiError,
    dayField,
    typeField,
    suggestedRate,
} from '../utils/zoneForm';
import { DAYS } from '../utils/zoneHours';

// State of the zone form, shared by create (HU-20) and edit (HU-21): the
// values, the error of each field, the error that has no field, and the link
// between the coordinate fields and the map.
export default function useZoneForm(initialForm = EMPTY_ZONE_FORM) {
    const [form, setForm] = useState(initialForm);
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    // Grows when the coordinates were typed or pasted, so the map moves to them
    const [focusKey, setFocusKey] = useState(0);

    const fieldRefs = useRef({});
    const serverErrorRef = useRef(null);
    const pendingFocus = useRef(null);

    // HU-20 AC-06 / AC-11: after a failed save, the first field with an error
    // gets the focus, once its message is on screen.
    useEffect(() => {
        if (!pendingFocus.current) return;
        const target = pendingFocus.current === 'server' ? serverErrorRef.current : fieldRefs.current[pendingFocus.current];
        pendingFocus.current = null;
        target?.focus();
    }, [errors, serverError]);

    const position = useMemo(() => getValidPosition(form.latitude, form.longitude), [form.latitude, form.longitude]);

    // A field's error goes away as soon as it is edited.
    const clearErrors = useCallback((...fields) => {
        setErrors((prev) => {
            if (!fields.some((f) => prev[f])) return prev;
            const next = { ...prev };
            for (const f of fields) delete next[f];
            return next;
        });
    }, []);

    const revalidateCoordinateErrors = (latitude, longitude) => {
        setErrors((prev) => {
            if (!prev.latitude && !prev.longitude) return prev;

            const next = { ...prev };
            delete next.latitude;
            delete next.longitude;
            return { ...next, ...validateZoneCoordinates(latitude, longitude) };
        });
    };

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));

        if (name !== 'latitude' && name !== 'longitude') {
            clearErrors(name);
            return;
        }

        const latitude = name === 'latitude' ? value : form.latitude;
        const longitude = name === 'longitude' ? value : form.longitude;
        revalidateCoordinateErrors(latitude, longitude);
    };

    // HU-31 AC-01: checks or unchecks a vehicle type. A type checked without a
    // rate starts with the rate typed for another type; an unchecked type
    // keeps its spots and its rate, so checking it again brings them back.
    const setTypeChecked = (type, checked) => {
        setForm((prev) => {
            const current = prev.vehicleTypes[type];
            const hourlyRate = checked && current.hourlyRate === '' ? suggestedRate(prev, type) : current.hourlyRate;
            return { ...prev, vehicleTypes: { ...prev.vehicleTypes, [type]: { ...current, checked, hourlyRate } } };
        });
        clearErrors('vehicleTypes', typeField(type, 'totalSlots'), typeField(type, 'hourlyRate'));
    };

    // HU-31 AC-01: the spots ("totalSlots") or the rate ("hourlyRate") of a type.
    // Changing the spots of one type can fix the total of the section too.
    const setTypeValue = (type, name, value) => {
        setForm((prev) => ({
            ...prev,
            vehicleTypes: { ...prev.vehicleTypes, [type]: { ...prev.vehicleTypes[type], [name]: value } },
        }));
        clearErrors(typeField(type, name), ...(name === 'totalSlots' ? ['vehicleTypes'] : []));
    };

    // HU-29 AC-01: "Abierta 24 horas" (true) or "Horario personalizado" (false)
    const setOpen24h = (value) => {
        setForm((prev) => ({ ...prev, open24h: value }));
        clearErrors('open24h', 'schedule', ...DAYS.map(dayField));
    };

    // HU-29 AC-02: changes one day of the schedule (open, opensAt, closesAt)
    const setDay = (day, changes) => {
        setForm((prev) => ({
            ...prev,
            schedule: prev.schedule.map((row) => (row.day === day ? { ...row, ...changes } : row)),
        }));
        clearErrors('schedule', dayField(day));
    };

    // HU-29 AC-02: the hours of one day go to every day, all of them open
    const applyToAll = (day) => {
        setForm((prev) => {
            const source = prev.schedule.find((row) => row.day === day);
            return {
                ...prev,
                schedule: prev.schedule.map((row) => ({ ...row, open: true, opensAt: source.opensAt, closesAt: source.closesAt })),
            };
        });
        clearErrors('schedule', ...DAYS.map(dayField));
    };

    // HU-20 AC-05: a click on the map (or dragging the pin) fills both coordinates.
    const handlePick = useCallback((latlng) => {
        setForm((prev) => ({
            ...prev,
            latitude: formatCoordinate(latlng.lat),
            longitude: formatCoordinate(latlng.lng),
        }));
        clearErrors('latitude', 'longitude');
    }, [clearErrors]);

    // "4.8284, -75.6912" pasted in either coordinate fills both.
    const handleCoordinatePaste = (e) => {
        const pair = parseCoordinatePair(e.clipboardData.getData('text'));
        if (!pair) return;
        e.preventDefault();
        setForm((prev) => ({ ...prev, ...pair }));
        revalidateCoordinateErrors(pair.latitude, pair.longitude);
        setFocusKey((k) => k + 1);
    };

    // Leaving a coordinate field moves the map to what was typed.
    const confirmCoordinates = () => setFocusKey((k) => k + 1);

    const fieldRef = (name) => (el) => {
        fieldRefs.current[name] = el;
    };

    // Shows the errors of the form and focuses the first one on screen.
    const showErrors = (newErrors) => {
        pendingFocus.current = ZONE_FIELDS.find((f) => newErrors[f]);
        setErrors(newErrors);
    };

    // Shows a failed save: under its field when it has one, or on top.
    const showApiError = (err) => {
        const { fields, general } = mapZoneApiError(err, form);
        if (fields) {
            showErrors(fields);
        } else {
            pendingFocus.current = 'server';
            setServerError(general);
        }
    };

    return {
        form,
        errors,
        serverError,
        setServerError,
        focusKey,
        position,
        serverErrorRef,
        setField,
        setTypeChecked,
        setTypeValue,
        setOpen24h,
        setDay,
        applyToAll,
        handlePick,
        handleCoordinatePaste,
        confirmCoordinates,
        fieldRef,
        showErrors,
        showApiError,
    };
}
