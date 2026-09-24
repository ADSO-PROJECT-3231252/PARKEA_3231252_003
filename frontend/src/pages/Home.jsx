import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
    MapPin,
    CalendarCheck,
    Calendar,
    Map,
    History,
    ChevronRight,
    CheckCircle2,
    ShieldCheck,
    LayoutGrid,
    BarChart3,
    Users,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getZones } from '../services/zoneService';
import { getReservations } from '../services/reservationService';
import { formatDate, formatTime, formatCurrency } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';

import heroVisitorIllustration from '../assets/hero-visitor.png';
import heroUserIllustration from '../assets/hero-user.png';
import heroAdminIllustration from '../assets/hero-admin.png';

function HeroIllustration({ src, height = 132, right = 32, top }) {
    if (!src) return null;
    return (
        <img
            src={src}
            alt=""
            aria-hidden="true"
            style={
                top !== undefined
                    ? { height: `${height}px`, right: `${right}px`, top: `${top}px` }
                    : { height: `${height}px`, right: `${right}px`, top: '50%', transform: 'translateY(-50%)' }
            }
            className="hidden absolute w-auto lg:block"
        />
    );
}

const RESERVATION_STATUS_LABEL = {
    Pending: { text: 'Pendiente de pago', color: 'text-warning' },
    Active: { text: 'Confirmada', color: 'text-parkea-600' },
    Finished: { text: 'Finalizada', color: 'text-neutral-600' },
    Cancelled: { text: 'Cancelada', color: 'text-danger' },
    Expired: { text: 'Expirada', color: 'text-danger' },
};

const ZONE_AVAILABILITY_COLORS = {
    full: 'text-danger',
    almost: 'text-warning',
    available: 'text-parkea-600',
};

function LoadingMessage() {
    return (
        <p role="status" aria-live="polite" className="text-body text-neutral-600">
            Cargando…
        </p>
    );
}

function ErrorMessage() {
    return (
        <p role="alert" className="text-body text-danger">
            No pudimos cargar tu información.
        </p>
    );
}

function CardShell({ title, icon: Icon, children, footerTo, footerLabel }) {
    return (
        <div className="flex flex-col rounded-lg border border-neutral-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
                <h3 className="text-title font-display uppercase text-neutral-900">{title}</h3>
                <Icon className="h-6 w-6 text-parkea-600" aria-hidden="true" />
            </div>
            <div className="flex-1">{children}</div>
            <Link
                to={footerTo}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-parkea-600 px-4 py-2 text-label text-parkea-600 transition-colors hover:bg-parkea-50"
            >
                {footerLabel}
                <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
        </div>
    );
}

function VisitorHome() {
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                    <h1 className="text-hero font-display uppercase text-parkea-700">
                        Reserva tu parqueo
                        <br />
                        fácil, rápido y seguro
                    </h1>
                    <p className="mt-3 text-subtitle text-neutral-900">
                        Encuentra, reserva y paga tu parqueo en las mejores zonas.
                    </p>
                    <Link
                        to="/zones"
                        className="mt-6 inline-flex items-center gap-2 rounded-md bg-parkea-600 px-12 py-3 text-subtitle text-white transition-colors hover:bg-parkea-700"
                    >
                        <MapPin className="h-6 w-6" aria-hidden="true" />
                        Ver zonas disponibles
                    </Link>
                </div>
                <HeroIllustration src={heroVisitorIllustration} height={520} right={110} />
            </section>

            <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <div className="rounded-lg bg-parkea-50 p-6 text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                        <CalendarCheck className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Reservas</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Reserva tu cupo de parqueo con
                        <br className="hidden md:block" />
                        anticipación y asegura tu espacio.
                    </p>
                </div>
                <div className="rounded-lg bg-parkea-50 p-6 text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                        <Map className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Zonas</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Explora zonas de parqueo cercanas,
                        <br className="hidden md:block" />
                        con información clara y actualizada.
                    </p>
                </div>
                <div className="rounded-lg bg-parkea-50 p-6 text-center">
                    <span className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                        <History className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Historial</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Consulta tus reservas pasadas
                        <br className="hidden md:block" />
                        y próximas en un solo lugar.
                    </p>
                </div>
            </section>
        </div>
    );
}

function AuthenticatedHome({ user }) {
    const [latestReservation, setLatestReservation] = useState(null);
    const [reservationsLoading, setReservationsLoading] = useState(true);
    const [reservationsError, setReservationsError] = useState(false);

    const [zones, setZones] = useState([]);
    const [zonesLoading, setZonesLoading] = useState(true);
    const [zonesError, setZonesError] = useState(false);

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState(false);

    useEffect(() => {
        let active = true;

        getReservations({ limit: 1 })
            .then((res) => {
                if (active) setLatestReservation(res.data.reservations[0] ?? null);
            })
            .catch(() => {
                if (active) setReservationsError(true);
            })
            .finally(() => {
                if (active) setReservationsLoading(false);
            });

        getZones()
            .then((res) => {
                if (active) setZones(res.data.zones.slice(0, 3));
            })
            .catch(() => {
                if (active) setZonesError(true);
            })
            .finally(() => {
                if (active) setZonesLoading(false);
            });

        getReservations({ status: 'Finished', limit: 3 })
            .then((res) => {
                if (active) setHistory(res.data.reservations);
            })
            .catch(() => {
                if (active) setHistoryError(true);
            })
            .finally(() => {
                if (active) setHistoryLoading(false);
            });

        return () => {
            active = false;
        };
    }, []);

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                    <h1 className="text-hero-sm font-display uppercase text-neutral-900">
                        ¡Bienvenido, {user.fullName?.split(' ')[0]}!
                    </h1>
                    <p className="mt-3 text-subtitle-sm text-neutral-900">
                        Encuentra y reserva tu espacio de parqueo de forma rápida, segura y confiable.
                    </p>
                    <Link
                        to="/zones"
                        className="mt-6 inline-flex items-center gap-2 rounded-md bg-parkea-600 px-12 py-3 text-subtitle text-white transition-colors hover:bg-parkea-700"
                    >
                        <MapPin className="h-6 w-6" aria-hidden="true" />
                        Ver zonas disponibles
                    </Link>
                </div>
                <HeroIllustration src={heroUserIllustration} height={315} right={160} />
            </section>

            <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <CardShell
                    title="Reservas"
                    icon={CalendarCheck}
                    footerTo="/reservations"
                    footerLabel="Ver mis reservas"
                >
                    <p className="mb-2 text-label text-neutral-600">Tus reservas</p>

                    {reservationsLoading && <LoadingMessage />}
                    {!reservationsLoading && reservationsError && <ErrorMessage />}
                    {!reservationsLoading && !reservationsError && !latestReservation && (
                        <p className="text-body text-neutral-600">Aún no tienes reservas registradas.</p>
                    )}
                    {!reservationsLoading && !reservationsError && latestReservation && (
                        <div className="rounded-md bg-parkea-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                                <p className="flex min-w-0 items-center gap-1 text-label font-medium text-neutral-900">
                                    <MapPin className="h-3.5 w-3.5 shrink-0 text-parkea-600" aria-hidden="true" />
                                    <span className="truncate">{latestReservation.zone.name}</span>
                                </p>
                                <span
                                    className={`shrink-0 text-label font-medium ${RESERVATION_STATUS_LABEL[latestReservation.status]?.color ?? 'text-neutral-600'
                                        }`}
                                >
                                    {RESERVATION_STATUS_LABEL[latestReservation.status]?.text ?? latestReservation.status}
                                </span>
                            </div>

                            {latestReservation.zone.address && (
                                <p className="mt-0.5 pl-[18px] text-body text-neutral-600">
                                    {latestReservation.zone.address}
                                </p>
                            )}

                            <p className="mt-2 flex items-center gap-1 text-body font-medium text-neutral-900">
                                <Calendar className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                                {formatDate(latestReservation.startTime)}
                            </p>

                            <div className="mt-0.5 flex items-center justify-between">
                                <p className="pl-[18px] text-body text-neutral-600">
                                    {formatTime(latestReservation.startTime)} – {formatTime(latestReservation.endTime)}
                                </p>
                                <p className="font-mono text-label text-neutral-600">
                                    Cupo N.º {latestReservation.spotNumber}
                                </p>
                            </div>
                        </div>
                    )}
                </CardShell>

                <CardShell
                    title="Zonas"
                    icon={Map}
                    footerTo="/zones"
                    footerLabel="Explorar zonas"
                >
                    <p className="mb-2 text-label text-neutral-600">Zonas disponibles</p>

                    {zonesLoading && <LoadingMessage />}
                    {!zonesLoading && zonesError && <ErrorMessage />}
                    {!zonesLoading && !zonesError && zones.length === 0 && (
                        <p className="text-body text-neutral-600">No hay zonas registradas.</p>
                    )}
                    {!zonesLoading && !zonesError && zones.length > 0 && (
                        <ul className="space-y-2">
                            {zones.map((zone) => {
                                const availability = getZoneAvailability(zone.availableSlots, zone.totalSlots);
                                return (
                                    <li key={zone.id} className="flex items-center justify-between gap-2 rounded-md bg-parkea-50 p-3">
                                        <p className="flex min-w-0 items-center gap-1 text-body text-neutral-900">
                                            <MapPin className="h-3.5 w-3.5 shrink-0 text-parkea-600" aria-hidden="true" />
                                            <span className="truncate">{zone.name}</span>
                                        </p>
                                        <div className="flex shrink-0 items-center gap-3">
                                            <span className="flex items-baseline gap-1 font-mono text-caption text-neutral-600">
                                                <span className="text-right tabular-nums">{zone.availableSlots}</span>
                                                <span>de</span>
                                                <span className="text-right tabular-nums">{zone.totalSlots}</span>
                                            </span>
                                            <span className={`w-[80px] text-right text-label font-medium ${ZONE_AVAILABILITY_COLORS[availability.state]}`}>
                                                {availability.text}
                                            </span>
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    )}
                </CardShell>

                <CardShell
                    title="Historial"
                    icon={History}
                    footerTo="/reservations"
                    footerLabel="Ver historial completo"
                >
                    <p className="mb-2 text-label text-neutral-600">Últimas reservas</p>

                    {historyLoading && <LoadingMessage />}
                    {!historyLoading && historyError && <ErrorMessage />}
                    {!historyLoading && !historyError && history.length === 0 && (
                        <p className="text-body text-neutral-600">Aún no tienes historial de reservas.</p>
                    )}
                    {!historyLoading && !historyError && history.length > 0 && (
                        <ul className="space-y-1.5">
                            {history.map((item) => (
                                <li key={item.id} className="flex items-center justify-between gap-2 rounded-md bg-parkea-50 px-3 py-2">
                                    <div className="flex items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-parkea-600" aria-hidden="true" />
                                        <div>
                                            <p className="text-body leading-tight text-neutral-900">{item.zone.name}</p>
                                            <p className="text-caption leading-tight text-neutral-600">
                                                {formatDate(item.startTime)} · {formatTime(item.startTime)} –{' '}
                                                {formatTime(item.endTime)}
                                            </p>
                                        </div>
                                    </div>
                                    <p className="whitespace-nowrap font-mono text-label text-neutral-900">
                                        {formatCurrency(item.amount)}
                                    </p>
                                </li>
                            ))}
                        </ul>
                    )}
                </CardShell>
            </section>
        </div>
    );
}

function AdminHome() {
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-8 lg:flex-row lg:items-center">
                <div className="flex items-start gap-5">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-parkea-800 text-white">
                        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                    </span>
                    <div className="max-w-xl">
                        <h1 className="text-hero-sm font-display uppercase text-neutral-900">
                            Bienvenido, Administrador
                        </h1>
                        <p className="mt-2 text-subtitle-sm text-neutral-900">
                            Desde aquí puedes administrar el sistema PARKEA, gestionar zonas,
                            <br className="hidden md:block" />
                            usuarios y consultar el rendimiento del servicio.
                        </p>
                        <Link
                            to="/admin/panel"
                            className="mt-6 inline-flex items-center gap-2 rounded-md bg-parkea-600 px-12 py-3 text-subtitle text-white transition-colors hover:bg-parkea-700"
                        >
                            <LayoutGrid className="h-6 w-6" aria-hidden="true" />
                            Ir al panel de administración
                        </Link>
                    </div>
                </div>
                <HeroIllustration src={heroAdminIllustration} height={250} right={250} />
            </section>

            <section className="mt-8">
                <h2 className="text-title font-display uppercase text-parkea-700">Módulos principales</h2>
                <p className="mt-1 text-body text-neutral-900">
                    Accede rápidamente a las funcionalidades más importantes del sistema.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-6 md:grid-cols-3">
                    <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <BarChart3 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Panel de control</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Consulta estadísticas generales, reservas, ocupación de
                            <br className="hidden md:block" />
                            zonas y actividad del sistema en tiempo real.
                        </p>
                        <Link
                            to="/admin/panel"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir al panel de control
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>

                    <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <MapPin className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Gestión de zonas</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Crea, edita y administra las zonas de parqueo, tarifas,
                            <br className="hidden md:block" />
                            cupos disponibles y horarios de operación.
                        </p>
                        <Link
                            to="/admin/zones"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir a gestión de zonas
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>

                    <div className="rounded-lg border border-neutral-200 bg-white p-6 text-center">
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <Users className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Gestión de usuarios</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Administra los usuarios del sistema, asigna roles y
                            <br className="hidden md:block" />
                            consulta la información de las cuentas registradas.
                        </p>
                        <Link
                            to="/admin/users"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir a gestión de usuarios
                            <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                        </Link>
                    </div>
                </div>
            </section>
        </div>
    );
}

export default function Home() {
    const { user } = useAuth();

    if (!user) return <VisitorHome />;
    if (user.role === 'admin') return <AdminHome />;
    return <AuthenticatedHome user={user} />;
}