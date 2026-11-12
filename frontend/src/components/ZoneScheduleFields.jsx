import { useState } from 'react';
import { Clock, CopyCheck } from 'lucide-react';
import { capitalized, dayName, formatHour } from '../utils/zoneHours';
import { dayError, dayField } from '../utils/zoneForm';

// The columns of a day on a wide screen: day, state, opens, closes, button
const ROW_COLUMNS = 'lg:grid-cols-[7rem_9rem_minmax(0,1fr)_minmax(0,1fr)_auto]';

const timeClass = (hasError) =>
    `w-full rounded-md border bg-white px-3 py-2 font-mono text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${hasError ? 'border-danger' : 'border-neutral-200'}`;

// One of the two choices of AC-01, as a card with its radio button
function Choice({ name, value, checked, title, description, onChange, inputRef, describedBy }) {
    const id = `${name}-${value}`;
    return (
        <label
            htmlFor={id}
            className={`flex cursor-pointer items-start gap-3 rounded-md border px-4 py-3 transition-colors ${checked ? 'border-parkea-600 bg-parkea-50' : 'border-neutral-200 bg-white hover:border-parkea-600'}`}
        >
            <input
                ref={inputRef}
                id={id}
                type="radio"
                name={name}
                checked={checked}
                onChange={onChange}
                aria-describedby={describedBy}
                className="mt-1 h-4 w-4 shrink-0 accent-parkea-600"
            />
            <span>
                <span className="block text-label text-neutral-900">{title}</span>
                <span className="mt-0.5 block text-caption text-neutral-600">{description}</span>
            </span>
        </label>
    );
}

// One day of the custom schedule (AC-02): open or closed, its two times and
// the button that applies its hours to every day. On a wide screen the row is
// one line; on a narrower one the day and its state go first, then the two
// times (one under the other on a phone, so "a. m." / "p. m." is never cut)
// and then the button. The wrappers use "contents" on a wide screen, so their
// parts join the columns of the row.
function DayRow({ row, error, onChange, onApplyToAll, fieldRef }) {
    const name = dayName(row.day);
    const id = dayField(row.day);
    const errorId = `${id}-error`;
    // Its hours can be copied once they are valid
    const canApply = row.open && !dayError(row);

    return (
        <li className="border-t border-neutral-200 py-3 first:border-t-0">
            <div className={`grid grid-cols-1 gap-x-3 gap-y-2 lg:items-center ${ROW_COLUMNS}`}>
                <div className="flex items-center justify-between gap-3 lg:contents">
                    <span className="text-label text-neutral-900">{capitalized(name)}</span>
                    <div className="w-36 min-w-0 lg:w-auto">
                        <label htmlFor={`${id}-status`} className="sr-only">
                            {`¿Abre el ${name}?`}
                        </label>
                        <select
                            id={`${id}-status`}
                            value={row.open ? 'open' : 'closed'}
                            onChange={(e) => onChange({ open: e.target.value === 'open' })}
                            className="w-full rounded-md border border-neutral-200 bg-white px-2 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 sm:px-3"
                        >
                            <option value="open">Abierto</option>
                            <option value="closed">Cerrado</option>
                        </select>
                    </div>
                </div>

                {row.open ? (
                    <div className="grid grid-cols-1 gap-x-3 gap-y-2 min-[480px]:grid-cols-2 lg:contents">
                        <div>
                            <label htmlFor={`${id}-opens`} className="block text-caption text-neutral-600 lg:sr-only">
                                {`Abre el ${name}`}
                            </label>
                            <input
                                ref={fieldRef(id)}
                                id={`${id}-opens`}
                                type="time"
                                value={row.opensAt}
                                onChange={(e) => onChange({ opensAt: e.target.value })}
                                aria-invalid={Boolean(error)}
                                aria-describedby={error ? errorId : undefined}
                                className={timeClass(error)}
                            />
                        </div>
                        <div>
                            <label htmlFor={`${id}-closes`} className="block text-caption text-neutral-600 lg:sr-only">
                                {`Cierra el ${name}`}
                            </label>
                            <input
                                id={`${id}-closes`}
                                type="time"
                                value={row.closesAt}
                                onChange={(e) => onChange({ closesAt: e.target.value })}
                                aria-invalid={Boolean(error)}
                                aria-describedby={error ? errorId : undefined}
                                className={timeClass(error)}
                            />
                        </div>
                    </div>
                ) : (
                    <p className="text-body text-neutral-600 lg:col-span-2">Cerrado todo el día</p>
                )}

                <button
                    type="button"
                    onClick={onApplyToAll}
                    disabled={!canApply}
                    aria-label={`Aplicar a todos los días el horario del ${name}`}
                    title={canApply ? undefined : 'Escribe primero las horas de este día'}
                    className="flex items-center justify-center gap-1.5 rounded-md border border-parkea-600 bg-white px-3 py-2 text-label text-parkea-700 transition-colors hover:bg-parkea-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-500 disabled:hover:bg-white"
                >
                    <CopyCheck className="h-4 w-4" aria-hidden="true" />
                    Aplicar a todos
                </button>
            </div>
            {error && (
                <p id={errorId} role="alert" className="mt-1 text-caption text-danger">
                    {error}
                </p>
            )}
        </li>
    );
}

// HU-29: "Horario de atención" of the zone form, shared by create (HU-20)
// and edit (HU-21). zoneForm is what useZoneForm returns; hint is an extra
// line under the choice (the edit screen explains AC-07 there).
export default function ZoneScheduleFields({ zoneForm, hint }) {
    const { form, errors, setOpen24h, setDay, applyToAll, fieldRef } = zoneForm;
    // What "Aplicar a todos" did, announced to screen readers
    const [notice, setNotice] = useState('');

    const handleApplyToAll = (row) => {
        applyToAll(row.day);
        setNotice(
            `Se aplicó el horario del ${dayName(row.day)} (${formatHour(row.opensAt)} a ${formatHour(row.closesAt)}) a todos los días. ` +
                'Cambia a Cerrado los días que no abre.'
        );
    };

    const handleDayChange = (day, changes) => {
        setDay(day, changes);
        setNotice('');
    };

    const choiceDescribedBy = errors.open24h ? 'open24h-error' : hint ? 'open24h-hint' : undefined;

    return (
        <fieldset className="min-w-0 border-t border-neutral-200 p-5 sm:p-8">
            <legend className="float-left w-full text-subtitle font-display uppercase text-neutral-900">
                Horario de atención <span className="text-danger" aria-hidden="true">*</span>
            </legend>
            <p className="clear-both pt-1 text-body text-neutral-600">
                Las horas son de Colombia. Cada reserva debe quedar dentro del horario de su día.
            </p>

            {/* AC-01: neither option is chosen by default */}
            <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
                <Choice
                    name="open24h"
                    value="yes"
                    checked={form.open24h === true}
                    onChange={() => setOpen24h(true)}
                    inputRef={fieldRef('open24h')}
                    describedBy={choiceDescribedBy}
                    title="Abierta 24 horas"
                    description="Se puede reservar a cualquier hora, todos los días."
                />
                <Choice
                    name="open24h"
                    value="no"
                    checked={form.open24h === false}
                    onChange={() => setOpen24h(false)}
                    describedBy={choiceDescribedBy}
                    title="Horario personalizado"
                    description="Eliges qué días abre y a qué horas. El horario no puede pasar de la medianoche."
                />
            </div>
            {errors.open24h ? (
                <p id="open24h-error" role="alert" className="mt-2 text-caption text-danger">
                    {errors.open24h}
                </p>
            ) : (
                hint && (
                    <p id="open24h-hint" className="mt-2 text-caption text-neutral-600">
                        {hint}
                    </p>
                )
            )}

            {/* AC-02: one row per day, Monday to Sunday */}
            {form.open24h === false && (
                <div className="mt-5">
                    <div className={`hidden gap-x-3 pb-2 text-caption text-neutral-600 lg:grid ${ROW_COLUMNS}`}>
                        <span>Día</span>
                        <span>Estado</span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            Abre
                        </span>
                        <span className="flex items-center gap-1">
                            <Clock className="h-3.5 w-3.5" aria-hidden="true" />
                            Cierra
                        </span>
                        <span className="sr-only">Acciones</span>
                    </div>

                    {errors.schedule && (
                        <p ref={fieldRef('schedule')} tabIndex={-1} role="alert" className="mb-2 rounded-md bg-danger-soft px-3 py-2 text-caption text-danger focus:outline-none">
                            {errors.schedule}
                        </p>
                    )}

                    <ul className="rounded-md border border-neutral-200 px-4">
                        {form.schedule.map((row) => (
                            <DayRow
                                key={row.day}
                                row={row}
                                error={errors[dayField(row.day)]}
                                onChange={(changes) => handleDayChange(row.day, changes)}
                                onApplyToAll={() => handleApplyToAll(row)}
                                fieldRef={fieldRef}
                            />
                        ))}
                    </ul>

                    <p role="status" className="mt-2 text-caption text-parkea-700">
                        {notice}
                    </p>
                </div>
            )}
        </fieldset>
    );
}
