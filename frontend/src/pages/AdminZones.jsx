import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Plus,
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

export default function AdminZones() {
    const [zones, setZones] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);

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

                {!loading && !error && zones.length === 0 && (
                    <p className="p-6 text-body text-neutral-600">
                        Aún no hay zonas registradas. Usa "Crear zona" para agregar la primera.
                    </p>
                )}

                {!loading && !error && zones.length > 0 && (
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
                                    </tr>
                                </thead>
                                <tbody>
                                    {zones.map((zone) => (
                                        <tr key={zone.id} className="border-b border-neutral-100 last:border-0">
                                            <td className="px-4 py-3">
                                                <span className="text-body font-medium text-neutral-900">{zone.name}</span>
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