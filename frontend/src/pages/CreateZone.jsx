import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Save, Info } from 'lucide-react';
import { createZone } from '../services/zoneService';
import { formatCurrency } from '../utils/format';
import {
    ZONE_LIMITS,
    ZONE_FIELDS,
    EMPTY_ZONE_FORM,
    onlyDigits,
    cleanCoordinate,
    parseCoordinatePair,
    formatCoordinate,
    getValidPosition,
    validateZoneForm,
    buildZonePayload,
    mapZoneApiError,
} from '../utils/zoneForm';
import LocationPicker from '../components/LocationPicker';

const inputClass = (hasError) =>
    `w-full rounded-md border bg-white px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-400 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${hasError ? 'border-danger' : 'border-neutral-200'}`;

// Label, input and one line under it: the hint, or the error in its place.
// The input gets aria-describedby with whichever line is showing.
function Field({ id, label, hint, error, children }) {
    const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
    return (
        <div>
            <label htmlFor={id} className="block text-label text-neutral-900">
                {label} <span className="text-danger" aria-hidden="true">*</span>
            </label>
            <div className="mt-1">{children({ 'aria-describedby': describedBy, 'aria-invalid': Boolean(error) })}</div>
            {error ? (
                <p id={`${id}-error`} role="alert" className="mt-1 text-caption text-danger">
                    {error}
                </p>
            ) : (
                hint && (
                    <p id={`${id}-hint`} className="mt-1 text-caption text-neutral-600">
                        {hint}
                    </p>
                )
            )}
        </div>
    );
}

export default function CreateZone() {
    const navigate = useNavigate();

    const [form, setForm] = useState(EMPTY_ZONE_FORM);
    const [errors, setErrors] = useState({});
    const [serverError, setServerError] = useState('');
    const [saving, setSaving] = useState(false);
    // Grows when the coordinates were typed or pasted, so the map moves to them
    const [focusKey, setFocusKey] = useState(0);

    const fieldRefs = useRef({});
    const serverErrorRef = useRef(null);
    const pendingFocus = useRef(null);

    // AC-06 / AC-11: after a failed save, the first field with an error gets
    // the focus, once its message is on screen.
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

    // AC-05: a click on the map (or dragging the pin) fills both coordinates.
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

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (saving) return;
        setServerError('');

        const newErrors = validateZoneForm(form);
        if (Object.keys(newErrors).length > 0) {
            pendingFocus.current = ZONE_FIELDS.find((f) => newErrors[f]);
            setErrors(newErrors);
            return;
        }

        setSaving(true);
        try {
            const { data } = await createZone(buildZonePayload(form));
            // AC-09: back to the list, which shows the confirmation and the new zone
            navigate('/admin/zones', { state: { zoneCreated: { id: data.zone.id, name: data.zone.name } } });
        } catch (err) {
            const { fields, general } = mapZoneApiError(err);
            if (fields) {
                pendingFocus.current = ZONE_FIELDS.find((f) => fields[f]);
                setErrors(fields);
            } else {
                pendingFocus.current = 'server';
                setServerError(general);
            }
            setSaving(false);
        }
    };

    // AC-07: discards what was typed and goes back to the list
    const handleCancel = () => navigate('/admin/zones');

    const fieldRef = (name) => (el) => {
        fieldRefs.current[name] = el;
    };

    const rate = form.hourlyRate === '' ? null : Number(form.hourlyRate);

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="text-title font-display uppercase text-neutral-900">Crear zona</h1>
            <p className="mt-1 text-body text-neutral-600">
                Registra una nueva zona de parqueo en el sistema. Los campos marcados con{' '}
                <span className="text-danger" aria-hidden="true">*</span>
                <span className="sr-only">asterisco</span> son obligatorios.
            </p>

            <form onSubmit={handleSubmit} noValidate className="mt-6 rounded-lg border border-neutral-200 bg-white">
                {serverError && (
                    <p
                        ref={serverErrorRef}
                        tabIndex={-1}
                        role="alert"
                        className="mx-5 mt-5 rounded-md bg-danger-soft px-3 py-2 text-center text-caption text-danger focus:outline-none sm:mx-8 sm:mt-8"
                    >
                        {serverError}
                    </p>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-2">
                    {/* AC-01: zone details */}
                    <div className="space-y-5 p-5 sm:p-8">
                        <Field
                            id="name"
                            label="Nombre de la zona"
                            hint="Nombre con el que los usuarios verán la zona. No puede repetirse."
                            error={errors.name}
                        >
                            {(a11y) => (
                                <input
                                    ref={fieldRef('name')}
                                    id="name"
                                    type="text"
                                    required
                                    maxLength={ZONE_LIMITS.name}
                                    value={form.name}
                                    onChange={(e) => setField('name', e.target.value)}
                                    placeholder="Ej. Parque Central"
                                    autoComplete="off"
                                    className={inputClass(errors.name)}
                                    {...a11y}
                                />
                            )}
                        </Field>

                        <Field
                            id="address"
                            label="Dirección"
                            hint="Dirección exacta de la zona de parqueo."
                            error={errors.address}
                        >
                            {(a11y) => (
                                <input
                                    ref={fieldRef('address')}
                                    id="address"
                                    type="text"
                                    required
                                    maxLength={ZONE_LIMITS.address}
                                    value={form.address}
                                    onChange={(e) => setField('address', e.target.value)}
                                    placeholder="Ej. Carrera 15 #36-20, Dosquebradas"
                                    autoComplete="off"
                                    className={inputClass(errors.address)}
                                    {...a11y}
                                />
                            )}
                        </Field>

                        {/* AC-03: whole number from 1 to 500 */}
                        <Field
                            id="totalSlots"
                            label="Capacidad total"
                            hint={`Número total de cupos de la zona, entre 1 y ${ZONE_LIMITS.maxSlots}.`}
                            error={errors.totalSlots}
                        >
                            {(a11y) => (
                                <input
                                    ref={fieldRef('totalSlots')}
                                    id="totalSlots"
                                    type="text"
                                    inputMode="numeric"
                                    required
                                    maxLength={3}
                                    value={form.totalSlots}
                                    onChange={(e) => setField('totalSlots', onlyDigits(e.target.value))}
                                    placeholder="Ej. 30"
                                    autoComplete="off"
                                    className={`${inputClass(errors.totalSlots)} font-mono placeholder:font-sans`}
                                    {...a11y}
                                />
                            )}
                        </Field>

                        {/* AC-04: zero or more, in whole pesos */}
                        <Field
                            id="hourlyRate"
                            label="Tarifa por hora (COP)"
                            hint={
                                rate === null
                                    ? 'Valor en pesos que se cobrará por cada hora de parqueo.'
                                    : `Se cobrarán ${formatCurrency(rate)} por cada hora de parqueo.`
                            }
                            error={errors.hourlyRate}
                        >
                            {(a11y) => (
                                <div
                                    className={`flex overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-parkea-600 ${errors.hourlyRate ? 'border-danger' : 'border-neutral-200'}`}
                                >
                                    <span
                                        className="flex items-center border-r border-neutral-200 bg-neutral-50 px-3 text-body text-neutral-600"
                                        aria-hidden="true"
                                    >
                                        $
                                    </span>
                                    <input
                                        ref={fieldRef('hourlyRate')}
                                        id="hourlyRate"
                                        type="text"
                                        inputMode="numeric"
                                        required
                                        maxLength={ZONE_LIMITS.rateDigits}
                                        value={form.hourlyRate}
                                        onChange={(e) => setField('hourlyRate', onlyDigits(e.target.value))}
                                        placeholder="Ej. 2000"
                                        autoComplete="off"
                                        className="w-full min-w-0 px-3 py-2.5 font-mono text-body text-neutral-900 placeholder:font-sans placeholder:text-neutral-400 focus:outline-none"
                                        {...a11y}
                                    />
                                </div>
                            )}
                        </Field>
                    </div>

                    {/* AC-05: coordinates, typed or picked on the map */}
                    <fieldset className="min-w-0 border-t border-neutral-200 p-5 sm:p-8 lg:border-l lg:border-t-0">
                        <legend className="float-left w-full text-subtitle font-display uppercase text-neutral-900">
                            Coordenadas <span className="text-danger" aria-hidden="true">*</span>
                        </legend>
                        <p className="clear-both pt-1 text-body text-neutral-600">
                            Haz clic en el mapa para ubicar la zona o escribe las coordenadas.
                        </p>

                        <div className="mt-4 grid grid-cols-1 gap-x-4 gap-y-5 sm:grid-cols-2">
                            <Field id="latitude" label="Latitud" error={errors.latitude}>
                                {(a11y) => (
                                    <input
                                        ref={fieldRef('latitude')}
                                        id="latitude"
                                        type="text"
                                        inputMode="decimal"
                                        required
                                        maxLength={20}
                                        value={form.latitude}
                                        onChange={(e) => setField('latitude', cleanCoordinate(e.target.value))}
                                        onPaste={handleCoordinatePaste}
                                        onBlur={() => setFocusKey((k) => k + 1)}
                                        placeholder="Ej. 4.8284"
                                        autoComplete="off"
                                        className={`${inputClass(errors.latitude)} font-mono placeholder:font-sans`}
                                        {...a11y}
                                    />
                                )}
                            </Field>
                            <Field id="longitude" label="Longitud" error={errors.longitude}>
                                {(a11y) => (
                                    <input
                                        ref={fieldRef('longitude')}
                                        id="longitude"
                                        type="text"
                                        inputMode="decimal"
                                        required
                                        maxLength={20}
                                        value={form.longitude}
                                        onChange={(e) => setField('longitude', cleanCoordinate(e.target.value))}
                                        onPaste={handleCoordinatePaste}
                                        onBlur={() => setFocusKey((k) => k + 1)}
                                        placeholder="Ej. -75.6912"
                                        autoComplete="off"
                                        className={`${inputClass(errors.longitude)} font-mono placeholder:font-sans`}
                                        {...a11y}
                                    />
                                )}
                            </Field>
                        </div>

                        <div className="mt-4">
                            <LocationPicker position={position} onPick={handlePick} focusKey={focusKey} />
                        </div>

                        <div className="mt-4 flex items-start gap-3 rounded-md border border-parkea-100 bg-parkea-50 px-4 py-3">
                            <Info className="mt-0.5 h-4 w-4 shrink-0 text-parkea-600" aria-hidden="true" />
                            <div>
                                <p className="text-label text-neutral-900">Consejo</p>
                                <p className="mt-0.5 text-caption text-neutral-700">
                                    Arrastra el marcador para ajustar la ubicación. Si copiaste las coordenadas de Google
                                    Maps, pégalas en Latitud y se llenan los dos campos.
                                </p>
                            </div>
                        </div>
                    </fieldset>
                </div>

                {/* AC-07: cancel and save */}
                <div className="flex flex-col-reverse gap-3 border-t border-neutral-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-8">
                    <button
                        type="button"
                        onClick={handleCancel}
                        className="flex items-center justify-center gap-2 rounded-md border border-danger bg-white px-5 py-2.5 text-label text-danger transition-colors hover:bg-danger-soft"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={saving}
                        className="flex items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        {saving ? 'Guardando…' : 'Guardar zona'}
                    </button>
                </div>
            </form>
        </div>
    );
}
