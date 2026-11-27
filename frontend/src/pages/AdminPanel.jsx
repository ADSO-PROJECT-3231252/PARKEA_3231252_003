import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Car, DollarSign, MapPin, RefreshCw, Users } from 'lucide-react';
import {
    getDashboardMetrics,
    getReservationsByZone,
    getZoneOccupancy,
    getPaymentsStatus,
    getRecentPayments,
    getDashboardAlerts,
} from '../services/adminService';
import { formatCurrency, formatDate, formatTime } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';
import { VEHICLE_TYPES, vehicleTypeLabel, vehicleTypePlural } from '../utils/vehicleTypes';
import VehicleTypeIcon from '../components/VehicleTypeIcon';
import { PAYMENT_STATUS_LABELS } from '../utils/paymentStatus';
import { ZONE_AXIS_WIDTH, ZONE_TOOLTIP_STYLE, zoneChartHeight, zoneTooltipPosition } from '../utils/zoneChart';
import MetricCard from '../components/MetricCard';
import ZoneAxisTick from '../components/ZoneAxisTick';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
} from 'recharts';

const RANGE_OPTIONS = [
    { value: 'today', label: 'Hoy' },
    { value: 'week', label: 'Últimos 7 días' },
    { value: 'month', label: 'Últimos 30 días' },
];

// AC-04: the revenue tile must make clear which range it totals, so it shows
// the name of the selected range under the amount, like the range buttons.
const rangeLabel = (range) => RANGE_OPTIONS.find((opt) => opt.value === range).label;

// AC-06: semantic colours + a text label on every segment, never colour alone.
// The labels count payments, so they are plural; each row of "Pagos recientes"
// is one payment and says it in singular (PAYMENT_STATUS_LABELS, #309).
const PAYMENT_STATUS_META = {
    Paid: { label: 'Pagados', color: 'var(--color-parkea-600)' },
    Pending: { label: 'Pendientes', color: 'var(--color-warning)' },
    Cancelled: { label: 'Cancelados', color: 'var(--color-danger)' },
    Refunded: { label: 'Reembolsados', color: 'var(--color-info)' },
};

const PAYMENT_METHOD_LABEL = {
    card: 'Tarjeta',
    pse: 'PSE',
};

const OCCUPANCY_BAR_COLOR = {
    full: 'bg-danger',
    almost: 'bg-warning',
    available: 'bg-parkea-600',
};

const OCCUPANCY_BADGE_CLASS = {
    full: 'border-danger text-danger bg-danger-soft',
    almost: 'border-warning text-warning bg-warning-soft',
    available: 'border-parkea-600 text-parkea-600 bg-parkea-50',
};

// HU-31 AC-14: the state of a type, as a word next to its count (never color alone)
const OCCUPANCY_TEXT_CLASS = {
    full: 'text-danger',
    almost: 'text-warning',
    available: 'text-parkea-600',
};

// HU-31 AC-14: one alert for each type of a zone with no spot free. Without
// its type (an alert of before HU-31), the sentence of the whole zone.
const fullZoneText = (alert) => (alert.vehicleType
    ? `La zona "${alert.zoneName}" no tiene cupos libres para ${vehicleTypePlural(alert.vehicleType)}.`
    : `La zona "${alert.zoneName}" ha alcanzado su capacidad máxima.`);

// HU-31 AC-14: under the bar of a zone, each of its types with its occupied
// spots and its state: "Moto  10 de 10  Llena"
function OccupancyByType({ vehicleTypes = [] }) {
    const types = VEHICLE_TYPES.map((type) => vehicleTypes.find((t) => t.vehicleType === type)).filter(Boolean);
    if (types.length === 0) return null;
    return (
        <ul
            aria-label="Ocupación por tipo de vehículo"
            className="mt-2 grid grid-cols-[auto_auto_1fr] gap-x-3 gap-y-1 text-caption text-neutral-600"
        >
            {types.map(({ vehicleType, totalSlots, occupiedSlots }) => {
                const state = getZoneAvailability(totalSlots - occupiedSlots, totalSlots);
                return (
                    <li key={vehicleType} className="col-span-3 grid grid-cols-subgrid items-center">
                        <span className="flex items-center gap-1.5 text-neutral-900">
                            <VehicleTypeIcon type={vehicleType} className="h-3.5 w-3.5 shrink-0 text-parkea-600" />
                            {vehicleTypeLabel(vehicleType)}
                            <span className="sr-only">: </span>
                        </span>
                        <span className="whitespace-nowrap text-right">
                            <span className="font-mono tabular-nums">{occupiedSlots}</span> de{' '}
                            <span className="font-mono tabular-nums">{totalSlots}</span>
                            <span className="sr-only"> ocupados, </span>
                        </span>
                        <span className={`font-medium ${OCCUPANCY_TEXT_CLASS[state.state]}`}>{state.text}</span>
                    </li>
                );
            })}
        </ul>
    );
}

function SectionLoading() {
    return (
        <p role="status" aria-live="polite" className="py-8 text-center text-body text-neutral-600">
            Cargando…
        </p>
    );
}

function SectionError({ onRetry }) {
    return (
        <div role="alert" className="flex flex-col items-center gap-2 py-8 text-center">
            <p className="text-body text-danger">No pudimos cargar esta información.</p>
            <button
                type="button"
                onClick={onRetry}
                className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
            >
                <RefreshCw className="h-4 w-4" aria-hidden="true" />
                Reintentar
            </button>
        </div>
    );
}

function SectionEmpty({ message }) {
    return <p className="py-8 text-center text-body text-neutral-600">{message}</p>;
}

export default function AdminPanel() {
    const [range, setRange] = useState('today');

    const [metrics, setMetrics] = useState(null);
    const [metricsLoading, setMetricsLoading] = useState(true);
    const [metricsError, setMetricsError] = useState(false);

    const [reservationsByZone, setReservationsByZone] = useState(null);
    // #309: the width of the chart decides where its tooltip goes
    const [zoneChartWidth, setZoneChartWidth] = useState(0);
    const [reservationsByZoneLoading, setReservationsByZoneLoading] = useState(true);
    const [reservationsByZoneError, setReservationsByZoneError] = useState(false);

    const [paymentsStatus, setPaymentsStatus] = useState(null);
    const [paymentsStatusLoading, setPaymentsStatusLoading] = useState(true);
    const [paymentsStatusError, setPaymentsStatusError] = useState(false);

    const [occupancy, setOccupancy] = useState(null);
    const [occupancyLoading, setOccupancyLoading] = useState(true);
    const [occupancyError, setOccupancyError] = useState(false);

    const [recentPayments, setRecentPayments] = useState(null);
    const [recentPaymentsLoading, setRecentPaymentsLoading] = useState(true);
    const [recentPaymentsError, setRecentPaymentsError] = useState(false);

    const [alerts, setAlerts] = useState([]);

    // AC-03: the range selector must refresh every metric/chart tied to a
    // period. Occupancy, recent payments and alerts are real-time/point-in-time
    // views (see AC-07/08/09), so they're loaded once and don't depend on range.
    // Each loader only settles state from its own response (never resets
    // loading/error up front) so it can run directly from an effect; the
    // "Reintentar" buttons reset that section's state themselves before
    // calling the loader again — same split used in Zones.jsx.
    const loadMetrics = useCallback(() => {
        getDashboardMetrics(range)
            .then((res) => { setMetrics(res.data.metrics); setMetricsError(false); })
            .catch(() => setMetricsError(true))
            .finally(() => setMetricsLoading(false));
    }, [range]);

    const loadReservationsByZone = useCallback(() => {
        getReservationsByZone(range)
            .then((res) => { setReservationsByZone(res.data.reservationsByZone); setReservationsByZoneError(false); })
            .catch(() => setReservationsByZoneError(true))
            .finally(() => setReservationsByZoneLoading(false));
    }, [range]);

    const loadPaymentsStatus = useCallback(() => {
        getPaymentsStatus(range)
            .then((res) => { setPaymentsStatus(res.data.paymentStatus); setPaymentsStatusError(false); })
            .catch(() => setPaymentsStatusError(true))
            .finally(() => setPaymentsStatusLoading(false));
    }, [range]);

    const loadOccupancy = useCallback(() => {
        getZoneOccupancy()
            .then((res) => { setOccupancy(res.data.occupancy); setOccupancyError(false); })
            .catch(() => setOccupancyError(true))
            .finally(() => setOccupancyLoading(false));
    }, []);

    const loadRecentPayments = useCallback(() => {
        getRecentPayments()
            .then((res) => { setRecentPayments(res.data.recentPayments); setRecentPaymentsError(false); })
            .catch(() => setRecentPaymentsError(true))
            .finally(() => setRecentPaymentsLoading(false));
    }, []);

    // AC-09: alerts are best-effort context, not a section on its own — a
    // failure here shouldn't block the rest of the dashboard or show an error.
    // Only the full-zone alerts are shown: the panel only knows how to write
    // that sentence, with the zone name the backend sends (#313).
    const loadAlerts = useCallback(() => {
        getDashboardAlerts()
            .then((res) => setAlerts(res.data.alerts.filter((alert) => alert.type === 'zone_full')))
            .catch(() => setAlerts([]));
    }, []);

    useEffect(() => {
        loadMetrics();
        loadReservationsByZone();
        loadPaymentsStatus();
    }, [loadMetrics, loadReservationsByZone, loadPaymentsStatus]);

    useEffect(() => {
        loadOccupancy();
        loadRecentPayments();
        loadAlerts();
    }, [loadOccupancy, loadRecentPayments, loadAlerts]);
    // Auto-refresh every 5s while the panel stays open, so new reservations,
    // payments and alerts show up without the admin having to do anything.
    // The loaders never flip loading back to true on their own (see above),
    // so this swaps in fresh data quietly, with no flicker or loading reset.
    useEffect(() => {
        const interval = setInterval(() => {
            loadMetrics();
            loadReservationsByZone();
            loadPaymentsStatus();
            loadOccupancy();
            loadRecentPayments();
            loadAlerts();
        }, 5000);
        return () => clearInterval(interval);
    }, [
        loadMetrics,
        loadReservationsByZone,
        loadPaymentsStatus,
        loadOccupancy,
        loadRecentPayments,
        loadAlerts,
    ]);

    const handleRetryMetrics = () => {
        setMetricsLoading(true);
        setMetricsError(false);
        loadMetrics();
    };

    const handleRetryReservationsByZone = () => {
        setReservationsByZoneLoading(true);
        setReservationsByZoneError(false);
        loadReservationsByZone();
    };

    const handleRetryPaymentsStatus = () => {
        setPaymentsStatusLoading(true);
        setPaymentsStatusError(false);
        loadPaymentsStatus();
    };

    const handleRetryOccupancy = () => {
        setOccupancyLoading(true);
        setOccupancyError(false);
        loadOccupancy();
    };

    const handleRetryRecentPayments = () => {
        setRecentPaymentsLoading(true);
        setRecentPaymentsError(false);
        loadRecentPayments();
    };

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <title>Panel administrativo | PARKEA</title>
            <h1 className="sr-only">Panel administrativo</h1>
            {alerts.length > 0 && (
                <div className="mb-6 flex flex-col gap-2">
                    {alerts.map((alert, index) => (
                        <div
                            // HU-31: a zone can have one alert for each type
                            key={`${alert.type}-${alert.zoneId ?? index}-${alert.vehicleType ?? ''}`}
                            role="alert"
                            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-warning bg-warning-soft px-5 py-4"
                        >
                            <div className="flex min-w-0 items-center gap-3"><AlertTriangle
                                className="h-5 w-5 shrink-0 text-warning"
                                aria-hidden="true"
                            />
                                <p className="break-words text-body text-neutral-900">
                                    {fullZoneText(alert)}
                                </p>
                            </div>
                            <Link
                                to="/admin/zones"
                                className="inline-flex min-h-6 shrink-0 items-center text-label text-warning underline hover:text-neutral-900"
                            >
                                Ver zonas
                            </Link>
                        </div>
                    ))}
                </div>
            )}

            <div className="mb-6 flex justify-end">
                <div
                    role="group"
                    aria-label="Rango de tiempo del panel"
                    className="inline-flex rounded-md border border-neutral-200 bg-white p-1"
                >
                    {RANGE_OPTIONS.map((opt) => (
                        <button
                            key={opt.value}
                            type="button"
                            aria-pressed={range === opt.value}
                            onClick={() => setRange(opt.value)}
                            className={`rounded px-2 py-1.5 text-label transition-colors sm:px-3 ${range === opt.value
                                ? 'bg-parkea-600 text-white'
                                : 'text-neutral-600 hover:text-parkea-600'
                                }`}
                        >
                            {opt.label}
                        </button>
                    ))}
                </div>
            </div>

            {metricsError ? (
                <SectionError onRetry={handleRetryMetrics} />
            ) : metricsLoading ? (
                <SectionLoading />
            ) : (
                <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
                    <MetricCard
                        icon={Car}
                        label="Reservas activas"
                        value={metrics.activeReservations}
                        sublabel="En este momento"
                    />
                    <MetricCard
                        icon={DollarSign}
                        label="Ingresos"
                        value={formatCurrency(metrics.revenue)}
                        sublabel={rangeLabel(range)}
                    />
                    <MetricCard
                        icon={MapPin}
                        label="Zonas activas"
                        value={metrics.activeZones}
                        sublabel="En operación"
                    />
                    <MetricCard
                        icon={Users}
                        label="Usuarios registrados"
                        value={metrics.registeredUsers}
                        sublabel="Total en el sistema"
                    />
                </div>
            )}

            <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
                <section className="rounded-lg border border-neutral-200 bg-white p-5">
                    <h2 className="mb-4 text-title font-display uppercase text-neutral-900">
                        Reservas por zona
                    </h2>
                    {reservationsByZoneError ? (
                        <SectionError onRetry={handleRetryReservationsByZone} />
                    ) : reservationsByZoneLoading ? (
                        <SectionLoading />
                    ) : reservationsByZone.every((zone) => zone.reservationCount === 0) ? (
                        // AC-10: the backend lists every active zone, even with 0 reservations,
                        // so "no data" means every count is 0, not an empty list.
                        <SectionEmpty message="No hay reservas en este rango." />
                    ) : (
                        <>
                            {/* #309: one row per zone, so the names never overlap */}
                            <div style={{ width: '100%', height: zoneChartHeight(reservationsByZone.length) }}>
                                <ResponsiveContainer onResize={(width) => setZoneChartWidth(width)}>
                                    <BarChart
                                        data={reservationsByZone}
                                        layout="vertical"
                                        margin={{ left: 8, right: 16 }}
                                    >
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                                        <XAxis type="number" allowDecimals={false} />
                                        {/* #309: each name on one line; one that does not fit is cut
                                            with "…", and the tooltip of its bar has it complete */}
                                        <YAxis
                                            type="category"
                                            dataKey="zoneName"
                                            width={ZONE_AXIS_WIDTH}
                                            tick={<ZoneAxisTick />}
                                        />
                                        <Tooltip
                                            formatter={(value) => [value, 'Reservas']}
                                            contentStyle={ZONE_TOOLTIP_STYLE}
                                            position={zoneTooltipPosition(zoneChartWidth)}
                                        />
                                        <Bar dataKey="reservationCount" fill="var(--color-parkea-600)" radius={[0, 4, 4, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                            {/* AC-13: accessible text alternative for the chart above. The
                                div hides it: a table ignores the 1 px width of sr-only and,
                                with long zone names, made the page scroll sideways. */}
                            <div className="sr-only">
                                <table>
                                    <caption>Reservas por zona en el rango seleccionado</caption>
                                    <thead>
                                        <tr>
                                            <th scope="col">Zona</th>
                                            <th scope="col">Reservas</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {reservationsByZone.map((zona) => (
                                            <tr key={zona.zoneId}>
                                                <td>{zona.zoneName}</td>
                                                <td>{zona.reservationCount}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </>
                    )}
                </section>

                <section className="rounded-lg border border-neutral-200 bg-white p-5">
                    <h2 className="mb-4 text-title font-display uppercase text-neutral-900">
                        Estado de pagos
                    </h2>
                    {paymentsStatusError ? (
                        <SectionError onRetry={handleRetryPaymentsStatus} />
                    ) : paymentsStatusLoading ? (
                        <SectionLoading />
                    ) : Object.values(paymentsStatus).every((count) => count === 0) ? (
                        <SectionEmpty message="No hay pagos en este rango." />
                    ) : (
                        <ul className="space-y-3">
                            {Object.entries(PAYMENT_STATUS_META).map(([key, meta]) => {
                                const count = paymentsStatus[key] || 0;
                                const total = Object.values(paymentsStatus).reduce((sum, c) => sum + c, 0);
                                const pct = total > 0 ? Math.round((count / total) * 100) : 0;
                                return (
                                    <li key={key} className="flex items-center gap-3">
                                        <span
                                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                                            style={{ backgroundColor: meta.color }}
                                            aria-hidden="true"
                                        />
                                        <span className="w-24 shrink-0 text-label text-neutral-900">{meta.label}</span>
                                        <span className="w-8 shrink-0 text-label text-neutral-600">{count}</span>
                                        <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                            <div
                                                className="h-full rounded-full"
                                                style={{ width: `${pct}%`, backgroundColor: meta.color }}
                                            />
                                        </div>
                                        <span className="w-10 shrink-0 text-right text-label text-neutral-600">{pct}%</span>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
                <section className="rounded-lg border border-neutral-200 bg-white p-5">
                    <h2 className="mb-4 text-title font-display uppercase text-neutral-900">
                        Ocupación por zona
                    </h2>
                    {occupancyError ? (
                        <SectionError onRetry={handleRetryOccupancy} />
                    ) : occupancyLoading ? (
                        <SectionLoading />
                    ) : occupancy.length === 0 ? (
                        <SectionEmpty message="No hay zonas activas." />
                    ) : (
                        <ul className="space-y-4">
                            {occupancy.map((zona) => {
                                const available = zona.totalSlots - zona.occupiedSlots;
                                const availability = getZoneAvailability(available, zona.totalSlots);
                                const pct = zona.totalSlots > 0
                                    ? Math.round((zona.occupiedSlots / zona.totalSlots) * 100)
                                    : 0;
                                return (
                                    <li key={zona.zoneId}>
                                        {/* #309: a long name goes on to the next line instead of being cut */}
                                        <div className="mb-1 flex items-start justify-between gap-2">
                                            <span className="min-w-0 break-words text-label text-neutral-900">
                                                {zona.zoneName}
                                            </span>
                                            <span
                                                className={`shrink-0 rounded-full border px-2.5 py-0.5 text-caption ${OCCUPANCY_BADGE_CLASS[availability.state]}`}
                                            >
                                                {availability.text}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="h-2 flex-1 overflow-hidden rounded-full bg-neutral-100">
                                                <div
                                                    className={`h-full rounded-full ${OCCUPANCY_BAR_COLOR[availability.state]}`}
                                                    style={{ width: `${pct}%` }}
                                                />
                                            </div>
                                            <span className="shrink-0 text-caption text-neutral-600">
                                                {zona.occupiedSlots} de {zona.totalSlots}
                                            </span>
                                        </div>
                                        <OccupancyByType vehicleTypes={zona.vehicleTypes} />
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </section>

                <section className="rounded-lg border border-neutral-200 bg-white p-5">
                    <h2 className="mb-4 text-title font-display uppercase text-neutral-900">
                        Pagos recientes
                    </h2>
                    {recentPaymentsError ? (
                        <SectionError onRetry={handleRetryRecentPayments} />
                    ) : recentPaymentsLoading ? (
                        <SectionLoading />
                    ) : recentPayments.length === 0 ? (
                        <SectionEmpty message="No hay pagos registrados." />
                    ) : (
                        <div
                            className="overflow-x-auto focus:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600"
                            tabIndex={0}
                            role="region"
                            aria-label="Pagos recientes"
                        >
                            <table className="w-full text-left">
                                <thead>
                                    <tr className="border-b border-neutral-200 text-caption text-neutral-600">
                                        <th scope="col" className="py-2 pr-3 font-normal">Usuario</th>
                                        <th scope="col" className="py-2 pr-3 font-normal">Zona</th>
                                        <th scope="col" className="py-2 pr-3 font-normal">Monto</th>
                                        <th scope="col" className="py-2 pr-3 font-normal">Fecha</th>
                                        <th scope="col" className="py-2 pr-3 font-normal">Método</th>
                                        <th scope="col" className="py-2 font-normal">Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {recentPayments.map((pago) => (
                                        <tr key={pago.id} className="border-b border-neutral-100 last:border-0">
                                            <td className="py-2.5 pr-3 text-label text-neutral-900">
                                                {pago.reservation?.user?.fullName ?? '—'}
                                            </td>
                                            <td className="py-2.5 pr-3 text-label text-neutral-900">
                                                {pago.reservation?.zone?.name ?? '—'}
                                            </td>
                                            <td className="py-2.5 pr-3 text-label text-neutral-900">
                                                {formatCurrency(pago.amount)}
                                            </td>
                                            <td className="whitespace-nowrap py-2.5 pr-3 text-label text-neutral-900">
                                                {pago.paidAt
                                                    ? `${formatDate(pago.paidAt)} ${formatTime(pago.paidAt)}`
                                                    : '—'}
                                            </td>
                                            <td className="py-2.5 pr-3 text-label text-neutral-900">
                                                {PAYMENT_METHOD_LABEL[pago.paymentMethod] ?? '—'}
                                            </td>
                                            <td className="py-2.5">
                                                <span
                                                    className="rounded-full border px-2.5 py-0.5 text-caption"
                                                    style={{
                                                        borderColor: PAYMENT_STATUS_META[pago.paymentStatus]?.color,
                                                        color: PAYMENT_STATUS_META[pago.paymentStatus]?.color,
                                                    }}
                                                >
                                                    {PAYMENT_STATUS_LABELS[pago.paymentStatus] ?? pago.paymentStatus}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    )}
                </section>
            </div>
        </div>
    );
}
