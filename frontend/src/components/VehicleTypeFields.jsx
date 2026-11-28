import { VEHICLE_TYPES, vehicleTypeLabel, vehicleTypePlural } from '../utils/vehicleTypes';
import { ZONE_LIMITS, onlyDigits, typeField, totalSlotsOf, checkedTypes, zoneInputClass } from '../utils/zoneForm';
import VehicleTypeIcon from './VehicleTypeIcon';
import ZoneField from './ZoneField';

// HU-31 AC-01: the "Tipos de vehículo" section of the zone form. Each type
// has a checkbox; a checked type shows its spots and its rate per hour. The
// total of the checked types is under the list.
//
// hints: the line under the spots ("totalSlots") and the rate ("hourlyRate")
// of each type, and "off" for a type that is unchecked, worded by each
// screen. keepOneChecked (edit, AC-05): the last checked type can't be
// unchecked; to close the zone the administrator deactivates it.
export default function VehicleTypeFields({ zoneForm, hints = {}, keepOneChecked = false }) {
    const { form, errors, setTypeChecked, setTypeValue, fieldRef } = zoneForm;
    const checked = checkedTypes(form);
    const total = totalSlotsOf(form);
    const sectionError = errors.vehicleTypes;

    return (
        <fieldset aria-describedby={sectionError ? 'vehicleTypes-error' : 'vehicleTypes-hint'} className="min-w-0">
            <legend className="text-label text-neutral-900">
                Tipos de vehículo <span className="text-danger" aria-hidden="true">*</span>
            </legend>
            {sectionError ? (
                <p id="vehicleTypes-error" role="alert" className="mt-1 text-caption text-danger">
                    {sectionError}
                </p>
            ) : (
                <p id="vehicleTypes-hint" className="mt-1 text-caption text-neutral-600">
                    Marca los vehículos que recibe la zona, con sus cupos y su tarifa por hora.
                </p>
            )}

            <ul className="mt-3 space-y-3">
                {VEHICLE_TYPES.map((type, i) => {
                    const values = form.vehicleTypes[type];
                    const typeHints = hints[type] ?? {};
                    const locked = keepOneChecked && values.checked && checked.length === 1;
                    const lockedId = `type-${type}-locked`;
                    return (
                        <li
                            key={type}
                            className={`rounded-md border p-4 ${values.checked ? 'border-parkea-600 bg-parkea-50' : 'border-neutral-200 bg-white'}`}
                        >
                            <div className="flex items-center gap-3">
                                <input
                                    // The first checkbox gets the focus when the
                                    // whole section has an error
                                    ref={i === 0 ? fieldRef('vehicleTypes') : undefined}
                                    id={`type-${type}`}
                                    type="checkbox"
                                    checked={values.checked}
                                    onChange={(e) => {
                                        if (!locked) setTypeChecked(type, e.target.checked);
                                    }}
                                    aria-disabled={locked || undefined}
                                    aria-describedby={locked ? lockedId : undefined}
                                    className="h-6 w-6 shrink-0 accent-parkea-600"
                                />
                                <label htmlFor={`type-${type}`} className="flex items-center gap-2 text-body font-medium text-neutral-900">
                                    <VehicleTypeIcon type={type} className="h-5 w-5 text-parkea-600" />
                                    {vehicleTypeLabel(type)}
                                </label>
                            </div>

                            {locked && (
                                <p id={lockedId} className="mt-2 text-caption text-neutral-600">
                                    Es el único tipo que recibe la zona. Para cerrarla, desactiva la zona.
                                </p>
                            )}

                            {values.checked ? (
                                <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
                                    {/* AC-02: whole number from 1 to 500 */}
                                    <ZoneField
                                        id={`${type}-totalSlots`}
                                        label={
                                            <>
                                                Cupos<span className="sr-only"> de {vehicleTypePlural(type)}</span>
                                            </>
                                        }
                                        hint={typeHints.totalSlots}
                                        error={errors[typeField(type, 'totalSlots')]}
                                    >
                                        {(a11y) => (
                                            <input
                                                ref={fieldRef(typeField(type, 'totalSlots'))}
                                                id={`${type}-totalSlots`}
                                                type="text"
                                                inputMode="numeric"
                                                required
                                                maxLength={3}
                                                value={values.totalSlots}
                                                onChange={(e) => setTypeValue(type, 'totalSlots', onlyDigits(e.target.value))}
                                                placeholder="Ej. 20"
                                                autoComplete="off"
                                                className={`${zoneInputClass(errors[typeField(type, 'totalSlots')])} font-mono placeholder:font-sans`}
                                                {...a11y}
                                            />
                                        )}
                                    </ZoneField>

                                    {/* AC-02: more than zero, in whole pesos (#316) */}
                                    <ZoneField
                                        id={`${type}-hourlyRate`}
                                        label={
                                            <>
                                                Tarifa por hora<span className="sr-only"> de {vehicleTypePlural(type)}</span> (COP)
                                            </>
                                        }
                                        hint={typeHints.hourlyRate}
                                        error={errors[typeField(type, 'hourlyRate')]}
                                    >
                                        {(a11y) => (
                                            <div
                                                className={`flex overflow-hidden rounded-md border bg-white focus-within:ring-2 focus-within:ring-parkea-600 ${errors[typeField(type, 'hourlyRate')] ? 'border-danger' : 'border-neutral-200'}`}
                                            >
                                                <span
                                                    className="flex items-center border-r border-neutral-200 bg-neutral-50 px-3 text-body text-neutral-600"
                                                    aria-hidden="true"
                                                >
                                                    $
                                                </span>
                                                <input
                                                    ref={fieldRef(typeField(type, 'hourlyRate'))}
                                                    id={`${type}-hourlyRate`}
                                                    type="text"
                                                    inputMode="numeric"
                                                    required
                                                    maxLength={ZONE_LIMITS.rateDigits}
                                                    value={values.hourlyRate}
                                                    onChange={(e) => setTypeValue(type, 'hourlyRate', onlyDigits(e.target.value))}
                                                    placeholder="Ej. 2000"
                                                    autoComplete="off"
                                                    className="w-full min-w-0 px-3 py-2.5 font-mono text-body text-neutral-900 placeholder:font-sans placeholder:text-neutral-500 focus:outline-none"
                                                    {...a11y}
                                                />
                                            </div>
                                        )}
                                    </ZoneField>
                                </div>
                            ) : (
                                typeHints.off && <p className="mt-2 text-caption text-neutral-600">{typeHints.off}</p>
                            )}
                        </li>
                    );
                })}
            </ul>

            {/* AC-01: the total of the checked types */}
            <p aria-live="polite" className="mt-3 text-label text-neutral-900">
                Total: <span className="font-mono tabular-nums">{total}</span> {total === 1 ? 'cupo' : 'cupos'}
            </p>
        </fieldset>
    );
}
