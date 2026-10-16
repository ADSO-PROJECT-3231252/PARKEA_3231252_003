import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Plus,
    Search,
    X,
    SquareParking,
    Pencil,
    AlertCircle,
    RefreshCw,
} from 'lucide-react';
import { getAllZones } from '../services/zoneService';
import { formatCurrency } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';

const AVAILABILITY_COLORS = {
    full: 'text-danger',
    almost: 'text-warning',
    available: 'text-parkea-600',
};

const percentOf = (part, total) => (total > 0 ? Math.round((part / total) * 100) : 0);

// AC-14: the status is always written out, not shown by color alone.
function StatusBadge({ isActive }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium ${isActive ? 'bg-parkea-50 text-parkea-700' : 'bg-danger-soft text-danger'}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-parkea-600' : 'bg-danger'}`} aria-hidden="true" />
            {isActive ? 'Activa' : 'Inactiva'}
        </span>
    );
}

function Availability({ zone }) {
    const availability = getZoneAvailability(zone.availableSlots, zone.totalSlots);
    return (
        <span className="flex flex-col items-center">
            <span className={`font-mono text-body font-medium tabular-nums ${AVAILABILITY_COLORS[availability.state]}`}>
                {zone.availableSlots}
            </span>
            <span className="font-mono text-caption tabular-nums text-neutral-600">
                ({percentOf(zone.availableSlots, zone.totalSlots)}%)
            </span>
        </span>
    );
}

// AC-05: edit opens the edit form (HU-21).
function ZoneActions({ zone }) {
    return (
        <div className="flex items-center gap-3">
            <Link
                to={`/admin/zones/${zone.id}/edit`}
                aria-label={`Editar ${zone.name}`}
                className="flex items-center gap-1.5 whitespace-nowrap rounded-md border border-parkea-600 bg-white px-2.5 py-1 text-caption text-parkea-600 transition-colors hover:bg-parkea-50"
            >
                <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
                Editar
            </Link>
        </div>
    );
}

function ZoneName({ zone }) {
    return (
        <div className="flex min-w-0 items-center gap-3">
            <span
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${zone.isActive ? 'bg-parkea-50 text-parkea-600' : 'bg-danger-soft text-danger'}`}
                aria-hidden="true"
            >
                <SquareParking className="h-4 w-4" />
            </span>
            <span className="min-w-0 break-words text-body font-medium text-neutral-900">{zone.name}</span>
        </div>
    );
}

export default function AdminZones() {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

    // AC-03: search by name or address
    const [search, setSearch] = useState('');

    const fetchZones = useCallback(() => {
        getAllZones()
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

    // AC-12: retry after a failed load
    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchZones();
    };

    const filteredZones = useMemo(() => {
        const term = search.trim().toLowerCase();
        if (!term) return zones;
        return zones.filter(
            (zone) => zone.name.toLowerCase().includes(term) || (zone.address ?? '').toLowerCase().includes(term),
        );
    }, [zones, search]);


    const handleSearchChange = (value) => {
        setSearch(value);
    };

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">Gestión de zonas</h1>
                    <p className="mt-1 text-body text-neutral-600">Administra las zonas de parqueo registradas en el sistema.</p>
                </div>
                {/* AC-04: opens the creation form (HU-20) */}
                <Link
                    to="/admin/zones/new"
                    className="flex w-full items-center justify-center gap-2 rounded-md bg-parkea-600 px-5 py-2.5 text-label font-medium text-white transition-colors hover:bg-parkea-700 sm:w-auto"
                >
                    <Plus className="h-4 w-4" aria-hidden="true" />
                    Crear zona
                </Link>
            </div>

            {/* AC-03: search */}
            <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="relative w-full sm:max-w-md">
                    <Search
                        className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600"
                        aria-hidden="true"
                    />
                    <input
                        type="search"
                        value={search}
                        onChange={(e) => handleSearchChange(e.target.value)}
                        placeholder="Buscar por nombre o dirección…"
                        aria-label="Buscar zona por nombre o dirección"
                        className="w-full rounded-md border border-neutral-200 bg-white py-2.5 pl-9 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                    />
                    {search && (
                        <button
                            type="button"
                            onClick={() => handleSearchChange('')}
                            aria-label="Limpiar búsqueda"
                            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-900"
                        >
                            <X className="h-4 w-4" aria-hidden="true" />
                        </button>
                    )}
                </div>
            </div>

            <div className="mt-6 rounded-lg border border-neutral-200 bg-white">
                {loading && (
                    <p role="status" aria-live="polite" className="p-6 text-body text-neutral-600">
                        Cargando zonas…
                    </p>
                )}

                {/* AC-12: clear error with a retry action */}
                {!loading && error && (
                    <div role="alert" className="flex flex-col items-start gap-3 p-6">
                        <p className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar las zonas. Intenta de nuevo.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-danger-soft"
                        >
                            <RefreshCw className="h-4 w-4" aria-hidden="true" />
                            Reintentar
                        </button>
                    </div>
                )}

                {!loading && !error && filteredZones.length === 0 && (
                    <p className="p-6 text-body text-neutral-600">
                        {zones.length === 0
                            ? 'Aún no hay zonas registradas. Usa "Crear zona" para agregar la primera.'
                            : 'No se encontraron zonas con esa búsqueda.'}
                    </p>
                )}

                {!loading && !error && filteredZones.length > 0 && (
                    <>
                        {/* AC-01 / AC-02 */}
                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-neutral-200 bg-neutral-50 text-label text-neutral-900 xl:[&>th]:whitespace-nowrap">
                                        <th scope="col" className="px-4 py-3 font-medium">Nombre de la zona</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Dirección</th>
                                        <th scope="col" className="px-4 py-3 text-center font-medium">Capacidad total</th>
                                        <th scope="col" className="px-4 py-3 text-center font-medium">Cupos disponibles</th>
                                        <th scope="col" className="px-4 py-3 text-right font-medium">Tarifa por hora</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredZones.map((zone) => (
                                        <tr key={zone.id} className="border-b border-neutral-100 last:border-0">
                                            <td className="px-4 py-3">
                                                <ZoneName zone={zone} />
                                            </td>
                                            <td className="max-w-[260px] px-4 py-3 text-body text-neutral-600">{zone.address}</td>
                                            <td className="px-4 py-3 text-center font-mono text-body tabular-nums text-neutral-900">
                                                {zone.totalSlots}
                                            </td>
                                            <td className="px-4 py-3 text-center">
                                                <Availability zone={zone} />
                                            </td>
                                            <td className="whitespace-nowrap px-4 py-3 text-right font-mono text-body text-neutral-900">
                                                {formatCurrency(zone.hourlyRate)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusBadge isActive={zone.isActive} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <ZoneActions zone={zone} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}