import { lazy, Suspense } from 'react';
import { Info } from 'lucide-react';
import { ZONE_LIMITS, cleanCoordinate, zoneInputClass as inputClass } from '../utils/zoneForm';
import ZoneScheduleFields from './ZoneScheduleFields';
import VehicleTypeFields from './VehicleTypeFields';
import Field from './ZoneField';

// Leaflet is only downloaded when a zone form opens (like the zones map in
// HU-25), so it doesn't add weight to every other page.
const LocationPicker = lazy(() =>
    import('./LocationPicker').catch(() => ({ default: MapUnavailable })),
);

// If the map code can't be downloaded, the coordinates can still be typed.
function MapUnavailable() {
    return (
        <p role="alert" className="rounded-lg border border-neutral-200 bg-neutral-50 px-6 py-8 text-center text-caption text-neutral-600">
            No pudimos cargar el mapa. Puedes escribir la latitud y la longitud en los campos de arriba.
        </p>
    );
}

// Fields of the zone form, shared by create (HU-20) and edit (HU-21).
// zoneForm is what useZoneForm returns; hints has the line under the name
// and the address, which each screen words for its own case, and optionally
// under the opening hours (HU-29). HU-31: typeHints and keepOneChecked go to
// the section of the vehicle types (VehicleTypeFields).
export default function ZoneFormFields({ zoneForm, hints, typeHints, keepOneChecked = false }) {
    const {
        form,
        errors,
        serverError,
        serverErrorRef,
        focusKey,
        position,
        setField,
        handlePick,
        handleCoordinatePaste,
        confirmCoordinates,
        fieldRef,
    } = zoneForm;

    return (
        <>
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
                {/* HU-20 AC-01: zone details */}
                <div className="space-y-5 p-5 sm:p-8">
                    <Field id="name" label="Nombre de la zona" hint={hints.name} error={errors.name}>
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

                    <Field id="address" label="Dirección" hint={hints.address} error={errors.address}>
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

                    {/* HU-31: the vehicle types, with their spots and rates */}
                    <VehicleTypeFields zoneForm={zoneForm} hints={typeHints} keepOneChecked={keepOneChecked} />
                </div>

                {/* HU-20 AC-05: coordinates, typed or picked on the map */}
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
                                    onBlur={confirmCoordinates}
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
                                    onBlur={confirmCoordinates}
                                    placeholder="Ej. -75.6912"
                                    autoComplete="off"
                                    className={`${inputClass(errors.longitude)} font-mono placeholder:font-sans`}
                                    {...a11y}
                                />
                            )}
                        </Field>
                    </div>

                    <div className="mt-4">
                        <Suspense
                            fallback={
                                <div className="flex h-[280px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100 sm:h-[320px]">
                                    <p role="status" aria-live="polite" className="text-body text-neutral-600">
                                        Cargando mapa…
                                    </p>
                                </div>
                            }
                        >
                            <LocationPicker position={position} onPick={handlePick} focusKey={focusKey} />
                        </Suspense>
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

            {/* HU-29: opening hours */}
            <ZoneScheduleFields zoneForm={zoneForm} hint={hints.schedule} />
        </>
    );
}
