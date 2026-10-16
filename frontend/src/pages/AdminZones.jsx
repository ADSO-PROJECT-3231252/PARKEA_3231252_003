import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    Plus,
    Search,
    X,
    SquareParking,
    Pencil,
    AlertCircle,
    CheckCircle2,
    ChevronLeft,
    ChevronRight,
    RefreshCw,
} from 'lucide-react';
import { getAllZones, toggleZone } from '../services/zoneService';
import { translateError } from '../utils/errorMessages';
import { formatCurrency } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';
import { getPageWindow } from '../utils/adminUsersHelpers';
import ConfirmDialog from '../components/ConfirmDialog';

// AC-11: the list is paginated when there are more than 10 zones.
const PAGE_SIZE = 10;
const SUCCESS_MESSAGE_MS = 3000;

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

// AC-05: edit opens the edit form (HU-21). AC-06: activate or deactivate.
function ZoneActions({ zone, onToggle }) {
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
            {/* AC-14: the "off" state uses neutral-500 so the switch keeps a 3:1
                contrast against the white background (WCAG 1.4.11). */}
            <button
                type="button"
                role="switch"
                aria-checked={zone.isActive}
                aria-label={`Zona activa: ${zone.name}`}
                onClick={() => onToggle(zone)}
                className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600 focus-visible:ring-offset-2 ${zone.isActive ? 'border-parkea-600 bg-parkea-600' : 'border-neutral-500 bg-neutral-500'}`}
            >
                <span
                    className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${zone.isActive ? 'translate-x-4' : 'translate-x-0'}`}
                    aria-hidden="true"
                />
            </button>
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

    // AC-03: search by name or address and filter by status
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);

    // AC-08 / AC-10: confirmation dialog and outcome messages
    const [pendingZone, setPendingZone] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [actionError, setActionError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const titleRef = useRef(null);
    const toggledRef = useRef(false);

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

    useEffect(() => {
        if (!successMessage) return;
        const timer = setTimeout(() => setSuccessMessage(''), SUCCESS_MESSAGE_MS);
        return () => clearTimeout(timer);
    }, [successMessage]);

    // After a change, the dialog returns focus to the switch. If the status
    // filter now hides that zone, the switch is gone and focus would fall to
    // the page body, so it goes to the title instead. This runs after the
    // dialog's own cleanup, which is the one that restores focus.
    useEffect(() => {
        if (pendingZone || !toggledRef.current) return;
        toggledRef.current = false;
        if (document.activeElement === document.body) titleRef.current?.focus();
    }, [pendingZone]);

    // AC-12: retry after a failed load
    const handleRetry = () => {
        setLoading(true);
        setError(false);
        fetchZones();
    };

    const filteredZones = useMemo(() => {
        const term = search.trim().toLowerCase();
        return zones.filter((zone) => {
            if (status === 'active' && !zone.isActive) return false;
            if (status === 'inactive' && zone.isActive) return false;
            if (!term) return true;
            return zone.name.toLowerCase().includes(term) || (zone.address ?? '').toLowerCase().includes(term);
        });
    }, [zones, search, status]);

    const totalPages = Math.max(1, Math.ceil(filteredZones.length / PAGE_SIZE));
    const currentPage = Math.min(page, totalPages);
    const pageZones = filteredZones.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
    const rangeStart = filteredZones.length === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
    const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredZones.length);
    const pageWindow = getPageWindow(currentPage, totalPages);

    const handleSearchChange = (value) => {
        setSearch(value);
        setPage(1);
    };

    const handleStatusChange = (value) => {
        setStatus(value);
        setPage(1);
    };

    const openToggle = (zone) => {
        setActionError('');
        setPendingZone(zone);
    };

    const closeToggle = useCallback(() => {
        setPendingZone(null);
        setActionError('');
    }, []);

    const handleConfirmToggle = async () => {
        if (!pendingZone) return;
        setConfirming(true);
        setActionError('');
        try {
            const { data } = await toggleZone(pendingZone.id);
            // Keep the table on screen: only the changed zone is replaced, and
            // activeReservations (not returned by the toggle) is kept.
            setZones((prev) => prev.map((z) => (z.id === data.zone.id ? { ...z, ...data.zone } : z)));
            setSuccessMessage(
                data.zone.isActive
                    ? `La zona ${data.zone.name} fue activada y vuelve a aparecer en la lista pública.`
                    : `La zona ${data.zone.name} fue desactivada. Ya no aparece en la lista pública ni acepta reservas nuevas.`,
            );
            toggledRef.current = true;
            setPendingZone(null);
        } catch (err) {
            setActionError(translateError(err.response?.data?.code));
        } finally {
            setConfirming(false);
        }
    };

    // AC-07 / AC-08: the dialog explains the effect; if the zone has Pending or
    // Active reservations it warns that they stay valid until they end.
    let dialogTitle = '';
    let dialogMessage = '';
    if (pendingZone) {
        const inUse = Number(pendingZone.activeReservations) || 0;
        if (pendingZone.isActive) {
            dialogTitle = 'Desactivar zona';
            dialogMessage = `Vas a desactivar la zona ${pendingZone.name}. Dejará de aparecer en la lista pública y no aceptará reservas nuevas.`;
            if (inUse > 0) {
                dialogMessage += ` Tiene ${inUse} ${inUse === 1 ? 'reserva pendiente o activa, que seguirá válida' : 'reservas pendientes o activas, que seguirán válidas'} hasta que termine${inUse === 1 ? '' : 'n'}.`;
            }
        } else {
            dialogTitle = 'Activar zona';
            dialogMessage = `Vas a activar la zona ${pendingZone.name}. Volverá a aparecer en la lista pública y aceptará reservas.`;
        }
    }

    const pageButton =
        'flex items-center gap-1 rounded-md border border-neutral-200 px-2.5 py-1 text-caption text-neutral-700 transition-colors hover:bg-neutral-50 ' +
        'disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent';

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 ref={titleRef} tabIndex={-1} className="text-title font-display uppercase text-neutral-900 focus:outline-none">
                        Gestión de zonas
                    </h1>
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

            {/* AC-10: outcome of every action. The live region is always in the
                page so screen readers announce the new text. */}
            <div role="status" aria-live="polite">
                {successMessage && (
                    <p className="mt-4 flex items-center gap-2 rounded-md bg-parkea-50 px-3 py-2 text-caption text-parkea-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {successMessage}
                    </p>
                )}
            </div>

            {/* AC-03: search and status filter */}
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
                <select
                    value={status}
                    onChange={(e) => handleStatusChange(e.target.value)}
                    aria-label="Filtrar por estado"
                    className="w-full rounded-md border border-neutral-200 bg-white px-3 py-2.5 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600 sm:w-56"
                >
                    <option value="">Todos los estados</option>
                    <option value="active">Activas</option>
                    <option value="inactive">Inactivas</option>
                </select>
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
                            : 'No se encontraron zonas con esa búsqueda o estado.'}
                    </p>
                )}

                {!loading && !error && filteredZones.length > 0 && (
                    <>
                        {/* AC-01 / AC-02: table on computers */}
                        <div className="hidden overflow-x-auto lg:block">
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
                                    {pageZones.map((zone) => (
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
                                                <ZoneActions zone={zone} onToggle={openToggle} />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>

                        {/* AC-15: one card per zone on phones and tablets */}
                        <ul className="divide-y divide-neutral-100 lg:hidden">
                            {pageZones.map((zone) => (
                                <li key={zone.id} className="flex flex-col gap-3 p-4">
                                    <div className="flex items-start justify-between gap-3">
                                        <ZoneName zone={zone} />
                                        <StatusBadge isActive={zone.isActive} />
                                    </div>
                                    {zone.address && <p className="text-body text-neutral-600">{zone.address}</p>}
                                    <dl className="grid grid-cols-3 gap-2 rounded-md bg-neutral-50 p-3 text-center">
                                        <div>
                                            <dt className="text-caption text-neutral-600">Capacidad</dt>
                                            <dd className="font-mono text-body tabular-nums text-neutral-900">{zone.totalSlots}</dd>
                                        </div>
                                        <div>
                                            <dt className="text-caption text-neutral-600">Disponibles</dt>
                                            <dd>
                                                <Availability zone={zone} />
                                            </dd>
                                        </div>
                                        <div>
                                            <dt className="text-caption text-neutral-600">Tarifa/hora</dt>
                                            <dd className="whitespace-nowrap font-mono text-body text-neutral-900">
                                                {formatCurrency(zone.hourlyRate)}
                                            </dd>
                                        </div>
                                    </dl>
                                    <ZoneActions zone={zone} onToggle={openToggle} />
                                </li>
                            ))}
                        </ul>

                        {/* AC-11: pagination */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
                            <p className="text-caption text-neutral-600">
                                Mostrando {rangeStart} a {rangeEnd} de {filteredZones.length} zonas
                            </p>
                            <nav aria-label="Paginación de zonas" className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => setPage(currentPage - 1)}
                                    disabled={currentPage === 1}
                                    className={pageButton}
                                >
                                    <ChevronLeft className="h-3.5 w-3.5" aria-hidden="true" />
                                    Anterior
                                </button>
                                {pageWindow.map((item) =>
                                    typeof item === 'number' ? (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => setPage(item)}
                                            aria-label={`Página ${item}`}
                                            aria-current={item === currentPage ? 'page' : undefined}
                                            className={`flex h-7 w-7 items-center justify-center rounded-md text-label transition-colors ${item === currentPage ? 'bg-parkea-600 font-medium text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
                                        >
                                            {item}
                                        </button>
                                    ) : (
                                        <span key={item} className="px-1 text-neutral-600" aria-hidden="true">
                                            …
                                        </span>
                                    ),
                                )}
                                <button
                                    type="button"
                                    onClick={() => setPage(currentPage + 1)}
                                    disabled={currentPage === totalPages}
                                    className={pageButton}
                                >
                                    Siguiente
                                    <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                                </button>
                            </nav>
                        </div>
                    </>
                )}
            </div>

            <ConfirmDialog
                open={Boolean(pendingZone)}
                variant={pendingZone?.isActive ? 'danger' : 'default'}
                title={dialogTitle}
                message={dialogMessage}
                confirmLabel={pendingZone?.isActive ? 'Desactivar zona' : 'Activar zona'}
                cancelLabel="Cancelar"
                confirming={confirming}
                error={actionError}
                onConfirm={handleConfirmToggle}
                onCancel={closeToggle}
            />
        </div>
    );
}
