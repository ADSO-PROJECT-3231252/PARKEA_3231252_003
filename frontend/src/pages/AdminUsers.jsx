import { useCallback, useEffect, useState } from 'react';
import {
    Users,
    UserCheck,
    UserX,
    ShieldCheck,
    Search,
    X,
    Filter,
    UserCog,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    History,
    Activity,
    AlertCircle,
    CheckCircle2,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getUsers, getUserLogs, changeUserRole, changeUserStatus } from '../services/adminService';
import { translateError } from '../utils/errorMessages';
import { getInitials, formatDate, formatTime } from '../utils/format';
import { PAGE_SIZE_OPTIONS, ROLE_LABELS, describeLog, getPageWindow } from '../utils/adminUsersHelpers';
import MetricCard from '../components/MetricCard';
import ConfirmDialog from '../components/ConfirmDialog';
import LogDetailsModal from '../components/LogDetailsModal';

// AC-15: the list is paginated when there are more than 10 accounts.
const DEFAULT_PAGE_SIZE = PAGE_SIZE_OPTIONS[0];
const SEARCH_DEBOUNCE_MS = 400;
const SUCCESS_MESSAGE_MS = 3000;
const VISIBLE_LOGS = 3;

const percent = (part, total) => (total > 0 ? `${((part / total) * 100).toFixed(1)}% del total` : '—');

export default function AdminUsers() {
    const { user: currentUser } = useAuth();

    // ----- User list -----
    const [users, setUsers] = useState([]);
    const [summary, setSummary] = useState({ total: 0, active: 0, inactive: 0, admins: 0 });
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    const [lastUpdated, setLastUpdated] = useState(null);
    // Bumped by "Reintentar" and after every role/status change to re-run the
    // fetch with the same filters and page.
    const [reloadKey, setReloadKey] = useState(0);

    // ----- Filters and pagination (AC-04, AC-15) -----
    const [search, setSearch] = useState('');
    const [debouncedSearch, setDebouncedSearch] = useState('');
    const [role, setRole] = useState('');
    const [status, setStatus] = useState('');
    const [page, setPage] = useState(1);
    const [limit, setLimit] = useState(DEFAULT_PAGE_SIZE);

    // ----- Recent changes log (AC-14) -----
    const [logs, setLogs] = useState([]);
    const [logsLoading, setLogsLoading] = useState(true);
    const [logsError, setLogsError] = useState(false);
    const [logsExpanded, setLogsExpanded] = useState(false);
    const [logsReloadKey, setLogsReloadKey] = useState(0);
    const [selectedLog, setSelectedLog] = useState(null);

    // ----- Role/status confirmation dialog (AC-05, AC-06, AC-07) -----
    // { type: 'role' | 'status', user }
    const [pendingAction, setPendingAction] = useState(null);
    const [confirming, setConfirming] = useState(false);
    const [actionError, setActionError] = useState('');
    const [successMessage, setSuccessMessage] = useState('');

    useEffect(() => {
        // Guards against out-of-order responses: a response that arrives after
        // a newer request has started must not overwrite the newer data.
        let active = true;
        getUsers({
            search: debouncedSearch || undefined,
            role: role || undefined,
            status: status || undefined,
            page,
            limit,
        })
            .then(({ data }) => {
                if (!active) return;
                const totalPages = Math.max(1, data.pagination?.totalPages ?? 1);
                // If the current page no longer exists (e.g. its last user was
                // just deactivated while filtering by "Activo"), jump to the last
                // one that does.
                if (page > totalPages) {
                    setPage(totalPages);
                    return;
                }
                setUsers(data.users);
                setSummary(data.summary);
                setPagination({ total: data.pagination?.total ?? data.users.length, totalPages });
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
    }, [debouncedSearch, role, status, page, limit, reloadKey]);

    useEffect(() => {
        let active = true;
        getUserLogs()
            .then(({ data }) => {
                if (!active) return;
                setLogs(data.logs);
                setLogsError(false);
                setLogsLoading(false);
            })
            .catch(() => {
                if (!active) return;
                setLogsError(true);
                setLogsLoading(false);
            });
        return () => {
            active = false;
        };
    }, [logsReloadKey]);

    // Search is sent to the backend only after the user stops typing.
    useEffect(() => {
        const timer = setTimeout(() => {
            const trimmed = search.trim();
            if (trimmed === debouncedSearch) return;
            setLoading(true);
            setDebouncedSearch(trimmed);
            setPage(1);
        }, SEARCH_DEBOUNCE_MS);
        return () => clearTimeout(timer);
    }, [search, debouncedSearch]);

    useEffect(() => {
        if (!successMessage) return;
        const timer = setTimeout(() => setSuccessMessage(''), SUCCESS_MESSAGE_MS);
        return () => clearTimeout(timer);
    }, [successMessage]);

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
        setPage(1);
    };

    const handleStatusFilter = (value) => {
        if (value === status) return;
        startLoading();
        setStatus(value);
        setPage(1);
    };

    const handleLimitChange = (value) => {
        if (value === limit) return;
        startLoading();
        setLimit(value);
        setPage(1);
    };

    const handleClearFilters = () => {
        // Only the values already sent to the backend trigger a new fetch.
        if (debouncedSearch || role || status) startLoading();
        setSearch('');
        setDebouncedSearch('');
        setRole('');
        setStatus('');
        setPage(1);
    };

    const goToPage = (target) => {
        if (target === page) return;
        startLoading();
        setPage(target);
    };

    const handleRetry = () => {
        startLoading();
        setReloadKey((k) => k + 1);
    };

    const hasActiveFilters = Boolean(search || role || status);

    // AC-08 / AC-10: the signed-in admin and the primary admin can't be changed.
    const lockedReason = (u) => {
        if (u.id === currentUser?.id) return 'No puedes modificar tu propio rol ni estado.';
        if (u.isPrimaryAdmin) return 'El administrador principal no puede modificarse.';
        return '';
    };

    const openAction = (type, u) => {
        setActionError('');
        setPendingAction({ type, user: u });
    };

    const closeAction = useCallback(() => {
        setPendingAction(null);
        setActionError('');
    }, []);

    const closeLogDetails = useCallback(() => setSelectedLog(null), []);

    const handleConfirmAction = async () => {
        if (!pendingAction) return;
        const { type, user: target } = pendingAction;
        setConfirming(true);
        setActionError('');
        try {
            if (type === 'role') {
                const nextRole = target.role === 'admin' ? 'user' : 'admin';
                await changeUserRole(target.id, nextRole);
                setSuccessMessage(`Se actualizó el rol de ${target.fullName} a ${ROLE_LABELS[nextRole]}.`);
            } else {
                await changeUserStatus(target.id, !target.isActive);
                setSuccessMessage(`${target.fullName} fue ${target.isActive ? 'desactivado' : 'activado'} correctamente.`);
            }
            setPendingAction(null);
            // Refresh without the "Cargando..." state, so the table stays on
            // screen and only its rows change.
            setReloadKey((k) => k + 1);
            setLogsReloadKey((k) => k + 1);
        } catch (err) {
            setActionError(translateError(err.response?.data?.code));
        } finally {
            setConfirming(false);
        }
    };

    // AC-07: the dialog states the account affected and the effect of the change.
    let dialogTitle = '';
    let dialogMessage = '';
    if (pendingAction?.type === 'role') {
        const { fullName, role: currentRole } = pendingAction.user;
        const nextRole = currentRole === 'admin' ? 'user' : 'admin';
        dialogTitle = 'Cambiar rol';
        dialogMessage = `Vas a cambiar el rol de ${fullName} de ${ROLE_LABELS[currentRole]} a ${ROLE_LABELS[nextRole]}.`;
    } else if (pendingAction?.type === 'status') {
        const { fullName, isActive } = pendingAction.user;
        dialogTitle = isActive ? 'Desactivar cuenta' : 'Activar cuenta';
        dialogMessage = isActive
            ? `Vas a desactivar la cuenta de ${fullName}. No podrá iniciar sesión hasta que la vuelvas a activar.`
            : `Vas a activar la cuenta de ${fullName}.`;
    }

    const rangeStart = pagination.total === 0 ? 0 : (page - 1) * limit + 1;
    const rangeEnd = Math.min(page * limit, pagination.total);
    const pageWindow = getPageWindow(page, pagination.totalPages);
    const visibleLogs = logsExpanded ? logs : logs.slice(0, VISIBLE_LOGS);
    const pageButton =
        'flex h-7 w-7 items-center justify-center rounded-md text-neutral-600 hover:bg-neutral-100 ' +
        'disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent';

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

            {/* AC-14: confirmation after every completed action. The live region
                is always in the page so screen readers announce the new text. */}
            <div role="status" aria-live="polite">
                {successMessage && (
                    <p className="mt-4 flex items-center gap-2 rounded-md bg-parkea-50 px-3 py-2 text-caption text-parkea-700">
                        <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
                        {successMessage}
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
                                        <th scope="col" className="min-w-[220px] px-4 py-3 font-medium">Nombre</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Correo electrónico</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Documento</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Rol</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Estado</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Fecha de registro</th>
                                        <th scope="col" className="px-4 py-3 font-medium">N.º de reservas</th>
                                        <th scope="col" className="px-4 py-3 font-medium">Acciones</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {users.map((u) => {
                                        const reason = lockedReason(u);
                                        const locked = Boolean(reason);
                                        return (
                                            <tr
                                                key={u.id}
                                                className={`border-b border-neutral-100 align-top last:border-0 ${locked ? 'bg-neutral-50' : ''}`}
                                            >
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
                                                <td className="px-4 py-3 text-body text-neutral-600">
                                                    {/* <wbr> lets a long email break after the @ instead of widening the table */}
                                                    {u.email.split('@')[0]}@<wbr />{u.email.split('@')[1]}
                                                </td>
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
                                                <td className="whitespace-nowrap px-4 py-3 font-mono text-body text-neutral-600">{formatDate(u.createdAt)}</td>
                                                <td className="px-4 py-3 font-mono text-body tabular-nums text-neutral-900">{u.reservationCount}</td>
                                                <td className="px-4 py-3">
                                                    <div className="flex items-center gap-2">
                                                        <button
                                                            type="button"
                                                            onClick={() => openAction('role', u)}
                                                            disabled={locked}
                                                            aria-label={`Cambiar rol de ${u.fullName}`}
                                                            className="flex items-center gap-1 whitespace-nowrap rounded-md border border-parkea-600 bg-white px-2.5 py-1 text-caption text-parkea-600 transition-colors hover:bg-parkea-50 disabled:cursor-not-allowed disabled:border-neutral-200 disabled:text-neutral-500 disabled:hover:bg-transparent"
                                                        >
                                                            <UserCog className="h-3.5 w-3.5" aria-hidden="true" />
                                                            Cambiar rol
                                                        </button>
                                                        <button
                                                            type="button"
                                                            role="switch"
                                                            aria-checked={u.isActive}
                                                            aria-label={`Cuenta activa de ${u.fullName}`}
                                                            onClick={() => openAction('status', u)}
                                                            disabled={locked}
                                                            className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${u.isActive ? 'border-parkea-600 bg-parkea-600' : 'border-neutral-300 bg-neutral-300'}`}
                                                        >
                                                            <span
                                                                className={`absolute left-0.5 top-0.5 h-3.5 w-3.5 rounded-full bg-white shadow-sm transition-transform ${u.isActive ? 'translate-x-4' : 'translate-x-0'}`}
                                                                aria-hidden="true"
                                                            />
                                                        </button>
                                                    </div>
                                                    {locked && (
                                                        <p className="mt-1 max-w-[190px] text-caption text-neutral-600">{reason}</p>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* AC-15: pagination */}
                        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-neutral-200 px-4 py-3">
                            <p className="text-caption text-neutral-600">
                                Mostrando {rangeStart} a {rangeEnd} de {pagination.total} usuarios
                            </p>
                            <nav aria-label="Paginación de usuarios" className="flex items-center gap-1">
                                <button
                                    type="button"
                                    onClick={() => goToPage(1)}
                                    disabled={page === 1}
                                    aria-label="Primera página"
                                    className={pageButton}
                                >
                                    <ChevronsLeft className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goToPage(page - 1)}
                                    disabled={page === 1}
                                    aria-label="Página anterior"
                                    className={pageButton}
                                >
                                    <ChevronLeft className="h-4 w-4" aria-hidden="true" />
                                </button>
                                {pageWindow.map((item) =>
                                    typeof item === 'number' ? (
                                        <button
                                            key={item}
                                            type="button"
                                            onClick={() => goToPage(item)}
                                            aria-label={`Página ${item}`}
                                            aria-current={item === page ? 'page' : undefined}
                                            className={`flex h-7 w-7 items-center justify-center rounded-md text-label transition-colors ${item === page ? 'bg-parkea-600 font-medium text-white' : 'text-neutral-600 hover:bg-neutral-100'}`}
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
                                    onClick={() => goToPage(page + 1)}
                                    disabled={page === pagination.totalPages}
                                    aria-label="Página siguiente"
                                    className={pageButton}
                                >
                                    <ChevronRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                                <button
                                    type="button"
                                    onClick={() => goToPage(pagination.totalPages)}
                                    disabled={page === pagination.totalPages}
                                    aria-label="Última página"
                                    className={pageButton}
                                >
                                    <ChevronsRight className="h-4 w-4" aria-hidden="true" />
                                </button>
                            </nav>
                            <div className="flex items-center gap-2">
                                <label htmlFor="page-size" className="text-caption text-neutral-600">
                                    Filas por página
                                </label>
                                <select
                                    id="page-size"
                                    value={limit}
                                    onChange={(e) => handleLimitChange(Number(e.target.value))}
                                    className="rounded-md border border-neutral-200 px-2 py-1 text-caption text-neutral-900 focus:outline-none focus:ring-2 focus:ring-parkea-600"
                                >
                                    {PAGE_SIZE_OPTIONS.map((n) => (
                                        <option key={n} value={n}>
                                            {n}
                                        </option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </>
                )}
            </div>

            {/* AC-14: recent changes log */}
            <section aria-labelledby="recent-changes-title" className="mt-6 rounded-lg border border-neutral-200 bg-white p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-parkea-600">
                            <History className="h-4 w-4 text-white" aria-hidden="true" />
                        </span>
                        <div>
                            <h2 id="recent-changes-title" className="text-body font-semibold text-neutral-900">
                                Cambios recientes
                            </h2>
                            <p className="text-caption text-neutral-600">Actividad de administración de usuarios</p>
                        </div>
                    </div>
                    {logs.length > VISIBLE_LOGS && (
                        <button
                            type="button"
                            onClick={() => setLogsExpanded((v) => !v)}
                            aria-expanded={logsExpanded}
                            className="text-label text-parkea-600 hover:underline"
                        >
                            {logsExpanded ? 'Ver menos' : 'Ver historial'}
                        </button>
                    )}
                </div>

                <div className="mt-4 divide-y divide-neutral-100">
                    {logsLoading && <p className="text-body text-neutral-600">Cargando actividad…</p>}
                    {!logsLoading && logsError && (
                        <p role="alert" className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar el historial de cambios.
                        </p>
                    )}
                    {!logsLoading && !logsError && logs.length === 0 && (
                        <p className="text-body text-neutral-600">Aún no hay cambios registrados.</p>
                    )}
                    {!logsLoading &&
                        !logsError &&
                        visibleLogs.map((log) => (
                            <div
                                key={log.id}
                                className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4"
                            >
                                <div className="flex min-w-0 flex-col gap-1 sm:flex-row sm:items-center sm:gap-4">
                                    <p className="w-48 shrink-0 whitespace-nowrap font-mono text-caption text-neutral-600">
                                        {formatDate(log.created_at)} {formatTime(log.created_at)}
                                    </p>
                                    <p className="break-words text-body text-neutral-800">{describeLog(log)}</p>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setSelectedLog(log)}
                                    className="shrink-0 self-start text-label text-parkea-600 hover:underline"
                                >
                                    Ver detalles
                                </button>
                            </div>
                        ))}
                </div>
            </section>

            <ConfirmDialog
                open={Boolean(pendingAction)}
                variant={pendingAction?.type === 'status' && pendingAction.user.isActive ? 'danger' : 'default'}
                title={dialogTitle}
                message={dialogMessage}
                confirmLabel="Confirmar cambio"
                cancelLabel="Cancelar"
                confirming={confirming}
                error={actionError}
                onConfirm={handleConfirmAction}
                onCancel={closeAction}
            />
            <LogDetailsModal log={selectedLog} onClose={closeLogDetails} />
        </div>
    );
}