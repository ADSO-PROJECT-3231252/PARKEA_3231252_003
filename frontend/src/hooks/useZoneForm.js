import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
    ZONE_FIELDS,
    EMPTY_ZONE_FORM,
    parseCoordinatePair,
    formatCoordinate,
    getValidPosition,
    mapZoneApiError,
} from '../utils/zoneForm';

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

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
        clearErrors(name);
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
        clearErrors('latitude', 'longitude');
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
        const { fields, general } = mapZoneApiError(err);
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
        handlePick,
        handleCoordinatePaste,
        confirmCoordinates,
        fieldRef,
        showErrors,
        showApiError,
    };
}
