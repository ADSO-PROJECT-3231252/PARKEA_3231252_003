import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, Search, X, RefreshCw, AlertCircle, ChevronLeft, ChevronRight, Ban, Users, Banknote, Map, List, Info } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getZones } from '../services/zoneService';
import { formatCurrency } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';

const PAGE_SIZE = 10;

// Badge styles per availability state; the state itself comes from utils/zones.
const BADGE_CLASSES = {
    full: 'bg-danger-soft text-danger',
    almost: 'bg-warning-soft text-warning',
    available: 'bg-parkea-50 text-parkea-600',
};

function ZoneCard({ zone, onReserve }) {
    const availability = getZoneAvailability(zone.availableSlots, zone.totalSlots);
    const full = zone.availableSlots === 0;

    return (
        <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-5">
            <div className="flex items-start justify-between gap-3">
                <h3 className="flex items-center gap-1.5 text-subtitle-sm font-display uppercase text-neutral-900">
                    <MapPin className="h-4 w-4 shrink-0 text-parkea-600" aria-hidden="true" />
                    {zone.name}
                </h3>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-label font-medium ${BADGE_CLASSES[availability.state]}`}>
                    {availability.text}
                </span>
            </div>

            {zone.address && <p className="mt-1 pl-[22px] text-body text-neutral-600">{zone.address}</p>}

            <div className="mt-4 flex items-end justify-between">
                <span className="flex items-center gap-1.5 text-body text-neutral-900">
                    <Users className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                    <span className="font-mono tabular-nums">{zone.availableSlots}</span>
                    <span className="text-neutral-500">de</span>
                    <span className="font-mono tabular-nums">{zone.totalSlots}</span>
                    <span className="text-caption text-neutral-500">cupos disponibles</span>
                </span>
                <span className="flex flex-col items-end">
                    <span className="text-caption text-neutral-500">Tarifa por hora</span>
                    <span className="flex items-center gap-1 font-mono text-body text-neutral-900">
                        <Banknote className="h-4 w-4 text-neutral-500" aria-hidden="true" />
                        {formatCurrency(zone.hourlyRate)}
                    </span>
                </span>
            </div>

            <button
                type="button"
                onClick={() => onReserve(zone)}
                aria-disabled={full || undefined}
                aria-label={full ? `Reservar en ${zone.name} (no disponible: esta zona no tiene cupos)` : `Reservar en ${zone.name}`}
                title={full ? 'Esta zona no tiene cupos disponibles' : undefined}
                className={`mt-4 w-full rounded-md px-4 py-2 text-label font-medium transition-colors ${full
                    ? 'cursor-not-allowed bg-neutral-200 text-neutral-500'
                    : 'bg-parkea-600 text-white hover:bg-parkea-700'
                    }`}
            >
                {full ? 'Sin cupos disponibles' : 'Reservar'}
            </button>
        </div>
    );
}

export default function Zones() {
    const { user } = useAuth();
    const navigate = useNavigate();

    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [search, setSearch] = useState('');
    const [page, setPage] = useState(1);

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

    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchZones();
    };

    const filteredZones = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return zones;
        return zones.filter((zone) => zone.name.toLowerCase().includes(term));
    }, [zones, search]);

    const totalPages = Math.max(1, Math.ceil(filteredZones.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const paginatedZones = filteredZones.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);

    const handleSearchChange = (e) => {
        setSearch(e.target.value);
        setPage(1);
    };

    const handleClearSearch = () => {
        setSearch('');
        setPage(1);
    };

    const handleReserve = (zone) => {
        if (zone.availableSlots === 0) return;
        if (!user) {
            navigate('/login', { state: { from: `/reserve/${zone.id}` } });
            return;
        }
        navigate(`/reserve/${zone.id}`);
    };

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">Zonas de parqueo</h1>
                    <p className="mt-1 text-body text-neutral-600">
                        Selecciona una zona para ver disponibilidad y realizar tu reserva.
                    </p>
                </div>

                {/* View toggle — this screen is the "Lista" side; "Mapa" is HU-25 (still ComingSoon) */}
                <div className="flex overflow-hidden rounded-md border border-neutral-200" role="group" aria-label="Cambiar entre lista y mapa">
                    <Link
                        to="/zones/map"
                        className="flex items-center gap-1.5 bg-white px-3 py-1.5 text-label text-neutral-700 transition-colors hover:bg-neutral-50"
                    >
                        <Map className="h-4 w-4" aria-hidden="true" />
                        Mapa
                    </Link>
                    <Link
                        to="/zones"
                        aria-current="page"
                        className="flex items-center gap-1.5 bg-parkea-600 px-3 py-1.5 text-label text-white"
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
                    id="zone-search"
                    type="text"
                    value={search}
                    onChange={handleSearchChange}
                    placeholder="Buscar por nombre de zona..."
                    className="w-full rounded-md border border-neutral-200 py-2 pl-9 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                />
                {search && (
                    <button
                        type="button"
                        onClick={handleClearSearch}
                        aria-label="Limpiar búsqueda"
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-neutral-700"
                    >
                        <X className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}
            </div>

            <div className="mt-6">
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
                                : 'No se encontraron zonas con ese nombre.'}
                        </p>
                        {zones.length > 0 && (
                            <button
                                type="button"
                                onClick={handleClearSearch}
                                className="rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                            >
                                Limpiar búsqueda
                            </button>
                        )}
                    </div>
                )}

                {!loading && !error && paginatedZones.length > 0 && (
                    <>
                        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            {paginatedZones.map((zone) => (
                                <ZoneCard key={zone.id} zone={zone} onReserve={handleReserve} />
                            ))}
                        </div>

                        {totalPages > 1 && (
                            <nav
                                aria-label="Paginación de zonas"
                                className="mt-6 flex items-center justify-center gap-4"
                            >
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                                    disabled={currentPage === 1}
                                    aria-label="Página anterior"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:text-neutral-900"
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                    Anterior
                                </button>
                                <span className="text-label text-neutral-600" aria-live="polite">
                                    Página {currentPage} de {totalPages}
                                </span>
                                <button
                                    type="button"
                                    onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                    aria-label="Página siguiente"
                                    className="flex items-center gap-1 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200 disabled:hover:text-neutral-900"
                                >
                                    Siguiente
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </nav>
                        )}

                        <p className="mt-6 flex items-center justify-center gap-1.5 text-caption text-neutral-500">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            La disponibilidad se actualiza en tiempo real.
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}