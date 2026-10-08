import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
    Car,
    CalendarDays,
    CreditCard,
    X,
    Eye,
    Info,
    Search,
    RefreshCw,
    AlertCircle,
} from 'lucide-react';
import { getReservations } from '../services/reservationService';
import { formatCurrency, formatDuration } from '../utils/format';
import { RESERVATION_STATUS, FALLBACK_STATUS } from '../utils/reservationStatus';
// AC-10: paginated when there are more than 10 reservations. Filtering,
// pagination and ordering by start date, most recent first (AC-04), are all
// done by the backend: GET /reservations?status=&page=&limit=
const PAGE_SIZE = 10;
// AC-05: the AC lists six filters. The mockup omits "Expiradas", but it's
// kept here because the AC requires it.
const STATUS_FILTERS = [
    { value: 'All', label: 'Todas' },
    { value: 'Pending', label: 'Pendientes' },
    { value: 'Active', label: 'Activas' },
    { value: 'Finished', label: 'Finalizadas' },
    { value: 'Cancelled', label: 'Canceladas' },
    { value: 'Expired', label: 'Expiradas' },
];
// AC-02: payment status is required on every entry.
const PAYMENT_STATUS_LABELS = {
    Pending: 'Pendiente',
    Paid: 'Pagado',
    Cancelled: 'Cancelado',
    Refunded: 'Reembolsado',
};
const pad = (n) => String(n).padStart(2, '0');
// "10/06/2026 08:30", 24-hour clock, in the user's local time (mockup format).
function formatDateTime(isoString) {
    const d = new Date(isoString);
    const fecha = `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
    const hora = `${pad(d.getHours())}:${pad(d.getMinutes())}`;
    return `${fecha} ${hora}`;
}
// The backend has no human-readable reservation code, only the UUID. The
// first 8 characters are shown as a short code; the full ID is still what
// the confirmation screen (HU-15) displays, and the short code is a prefix of it.
const shortCode = (id) => String(id).slice(0, 8).toUpperCase();
function StatusBadge({ status }) {
    const { label = status, Icon, badge } = RESERVATION_STATUS[status] ?? FALLBACK_STATUS;
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border px-2.5
py-1 text-caption font-medium ${badge}`}
        >
            <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
            {label}
        </span>
    );
}
function VehicleInfo({ vehicle }) {
    // brand/model/color come from the backend's GET /reservations; rendered only
    // if present, so this screen doesn't break against a backend without them.
    const marcaModelo = vehicle?.brand && vehicle?.model ? `${vehicle.brand} ${vehicle.model}` : null;
    const details = [marcaModelo, vehicle?.color].filter(Boolean).join(' - ');
    return (
        <div className="flex items-start gap-2">
            <Car className="mt-0.5 h-4 w-4 shrink-0 text-parkea-600" aria-hidden="true" />
            <div>
                <p className="font-mono text-label font-medium text-neutral-900">{vehicle?.plate ?? '—'}</p>
                {details && <p className="text-caption text-neutral-600">{details}</p>}
            </div>
        </div>
    );
}
function DateInfo({ startTime, endTime }) {
    return (
        <div className="flex items-start gap-2">
            <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-neutral-600" aria-hidden="true" />
            <div>
                <p className="font-mono text-caption text-neutral-900">
                    <span className="sr-only">Inicio: </span>
                    {formatDateTime(startTime)}
                </p>
                <p className="font-mono text-caption text-neutral-900">
                    <span className="sr-only">Fin: </span>
                    {formatDateTime(endTime)}
                </p>
                <p className="mt-0.5 text-caption text-neutral-600">{formatDuration(startTime, endTime)}</p>
            </div>
        </div>
    );
}
function AmountInfo({ reservation }) {
    const { amount, amountType, appliedHourlyRate } = reservation;
    return (
        <div>
            {/* AC-03: unpaid → estimated total; paid → amount paid. */}
            <p className="text-caption text-neutral-600">{amountType === 'paid' ? 'Pagado' : 'Estimado'}</p>
            <p className="font-mono text-body font-medium text-neutral-900">{formatCurrency(amount)}</p>
            {appliedHourlyRate != null && (
                <p
                    className="font-mono text-caption
text-neutral-600"
                >
                    {formatCurrency(appliedHourlyRate)} / hora
                </p>
            )}
        </div>
    );
}
function StatusInfo({ reservation }) {
    const paymentLabel = PAYMENT_STATUS_LABELS[reservation.paymentStatus] ?? reservation.paymentStatus;
    return (
        <div className="flex flex-col items-start gap-1 lg:items-center">
            <StatusBadge status={reservation.status} />
            <p className="text-caption text-neutral-600">Pago: {paymentLabel}</p>
        </div>
    );
}
function Actions({ reservation, onViewDetails, onPay, onCancel, inline = false }) {
    const isPending = reservation.status === 'Pending';
    // Used in aria-labels so a screen reader announces which reservation each
    // repeated action belongs to (AC-13, WCAG 2.1 AA).
    const which = `reserva ${shortCode(reservation.id)} en ${reservation.zone?.name ?? 'la zona'}`;
    const base = `flex items-center justify-center gap-1.5 rounded-md border px-3 py-1.5 text-caption
font-medium transition-colors ${inline ? 'w-full md:w-auto md:px-5' : 'w-full'}`;
    // inline: buttons side by side (cards from 640px up); otherwise stacked
    // in a narrow column, which is what the table needs.
    const wrapper = inline
        ? 'flex w-full flex-col gap-2 md:flex-row md:flex-wrap'
        : 'flex w-full flex-col gap-1.5 sm:w-36';
    return (
        <div className={wrapper}>
            {/* AC-06: only Pending reservations can be paid (HU-17) or cancelled (HU-16). */}
            {isPending && (
                <>
                    <button
                        type="button"
                        onClick={() => onPay(reservation.id)}
                        aria-label={`Pagar la ${which}`}
                        className={`${base} border-parkea-600 text-parkea-600 hover:bg-parkea-50`}
                    >
                        <CreditCard className="h-3.5 w-3.5" aria-hidden="true" />
                        Pagar
                    </button>
                    <button
                        type="button"
                        onClick={() => onCancel(reservation.id)}
                        aria-label={`Cancelar la ${which}`}
                        className={`${base} border-danger text-danger hover:bg-danger-soft`}
                    >
                        <X className="h-3.5 w-3.5" aria-hidden="true" />
                        Cancelar
                    </button>
                </>
            )}
            {/* AC-07: every entry — including Pending, which the mockup omits — opens its confirmation (HU-15). */}
            <button
                type="button"
                onClick={() => onViewDetails(reservation.id)}
                aria-label={`Ver detalle de la ${which}`}
                className={`${base} border-parkea-600 text-parkea-600 hover:bg-parkea-50`}
            >
                <Eye className="h-3.5 w-3.5" aria-hidden="true" />
                Ver detalle
            </button>
        </div>
    );
}
function ZoneInfo({ reservation }) {
    return (
        <div>
            <p className="text-label font-medium text-neutral-900">{reservation.zone?.name}</p>
            {reservation.zone?.address && (
                <p
                    className="text-caption
text-neutral-600"
                >
                    {reservation.zone.address}
                </p>
            )}
            <p className="text-caption text-neutral-600">Cupo {reservation.spotNumber ?? '—'}</p>
        </div>
    );
}
function PageButton({ children, ...props }) {
    return (
        <button
            type="button"
            className="min-w-9 rounded-md border border-neutral-200 bg-white px-3 py-1.5 text-caption
text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600
disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-neutral-200
disabled:hover:text-neutral-900"
            {...props}
        >
            {children}
        </button>
    );
}
// Page numbers to show: all of them when there are few, otherwise the first,
// the last, and a window around the current one, with gaps as "…".
function pageItems(current, total) {
    if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
    const items = [1];
    const from = Math.max(2, current - 1);
    const to = Math.min(total - 1, current + 1);
    if (from > 2) items.push('…');
    for (let p = from; p <= to; p++) items.push(p);
    if (to < total - 1) items.push('…');
    items.push(total);
    return items;
}
export default function Reservations() {
    const navigate = useNavigate();
    const [statusFilter, setStatusFilter] = useState('All');
    const [page, setPage] = useState(1);
    const [reservations, setReservations] = useState([]);
    const [pagination, setPagination] = useState({ total: 0, totalPages: 1 });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(false);
    // Bumped by "Reintentar" to re-run the fetch with the same filter/page.
    const [reloadKey, setReloadKey] = useState(0);
    useEffect(() => {
        // Guards against out-of-order responses: if the user switches filter or
        // page while a request is still in flight, the older response must not
        // overwrite the newer one.
        let active = true;
        getReservations({ status: statusFilter, page, limit: PAGE_SIZE })
            .then(({ data }) => {
                if (!active) return;
                const totalPages = Math.max(1, data.pagination?.totalPages ?? 1);
                // If the current page no longer exists (e.g. reservations changed
                // status since it was loaded), jump to the last one that does.
                if (page > totalPages) {
                    setPage(totalPages);
                    return;
                }
                setReservations(data.reservations);
                setPagination({ total: data.pagination?.total ?? data.reservations.length, totalPages });
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
    }, [statusFilter, page, reloadKey]);
    // Every change that triggers a new fetch shows the loading state first; it's
    // set here, in the event, rather than inside the effect.
    const startLoading = () => {
        setLoading(true);
        setError(false);
    };
    const handleFilterChange = (value) => {
        if (value === statusFilter) return;
        startLoading();
        setStatusFilter(value);
        setPage(1);
    };
    const goToPage = (target) => {
        startLoading();
        setPage(target);
    };
    const handleRetry = () => {
        startLoading();
        setReloadKey((k) => k + 1);
    };
    const handleViewDetails = (id) => navigate(`/reservations/${id}`);
    const handlePay = (id) => navigate(`/reservations/${id}/payment`);
    // HU-16 not built yet — placeholder only; the confirmation dialog and the
    // cancel request are built in their own PR on top of this screen.
    const handleCancel = (id) => {
        console.log('TODO: HU-16 — open cancel confirmation dialog for reservation', id);
    };
    const isFiltered = statusFilter !== 'All';
    const isEmpty = !loading && !error && reservations.length === 0;
    const showList = !loading && !error && reservations.length > 0;
    const firstShown = (page - 1) * PAGE_SIZE + 1;
    const lastShown = firstShown + reservations.length - 1;
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <h1 className="font-display text-title uppercase text-neutral-900">Mis reservas</h1>
            <p className="mt-1 text-body text-neutral-600">
                Consulta el historial de tus reservas y su estado.
            </p>
            {/* AC-05: a dropdown while the screen is too narrow for the tabs… */}
            <div className="mt-6 md:hidden">
                <label htmlFor="status-filter" className="block text-label text-neutral-700">
                    Filtrar por estado
                </label>
                <select
                    id="status-filter"
                    value={statusFilter}
                    onChange={(e) => handleFilterChange(e.target.value)}
                    className="mt-1 w-full rounded-md border border-neutral-200 bg-white px-3 py-2
text-body text-neutral-900"
                >
                    {STATUS_FILTERS.map(({ value, label }) => (
                        <option key={value} value={value}>
                            {label}
                        </option>
                    ))}
                </select>
            </div>
            {/* …and the tabs once there's room for them. */}
            <div className="mt-6 hidden rounded-lg border border-neutral-200 bg-white px-4 md:block">
                <div
                    role="group"
                    aria-label="Filtrar reservas por estado"
                    className="flex flex-wrap gap-2"
                >
                    {STATUS_FILTERS.map(({ value, label }) => {
                        const selected = statusFilter === value;
                        return (
                            <button
                                key={value}
                                type="button"
                                onClick={() => handleFilterChange(value)}
                                aria-pressed={selected}
                                className={`border-b-2 px-4 py-4 text-label transition-colors ${
                                    selected
                                        ? 'border-parkea-600 font-medium text-parkea-600'
                                        : 'border-transparent text-neutral-600 hover:text-parkea-600'
                                }`}
                            >
                                {label}
                            </button>
                        );
                    })}
                </div>
            </div>
            <div className="mt-4">
                {loading && (
                    <p role="status" aria-live="polite" className="text-body text-neutral-600">
                        Cargando reservas…
                    </p>
                )}
                {/* AC-11 */}
                {!loading && error && (
                    <div
                        role="alert"
                        className="flex flex-col items-start gap-3 rounded-lg border
border-danger-soft bg-danger-soft p-5"
                    >
                        <p className="flex items-center gap-2 text-body text-danger">
                            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
                            No pudimos cargar tu historial de reservas. Intenta de nuevo.
                        </p>
                        <button
                            type="button"
                            onClick={handleRetry}
                            className="flex items-center gap-1.5 rounded-md border border-danger px-3
py-1.5 text-label text-danger transition-colors hover:bg-white"
                        >
                            <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
                            Reintentar
                        </button>
                    </div>
                )}
                {/* AC-08: no reservations at all */}
                {isEmpty && !isFiltered && (
                    <div
                        className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200
bg-white p-5"
                    >
                        <p className="text-body text-neutral-600">Aún no tienes reservas.</p>
                        <button
                            type="button"
                            onClick={() => navigate('/zones')}
                            className="flex items-center gap-2 rounded-md bg-parkea-600 px-4 py-2
text-label text-white transition-colors hover:bg-parkea-700"
                        >
                            <Search className="h-4 w-4" aria-hidden="true" />
                            Explorar zonas
                        </button>
                    </div>
                )}
                {/* AC-09: the active filter returned nothing */}
                {isEmpty && isFiltered && (
                    <div
                        className="flex flex-col items-start gap-3 rounded-lg border border-neutral-200
bg-white p-5"
                    >
                        <p className="text-body text-neutral-600">
                            No hay reservas que coincidan con este filtro.
                        </p>
                        <button
                            type="button"
                            onClick={() => handleFilterChange('All')}
                            className="rounded-md border border-neutral-200 px-4 py-2 text-label
text-neutral-900 transition-colors hover:border-parkea-600
hover:text-parkea-600"
                        >
                            Quitar filtro
                        </button>
                    </div>
                )}
                {showList && (
                    <>
                        {/* Desktop: table, as in the mockup */}
                        <div
                            className="hidden overflow-x-auto rounded-lg border border-neutral-200
bg-white lg:block"
                        >
                            <table className="w-full text-left">
                                <caption className="sr-only">Mis reservas</caption>
                                <thead className="bg-neutral-50 text-caption text-neutral-700">
                                    <tr>
                                        <th scope="col" className="px-5 py-3 font-medium">
                                            Código
                                        </th>
                                        <th scope="col" className="px-4 py-3 font-medium">
                                            Zona y cupo
                                        </th>
                                        <th scope="col" className="px-4 py-3 font-medium">
                                            Vehículo
                                        </th>
                                        <th scope="col" className="px-4 py-3 font-medium">
                                            Fecha y duración
                                        </th>
                                        <th scope="col" className="px-4 py-3 font-medium">
                                            Monto
                                        </th>
                                        <th
                                            scope="col"
                                            className="px-4 py-3 text-center font-medium"
                                        >
                                            Estado
                                        </th>
                                        <th scope="col" className="px-4 py-3 font-medium">
                                            Acciones
                                        </th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {reservations.map((r) => (
                                        <tr
                                            key={r.id}
                                            className={`border-t border-l-4 border-t-neutral-200
align-middle ${(RESERVATION_STATUS[r.status] ?? FALLBACK_STATUS).border}`}
                                        >
                                            <td
                                                className="px-5 py-4 font-mono text-label
text-neutral-900"
                                            >
                                                {shortCode(r.id)}
                                            </td>
                                            <td className="px-4 py-4">
                                                <ZoneInfo reservation={r} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <VehicleInfo vehicle={r.vehicle} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <DateInfo startTime={r.startTime} endTime={r.endTime} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <AmountInfo reservation={r} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <StatusInfo reservation={r} />
                                            </td>
                                            <td className="px-4 py-4">
                                                <Actions
                                                    reservation={r}
                                                    onViewDetails={handleViewDetails}
                                                    onPay={handlePay}
                                                    onCancel={handleCancel}
                                                />
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        {/* Mobile / tablet: one card per reservation (AC-14) */}
                        <ul className="flex flex-col gap-3 lg:hidden">
                            {reservations.map((r) => (
                                <li
                                    key={r.id}
                                    className={`rounded-lg border border-l-4 border-neutral-200 bg-white
p-4 ${(RESERVATION_STATUS[r.status] ?? FALLBACK_STATUS).border}`}
                                >
                                    <div className="flex flex-wrap items-start justify-between gap-2">
                                        <p className="font-mono text-label text-neutral-900">
                                            <span className="sr-only">Código </span>
                                            {shortCode(r.id)}
                                        </p>
                                        <StatusInfo reservation={r} />
                                    </div>
                                    <div className="mt-3 grid grid-cols-1 gap-4 md:grid-cols-4">
                                        <ZoneInfo reservation={r} />
                                        <DateInfo startTime={r.startTime} endTime={r.endTime} />
                                        <VehicleInfo vehicle={r.vehicle} />
                                        <AmountInfo reservation={r} />
                                    </div>
                                    <div className="mt-4">
                                        <Actions
                                            reservation={r}
                                            onViewDetails={handleViewDetails}
                                            onPay={handlePay}
                                            onCancel={handleCancel}
                                            inline
                                        />
                                    </div>
                                </li>
                            ))}
                        </ul>
                        <p className="mt-4 flex items-center gap-1.5 text-caption text-neutral-600">
                            <Info className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                            Los montos estimados pueden variar según el tiempo real de uso.
                        </p>
                        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-caption text-neutral-600" aria-live="polite">
                                Mostrando {firstShown}–{lastShown} de {pagination.total} reservas
                            </p>
                            {/* AC-10 */}
                            {pagination.totalPages > 1 && (
                                <nav
                                    aria-label="Paginación de reservas"
                                    className="flex flex-wrap
items-center gap-1.5"
                                >
                                    <PageButton onClick={() => goToPage(page - 1)} disabled={page === 1}>
                                        Anterior
                                    </PageButton>
                                    {pageItems(page, pagination.totalPages).map((item, i) =>
                                        item === '…' ? (
                                            <span
                                                key={`gap-${i}`}
                                                className="px-1 text-caption
text-neutral-600"
                                                aria-hidden="true"
                                            >
                                                …
                                            </span>
                                        ) : item === page ? (
                                            <span
                                                key={item}
                                                aria-current="page"
                                                className="min-w-9 rounded-md bg-parkea-600 px-3 py-1.5
text-center text-caption font-medium text-white"
                                            >
                                                {item}
                                            </span>
                                        ) : (
                                            <PageButton
                                                key={item}
                                                onClick={() => goToPage(item)}
                                                aria-label={`Página ${item}`}
                                            >
                                                {item}
                                            </PageButton>
                                        ),
                                    )}
                                    <PageButton
                                        onClick={() => goToPage(page + 1)}
                                        disabled={page === pagination.totalPages}
                                    >
                                        Siguiente
                                    </PageButton>
                                </nav>
                            )}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
