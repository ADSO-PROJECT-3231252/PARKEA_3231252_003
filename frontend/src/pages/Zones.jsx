import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { MapPin, Search, X, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Ban, Map, List, Info, Clock } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getZones } from '../services/zoneService';
import { getZoneAvailability, spotsOf, typeFilterOf, zoneTypeOf } from '../utils/zones';
import { todayHoursLabel } from '../utils/zoneHours';
import { normalizeText } from '../utils/normalizeText';
import { VEHICLE_TYPES, vehicleTypeLabel, vehicleTypePlural } from '../utils/vehicleTypes';
import VehicleTypeIcon from '../components/VehicleTypeIcon';
import ZoneTypeSpots from '../components/ZoneTypeSpots';

// HU-25: Leaflet is only downloaded when the map view is opened. If that
// download fails, the page falls back to the list like any other map error.
function ZoneMapUnavailable({ onLoadError }) {
    useEffect(() => {
        onLoadError?.();
    }, [onLoadError]);
    return null;
}

const ZoneMap = lazy(() =>
    import('../components/ZoneMap').catch(() => ({ default: ZoneMapUnavailable })),
);

// AC-11: the list must be paginated when there are more than 9 zones.
const PAGE_SIZE = 9;

// Badge styles per availability state; the state itself comes from utils/zones.
const BADGE_CLASSES = {
    full: 'bg-danger-soft text-danger',
    almost: 'bg-warning-soft text-warning',
    available: 'bg-parkea-50 text-parkea-600',
};

// HU-31 AC-09: the options of the filter, "Todos" first
const TYPE_FILTERS = [{ value: null, label: 'Todos' }, ...VEHICLE_TYPES.map((value) => ({ value, label: vehicleTypeLabel(value) }))];

// #373: availableSlots is the room now (the spots free for the next 30
// minutes). A zone with none now can still be reserved for other hours, so
// "Reservar" is never blocked: the reserve screen and the API decide.
// HU-31 AC-08: the card shows the types of the zone, with their free spots
// and rates. With the filter of a type (AC-09), the badge and the note are
// about that type.
function ZoneCard({ zone, type, onReserve }) {
    const spots = spotsOf(zone, type);
    const availability = getZoneAvailability(spots.availableSlots, spots.totalSlots);
    const fullNow = availability.state === 'full';
    const noteId = `full-now-${zone.id}`;

    return (
        <div className="@container flex flex-col rounded-lg border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
                <h2 className="flex items-center gap-1.5 text-subtitle-sm font-display uppercase text-neutral-900">
                    <MapPin className="h-4 w-4 shrink-0 text-parkea-600" aria-hidden="true" />
                    {zone.name}
                </h2>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-label font-medium ${BADGE_CLASSES[availability.state]}`}>
                    {availability.text}
                    {type && <span className="sr-only"> para {vehicleTypePlural(type)}</span>}
                </span>
            </div>

            {zone.address && <p className="mt-1 pl-[22px] text-body text-neutral-600">{zone.address}</p>}

            {/* HU-29 AC-06: the hours of today */}
            <p className="mt-2 flex items-start gap-1.5 text-body text-neutral-900">
                <Clock className="mt-1 h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                <span>{todayHoursLabel(zone)}</span>
            </p>

            {/* HU-31 AC-08: each type with its free spots now and its rate */}
            <div className="mt-4 border-t border-neutral-100 pt-3">
                <p className="text-caption text-neutral-600">Cupos libres ahora y tarifa por hora</p>
                <ZoneTypeSpots zone={zone} className="mt-1.5" />
            </div>

            <button
                type="button"
                onClick={() => onReserve(zone)}
                aria-label={`Reservar en ${zone.name}`}
                aria-describedby={fullNow ? noteId : undefined}
                className="mt-4 w-full rounded-md bg-parkea-600 px-4 py-2 text-label font-medium text-white transition-colors hover:bg-parkea-700"
            >
                Reservar
            </button>
            {fullNow && (
                <p id={noteId} className="mt-2 text-center text-caption text-neutral-600">
                    {type
                        ? `No hay cupos de ${vehicleTypePlural(type)} en este momento, pero puedes reservar para otro horario.`
                        : 'No hay cupos en este momento, pero puedes reservar para otro horario.'}
                </p>
            )}
        </div>
    );
}

// HU-31 AC-09: "Todos · Carro · Moto · Camión". Radio buttons, so the arrows
// of the keyboard move between them and a screen reader hears which one is
// chosen, drawn as a row of buttons.
function TypeFilter({ type, onChange, allRef }) {
    return (
        <fieldset className="min-w-0">
            <legend className="text-label text-neutral-700">Tipo de vehículo</legend>
            <div className="mt-1 flex flex-wrap gap-2">
                {TYPE_FILTERS.map(({ value, label }) => {
                    const id = `type-filter-${value ?? 'all'}`;
                    return (
                        <div key={id}>
                            <input
                                ref={value === null ? allRef : undefined}
                                id={id}
                                type="radio"
                                name="type-filter"
                                checked={type === value}
                                onChange={() => onChange(value)}
                                className="peer sr-only"
                            />
                            <label
                                htmlFor={id}
                                className="flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full border border-neutral-200 bg-white px-3 py-1.5 text-label text-neutral-700 transition-colors hover:border-parkea-600 hover:text-parkea-600 peer-checked:border-parkea-600 peer-checked:bg-parkea-600 peer-checked:text-white peer-checked:hover:bg-parkea-700 peer-checked:hover:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-parkea-600 peer-focus-visible:ring-offset-2"
                            >
                                {value && <VehicleTypeIcon type={value} className="h-4 w-4 shrink-0" />}
                                {label}
                            </label>
                        </div>
                    );
                })}
            </div>
        </fieldset>
    );
}

// HU-31 AC-09: what the hidden status says about the zones found, and the
// text of the list when there are none
function zonesFoundText(count, term, type) {
    const plural = type ? vehicleTypePlural(type) : '';
    if (count === 0) {
        if (term && type) return `No se encontraron zonas con ese nombre que reciban ${plural}.`;
        if (type) return `Ninguna zona recibe ${plural} en este momento.`;
        return 'No se encontraron zonas con ese nombre.';
    }
    if (!term) return `${count} ${count === 1 ? 'zona recibe' : 'zonas reciben'} ${plural}.`;
    const found = `${count} ${count === 1 ? 'zona encontrada' : 'zonas encontradas'}`;
    return type ? `${found} que ${count === 1 ? 'recibe' : 'reciben'} ${plural}` : found;
}

export default function Zones() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    // #311: the clear button disappears with the text, so the focus goes back to the search box
    const searchRef = useRef(null);
    // HU-31: the button that clears the filter disappears with the empty
    // list, so the focus goes to "Todos"
    const allTypesRef = useRef(null);

    // HU-25: list and map share this screen, so the search is kept when the
    // user switches views (AC-01). The view lives in the URL (?view=map).
    // HU-31 AC-09: so does the filter of a type (?type=motorcycle), which is
    // kept by the back button, a reload and the switch of view.
    const [searchParams, setSearchParams] = useSearchParams();
    const view = searchParams.get('view') === 'map' ? 'map' : 'list';
    const type = typeFilterOf(searchParams.get('type'));
    const [mapFailed, setMapFailed] = useState(false);

    // The page is of a filter: another filter starts on page 1, also when it
    // changes with the back button
    const [pageOf, setPageOf] = useState({ type, page: 1 });
    const page = pageOf.type === type ? pageOf.page : 1;
    const setPage = (n) => setPageOf({ type, page: n });

    // The query with one parameter changed (null removes it), keeping the others
    const queryWith = (name, value) => {
        const next = new URLSearchParams(searchParams);
        if (value) next.set(name, value);
        else next.delete(name);
        const query = next.toString();
        return query ? `?${query}` : '';
    };

    const fetchZones = useCallback(() => {
        getZones()
            .then(({ data }) => {
                setZones(data.zones);
                setError(false);
            })
            .catch(() => setError(true))
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        fetchZones();
    }, [fetchZones]);

    // AC-08: zone data must be refreshed when the user searches, so availability
    // is never stale. Debounced so a request isn't fired on every keystroke.
    useEffect(() => {
        if (!search) return;
        const timer = setTimeout(fetchZones, 400);
        return () => clearTimeout(timer);
    }, [search, fetchZones]);

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchZones();
    };

    // HU-31 AC-09: with the filter of a type, the zones that accept it, the
    // ones with more of its spots free first (the API sends the zones with
    // more spots free first, HU-09)
    const term = normalizeText(search.trim());
    const filteredZones = useMemo(() => {
        let found = term ? zones.filter((zone) => normalizeText(zone.name).includes(term)) : zones;
        if (type) {
            const shareFree = (zone) => {
                const { availableSlots, totalSlots } = zoneTypeOf(zone, type);
                return totalSlots > 0 ? availableSlots / totalSlots : 0;
            };
            found = found.filter((zone) => zoneTypeOf(zone, type)).sort((a, b) => shareFree(b) - shareFree(a));
        }
        return found;
    }, [zones, term, type]);

    const totalPages = Math.max(1, Math.ceil(filteredZones.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedZones = filteredZones.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    // #331 (WCAG 2.1 SC 4.1.3): while there is a search, a hidden status message
    // tells a screen reader how many zones were found. The element is always in
    // the page (empty without a search), so the change is announced. HU-31
    // AC-09: also while there is the filter of a type.
    let searchStatus = '';
    if ((term || type) && !loading && !error) {
        searchStatus = zonesFoundText(filteredZones.length, term, type);
    }

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleClearSearch = () => {
        setSearch('');
        setPage(1);
        searchRef.current?.focus();
    };

    // HU-31 AC-09: the filter replaces its entry of the history, so the back
    // button leaves the list instead of going through every filter tried
    const handleTypeChange = (value) => setSearchParams(queryWith('type', value), { replace: true });

    const handleClearType = () => {
        handleTypeChange(null);
        allTypesRef.current?.focus();
    };

    // AC-08: if the map can't load, explain it and fall back to the list.
    // HU-31: the list keeps the filter
    const handleMapError = useCallback(() => {
        setMapFailed(true);
        setSearchParams(
            (current) => {
                const next = new URLSearchParams(current);
                next.delete('view');
                return next;
            },
            { replace: true },
        );
    }, [setSearchParams]);

    const showList = () => setSearchParams(queryWith('view', null));

    const handleReserve = (zone) => {
        if (!user) {
            navigate('/login', { state: { from: `/reserve/${zone.id}` } });
            return;
        }
        navigate(`/reserve/${zone.id}`);
    };

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <title>Zonas de parqueo | PARKEA</title>
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">Zonas de parqueo</h1>
                    <p className="mt-1 text-body text-neutral-600">
                        {view === 'map'
                            ? 'Explora las zonas disponibles en el mapa.'
                            : 'Selecciona una zona para ver disponibilidad y realizar tu reserva.'}
                    </p>
                </div>

                {/* View toggle (HU-25 AC-01) */}
                <div className="flex overflow-hidden rounded-md border border-neutral-200" role="group" aria-label="Cambiar entre lista y mapa">
                    <Link
                        to={{ search: queryWith('view', 'map') }}
                        onClick={() => setMapFailed(false)}
                        aria-current={view === 'map' ? 'page' : undefined}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-label transition-colors ${view === 'map'
                            ? 'bg-parkea-600 text-white'
                            : 'bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                    >
                        <Map className="h-4 w-4" aria-hidden="true" />
                        Mapa
                    </Link>
                    <Link
                        to={{ search: queryWith('view', null) }}
                        aria-current={view === 'list' ? 'page' : undefined}
                        className={`flex items-center gap-1.5 px-3 py-1.5 text-label transition-colors ${view === 'list'
                            ? 'bg-parkea-600 text-white'
                            : 'bg-white text-neutral-700 hover:bg-neutral-50'
                            }`}
                    >
                        <List className="h-4 w-4" aria-hidden="true" />
                        Lista
                    </Link>
                </div>
            </div>

            <div className="relative mt-6 max-w-md">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-500" aria-hidden="true" />
                <label htmlFor="zone-search" className="sr-only">
                    Buscar zonas por nombre
                </label>
                <input
                    ref={searchRef}
                    id="zone-search"
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Buscar por nombre…"
                    className="w-full rounded-md border border-neutral-200 py-2 pl-9 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                />
                {search && (
                    <button
                        type="button"
                        onClick={handleClearSearch}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-1.5 top-1/2 flex size-6 -translate-y-1/2 items-center justify-center rounded-sm text-neutral-600 hover:text-neutral-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            {/* HU-31 AC-09 */}
            <div className="mt-4">
                <TypeFilter type={type} onChange={handleTypeChange} allRef={allTypesRef} />
            </div>

            {/* #331: announces the result of the search to screen readers */}
            <p role="status" className="sr-only">
                {searchStatus}
            </p>

            <div className="mt-6">
                {mapFailed && view === 'list' && (
                    <p role="alert" className="mb-4 flex items-center gap-2 rounded-md bg-warning-soft px-3 py-2 text-body text-warning">
                        <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                        No pudimos cargar el mapa. Te mostramos la lista de zonas.
                    </p>
                )}

                {loading && (
                    <p role="status" aria-live="polite" className="text-body text-neutral-600">
                        Cargando zonas…
                    </p>
                )}

                {!loading && error && (
                    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-danger-soft bg-danger-soft p-5">
                        <p className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar las zonas. Intenta de nuevo.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-white"
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reintentar
                        </button>
                    </div>
                )}

                {!loading && !error && filteredZones.length === 0 && (
                    <div className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200 bg-white p-5">
                        <p className="flex items-center gap-2 text-body text-neutral-600">
                            <Ban className="h-4 w-4 shrink-0 text-neutral-500" aria-hidden="true" />
                            {zones.length === 0
                                ? 'No hay zonas disponibles en este momento.'
                                : zonesFoundText(0, term, type)}
                        </p>
                        {zones.length > 0 && (
                            <div className="flex flex-wrap gap-3">
                                {term && (
                                    <button
                                        type="button"
                                        onClick={handleClearSearch}
                                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                                    >
                                        Limpiar búsqueda
                                    </button>
                                )}
                                {/* HU-31 AC-09 */}
                                {type && (
                                    <button
                                        type="button"
                                        onClick={handleClearType}
                                        className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                                    >
                                        Ver todos los tipos
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {!loading && !error && filteredZones.length > 0 && view === 'map' && (
                    <>
                        <Suspense
                            fallback={
                                <div className="flex h-[65vh] min-h-[380px] items-center justify-center rounded-lg border border-neutral-200 bg-neutral-100">
                                    <p role="status" aria-live="polite" className="text-body text-neutral-600">
                                        Cargando mapa…
                                    </p>
                                </div>
                            }
                        >
                            <ZoneMap
                                zones={filteredZones}
                                type={type}
                                onReserve={handleReserve}
                                onLoadError={handleMapError}
                                onShowList={showList}
                            />
                        </Suspense>
                        <p className="mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-600">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            La disponibilidad se actualiza cada vez que recargas la página o buscas.
                        </p>
                    </>
                )}

                {!loading && !error && paginatedZones.length > 0 && view === 'list' && (
                    <>
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            {paginatedZones.map((zone) => (
                                <ZoneCard key={zone.id} zone={zone} type={type} onReserve={handleReserve} />
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <nav
                                aria-label="Paginación de zonas"
                                className="mt-6 flex items-center justify-center gap-4"
                            >
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (currentPage > 1) setPage(currentPage - 1);
                                    }}
                                    aria-disabled={currentPage === 1 || undefined}
                                    aria-label="Página anterior"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-neutral-200 aria-disabled:hover:text-neutral-900"
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                    Anterior
                                </button>
                                <span className="text-label text-neutral-600" aria-live="polite">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (currentPage < totalPages) setPage(currentPage + 1);
                                    }}
                                    aria-disabled={currentPage === totalPages || undefined}
                                    aria-label="Página siguiente"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:border-neutral-200 aria-disabled:hover:text-neutral-900"
                                >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </nav>
                        )}

                        <p className="mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-600">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            La disponibilidad se actualiza cada vez que recargas la página o buscas.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
