import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Save } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { ZONE_LIMITS, EMPTY_ZONE_FORM, onlyDigits } from '../utils/zoneForm';

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
    const [errors] = useState({});

    const setField = (name, value) => {
        setForm((prev) => ({ ...prev, [name]: value }));
    };

    // The zone is validated and saved in the next step
    const handleSubmit = (e) => {
        e.preventDefault();
    };

    // AC-07: discards what was typed and goes back to the list
    const handleCancel = () => navigate('/admin/zones');

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
                        className="flex items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                        <Save className="h-4 w-4" aria-hidden="true" />
                        Guardar zona
                    </button>
                </div>
            </form>
        </div>
    );
}
