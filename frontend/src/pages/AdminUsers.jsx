import { useEffect, useState } from 'react';
import {
    Users,
    UserCheck,
    UserX,
    ShieldCheck,
    Search,
    X,
    Filter,
    Activity,
    AlertCircle,
} from 'lucide-react';
import { getUsers } from '../services/adminService';
import { getInitials, formatDate, formatTime } from '../utils/format';
import { PAGE_SIZE_OPTIONS } from '../utils/adminUsersHelpers';
import MetricCard from '../components/MetricCard';

// AC-15: the list is paginated when there are more than 10 accounts.
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const SEARCH_DEBOUNCE_MS = 400;

const percent = (part, total) => (total > 0 ? `${((part / total) * 100).toFixed(1)}% del total` : '—');

export default function AdminUsers() {
    // ----- User list -----
    const [users, setUsers] = useState([]);
    const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, admins: 0 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    // Bumped by "Reintentar" to re-run the fetch.
    const [reloadKey, setReloadKey] = useState(0);

    // ----- Filters (AC-04) -----
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [role, setRole] = useState('');
    const [status, setStatus] = useState('');

    useEffect(() => {
        // Guards against out-of-order responses: a response that arrives after
        // a newer request has started must not overwrite the newer data.
        let active = true;
        getUsers({
            search: debouncedSearch || undefined,
            role: role || undefined,
            status: status || undefined,
            page: 1,
            limit: DEFAULT_PAGE_SIZE,
        })
            .then(({ data }) => {
                if (!active) return;
                setUsers(data.users);
                setSummary(data.summary);
                setLastUpdated(new Date());
                setError(false);
                setLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setError(true);
                setLoading(false);
            });
        return () => {
            active = false;
        };
    }, [debouncedSearch, role, status, reloadKey]);

    // Search is sent to the backend only after the user stops typing.
    useEffect(() => {
        const timer = setTimeout(() => {
            const trimmed = search.trim();
            if (trimmed === debouncedSearch) return;
            setLoading(true);
            setDebouncedSearch(trimmed);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search, debouncedSearch]);

    // Every change that triggers a new fetch shows the loading state first; it's
    // set here, in the event, rather than inside the effect.
    const startLoading = () => {
        setLoading(true);
        setError(false);
    };

    const handleRoleFilter = (value) => {
        if (value === role) return;
        startLoading();
        setRole(value);
    };

    const handleStatusFilter = (value) => {
        if (value === status) return;
        startLoading();
        setStatus(value);
    };

    const handleClearFilters = () => {
        // Only the values already sent to the backend trigger a new fetch.
        if (debouncedSearch || role || status) startLoading();
        setSearch('');
        setDebouncedSearch('');
        setRole('');
        setStatus('');
    };

    const handleRetry = () => {
        startLoading();
        setReloadKey((k) => k + 1);
    };

    const hasActiveFilters = Boolean(search || role || status);

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                    <h1 className="text-title font-display uppercase text-neutral-900">Gestión de usuarios</h1>
                    <p className="mt-1 text-body text-neutral-600">
                        Administra los usuarios del sistema, sus roles y estados.
                    </p>
                </div>
                {lastUpdated && (
                    <p className="flex items-center gap-1.5 text-caption text-neutral-600">
                        <Activity className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                        Última actualización
                        <span className="font-semibold text-neutral-900">
                            {formatDate(lastUpdated)} {formatTime(lastUpdated)}
                        </span>
                    </p>
                )}
            </div>

            {/* AC-02: summary metrics */}
            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <MetricCard
                    icon={Users}
                    label="Total de usuarios"
                    value={summary.total}
                    sublabel="Todos los usuarios registrados"
                />
                <MetricCard
                    icon={UserCheck}
                    label="Usuarios activos"
                    value={summary.active}
                    sublabel={percent(summary.active, summary.total)}
                />
                <MetricCard
                    icon={UserX}
                    label="Usuarios inactivos"
                    value={summary.inactive}
                    sublabel={percent(summary.inactive, summary.total)}
                />
                <MetricCard
                    icon={ShieldCheck}
                    label="Administradores"
                    value={summary.admins}
                    sublabel={percent(summary.admins, summary.total)}
                />
            </div>

            {/* AC-04: search and filters */}
            <div className="mt-6 flex flex-wrap items-end gap-3 rounded-lg border border-neutral-200 bg-white p-4">
                <div className="min-w-[220px] flex-1">
                    <label htmlFor="user-search" className="mb-1 block text-label text-neutral-700">
                        Buscar por nombre, correo o documento
                    </label>
                    <div className="relative">
                        <Search
                            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-600"
                            aria-hidden="true"
                        />
                        <input
                            id="user-search"
                            type="text"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            placeholder="Ej. Juan Pérez, juan@mail.com o 1020304050"
                            className="w-full rounded-md border border-neutral-200 py-2 pl-9 pr-9 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                        />
                        {search && (
                            <button
                                type="button"
                                onClick={() => setSearch('')}
                                aria-label="Limpiar búsqueda"
                                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-600 hover:text-neutral-900"
                            >
                                <X className="h-4 w-4" aria-hidden="true" />
                            </button>
                        )}
                    </div>
                </div>
                <div className="min-w-[180px]">
                    <label htmlFor="role-filter" className="mb-1 block text-label text-neutral-700">
                        Filtrar por rol
                    </label>
                    <select
                        id="role-filter"
                        value={role}
                        onChange={(e) => handleRoleFilter(e.target.value)}
                        className="w-full rounded-md border border-neutral-200 px-3 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                    >
                        <option value="">Todos los roles</option>
                        <option value="admin">Administrador</option>
                        <option value="user">Usuario</option>
                    </select>
                </div>
                <div className="min-w-[180px]">
                    <label htmlFor="status-filter" className="mb-1 block text-label text-neutral-700">
                        Filtrar por estado
                    </label>
                    <select
                        id="status-filter"
                        value={status}
                        onChange={(e) => handleStatusFilter(e.target.value)}
                        className="w-full rounded-md border border-neutral-200 px-3 py-2 text-body text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                    >
                        <option value="">Todos los estados</option>
                        <option value="active">Activo</option>
                        <option value="inactive">Inactivo</option>
                    </select>
                </div>
                <button
                    type="button"
                    onClick={handleClearFilters}
                    disabled={!hasActiveFilters}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-300 bg-white px-3 py-2 text-label text-neutral-900 transition-colors hover:border-parkea-600 disabled:cursor-not-allowed disabled:opacity-50"
                >
                    <Filter className="h-4 w-4 text-parkea-600" aria-hidden="true" />
                    Limpiar filtros
                </button>
            </div>

            {/* AC-03: user list */}
            <div className="mt-6 rounded-lg border border-neutral-200 bg-white">
                {loading && (
                    <p role="status" aria-live="polite" className="p-6 text-body text-neutral-600">
                        Cargando usuarios…
                    </p>
                )}

                {!loading && error && (
                    <div role="alert" className="flex flex-col items-start gap-3 p-6">
                        <p className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar los usuarios. Intenta de nuevo.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="rounded-md border border-danger px-3 py-1.5 text-label text-danger transition-colors hover:bg-danger-soft"
                        >
                            Reintentar
                        </button>
                    </div>
                )}

                {!loading && !error && users.length === 0 && (
                    <p className="p-6 text-body text-neutral-600">No se encontraron usuarios con estos filtros.</p>
                )}

                {!loading && !error && users.length > 0 && (
                    <>
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] border-collapse text-left">
                                <thead>
                                    <tr className="border-b border-neutral-200 bg-neutral-50 text-label text-neutral-900">
                                        <th scope="col" className="px-4 py-3 font-medium">Nombre</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Correo electrónico</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Documento</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Fecha de registro</th>
                                        <th scope="col" className="px-4 py-3 font-medium">N.º de reservas</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => {
                                        return (
                                            <tr key={u.id} className="border-b border-neutral-100 align-top last:border-0">
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2.5">
                                                        <span
                                                            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-parkea-50 text-caption font-semibold text-parkea-700"
                                                            aria-hidden="true"
                                                        >
                                                            {getInitials(u.fullName)}
                                                        </span>
                                                        <span className="text-body font-medium text-neutral-900">{u.fullName}</span>
                                                    </div>
                                                </td>
                                                <td className="px-4 py-3 text-body text-neutral-600">{u.email}</td>
                                                <td className="px-4 py-3 font-mono text-body text-neutral-600">{u.documentNumber}</td>
                                                {/* AC-17: role and status are always written out, not color alone. */}
                                                <td className="px-4 py-3">
                                                    {u.role === 'admin' ? (
                                                        <span className="inline-block rounded-md bg-parkea-50 px-2.5 py-0.5 text-caption font-medium text-parkea-700">
                                                            Administrador
                                                        </span>
                                                    ) : (
                                                        <span className="inline-block rounded-md bg-neutral-100 px-2.5 py-0.5 text-caption font-medium text-neutral-700">
                                                            Usuario
                                                        </span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3">
                                                    <span
                                                        className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-caption font-medium ${u.isActive ? 'bg-parkea-50 text-parkea-700' : 'bg-danger-soft text-danger'}`}
                                                    >
                                                        <span
                                                            className={`h-1.5 w-1.5 rounded-full ${u.isActive ? 'bg-parkea-600' : 'bg-danger'}`}
                                                            aria-hidden="true"
                                                        />
                                                        {u.isActive ? 'Activo' : 'Inactivo'}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-3 font-mono text-body text-neutral-600">{formatDate(u.createdAt)}</td>
                                                <td className="px-4 py-3 font-mono text-body tabular-nums text-neutral-900">{u.reservationCount}</td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}