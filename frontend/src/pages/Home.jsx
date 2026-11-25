import { useEffect, useMemo, useState } from 'react';
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
import { COLOMBIA_TIME_ZONE, formatDate, formatTime, formatCurrency, formatStay, formatStayHours, keepTogether } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';
import DecorativeImage from '../components/DecorativeImage';
import ZoneTypeSpots from '../components/ZoneTypeSpots';
import Reveal from '../components/Reveal';
import { pickHomeReservation } from '../utils/homeReservation';
import { nextReservationChange, shownStatus } from '../utils/reservationStatus';
import { MAX_TIMER_MS } from '../utils/extendStay';
import { spotLabel } from '../utils/vehicleTypes';

import heroVisitorIllustration from '../assets/hero-visitor.webp';
import heroUserIllustration from '../assets/hero-user.webp';
import heroAdminIllustration from '../assets/hero-admin.webp';

// height and right accept a number (px) or any CSS length, e.g. clamp(), so an
// illustration can shrink with the viewport instead of covering the headline.
const toCssLength = (value) => (typeof value === 'number' ? `${value}px` : value);

function HeroIllustration({ src, height = 132, right = 32, top }) {
    if (!src) return null;
    // Below lg the illustration is hidden, so it is not downloaded either.
    return (
        <DecorativeImage
            src={src}
            minWidth="64rem"
            style={
                top !== undefined
                    ? { height: toCssLength(height), right: toCssLength(right), top: `${top}px` }
                    : { height: toCssLength(height), right: toCssLength(right), top: '50%', transform: 'translateY(-50%)' }
            }
            className="hidden absolute w-auto lg:block motion-safe:animate-hero-illustration"
        />
    );
}

// #330: the main button of the hero of the three homes. It appears after the
// title and the text, and on hover it rises a little, with a shadow.
const HERO_BUTTON =
    'group mt-6 flex w-full items-center justify-center gap-2 rounded-md bg-parkea-600 px-4 py-3 text-center text-subtitle-sm text-white transition-[background-color,translate,box-shadow] duration-200 hover:bg-parkea-700 hover:shadow-md hover:shadow-parkea-900/20 motion-safe:hover:-translate-y-0.5 motion-safe:animate-fade-up-3 sm:inline-flex sm:w-auto sm:px-12 sm:text-subtitle';
// #330: a card with an action (user and admin homes) rises a little on hover,
// with a shadow, and its arrow moves. The icon of a card without an action
// (visitor home) only grows a little, so the card does not look like a link.
// Only the motion-safe: parts move, so with reduced motion only the shadow shows.
const RISE_ON_HOVER =
    'transition-[translate,box-shadow] duration-200 hover:shadow-lg hover:shadow-parkea-900/10 motion-safe:hover:-translate-y-1';
const ARROW_ON_HOVER = 'transition-transform duration-200 motion-safe:group-hover:translate-x-0.5';
const ICON_ON_HOVER = 'transition-transform duration-200 motion-safe:group-hover:scale-110';

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

function CardShell({ title, icon: Icon, children, footerTo, footerLabel, step }) {
    return (
        <Reveal step={step} className={`group flex flex-col rounded-lg border border-neutral-200 bg-white p-5 ${RISE_ON_HOVER}`}>
            <div className="mb-3 flex items-center justify-between">
                <h2 className="text-title font-display uppercase text-neutral-900">{title}</h2>
                <Icon className="h-6 w-6 text-parkea-600" aria-hidden="true" />
            </div>
            <div className="flex-1">{children}</div>
            <Link
                to={footerTo}
                className="mt-4 flex items-center justify-center gap-1.5 rounded-md border border-parkea-600 px-4 py-2 text-label text-parkea-600 transition-colors hover:bg-parkea-50"
            >
                {footerLabel}
                <ChevronRight className={`h-3.5 w-3.5 ${ARROW_ON_HOVER}`} aria-hidden="true" />
            </Link>
        </Reveal>
    );
}

function VisitorHome() {
    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <title>Inicio | PARKEA</title>
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-6 sm:p-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                    <h1 className="text-hero-sm font-display uppercase text-parkea-700 sm:text-hero lg:text-hero-sm xl:text-hero motion-safe:animate-fade-up">
                        Reserva tu parqueo
                        <br />
                        fácil, rápido y seguro
                    </h1>
                    <p className="mt-3 text-subtitle text-neutral-900 motion-safe:animate-fade-up-2">
                        Encuentra, reserva y paga tu parqueo en las mejores zonas.
                    </p>
                    <Link
                        to="/zones"
                        className={HERO_BUTTON}
                    >
                        <MapPin className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${ICON_ON_HOVER}`} aria-hidden="true" />
                        Ver zonas disponibles
                    </Link>
                </div>
                {/* HU-02 AC-08: the illustration scales with the screen so it never
                    covers the headline on laptop widths (1024 to 1366 px). */}
                <HeroIllustration
                    src={heroVisitorIllustration}
                    height="clamp(280px, 27vw, 520px)"
                    right="clamp(32px, 6vw, 110px)"
                />
            </section>

            <section className="mt-8 grid grid-cols-1 gap-6 md:grid-cols-3">
                <Reveal step={0} className="group rounded-lg bg-parkea-50 p-6 text-center">
                    <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600 ${ICON_ON_HOVER}`}>
                        <CalendarCheck className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Reservas</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Reserva tu cupo de parqueo con{' '}
                        <br className="hidden xl:block" />
                        anticipación y asegura tu espacio.
                    </p>
                </Reveal>
                <Reveal step={1} className="group rounded-lg bg-parkea-50 p-6 text-center">
                    <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600 ${ICON_ON_HOVER}`}>
                        <Map className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Zonas</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Explora zonas de parqueo cercanas,{' '}
                        <br className="hidden xl:block" />
                        con información clara y actualizada.
                    </p>
                </Reveal>
                <Reveal step={2} className="group rounded-lg bg-parkea-50 p-6 text-center">
                    <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-parkea-100 text-parkea-600 ${ICON_ON_HOVER}`}>
                        <History className="h-7 w-7" aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-display font-display uppercase text-parkea-700">Historial</h2>
                    <p className="mt-2 text-subtitle text-neutral-900">
                        Consulta tus reservas pasadas{' '}
                        <br className="hidden xl:block" />
                        y próximas en un solo lugar.
                    </p>
                </Reveal>
            </section>
        </div>
    );
}

function AuthenticatedHome({ user }) {
    const [reservations, setReservations] = useState([]);
    const [reservationsLoading, setReservationsLoading] = useState(true);
    const [reservationsError, setReservationsError] = useState(false);
    // The moment the card is decided for (#347): when the reservations arrived,
    // and again at every moment the card can change by itself
    const [now, setNow] = useState(null);

    const [zones, setZones] = useState([]);
    const [zonesLoading, setZonesLoading] = useState(true);
    const [zonesError, setZonesError] = useState(false);

    const [history, setHistory] = useState([]);
    const [historyLoading, setHistoryLoading] = useState(true);
    const [historyError, setHistoryError] = useState(false);

    useEffect(() => {
        let active = true;

        // #306: all of them, the latest first (100 is the most the list gives):
        // the stay running now, the next ones and the latest of any status
        getReservations({ limit: 100 })
            .then((res) => {
                if (!active) return;
                setNow(Date.now());
                setReservations(res.data.reservations);
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

    // #306: the stay running now, else the next one, else the last finished.
    // The last finished one is the first of the history (the latest first).
    const currentReservation = useMemo(
        () => pickHomeReservation({ reservations, lastFinished: history[0] ?? null }, now ?? undefined),
        [reservations, history, now],
    );
    // #347: the card is decided again, without loading the page, at the next
    // moment it can change: the 15 minutes to pay of a Pending one end, a
    // confirmed one starts or one that runs ends. A timer cannot wait more
    // than about 24 days, so a longer wait is done in steps.
    const nextChangeMs = now === null ? Infinity : nextReservationChange(reservations, now);
    useEffect(() => {
        if (nextChangeMs === Infinity) return;
        const delay = Math.max(0, nextChangeMs - Date.now());
        const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 100, MAX_TIMER_MS));
        return () => clearTimeout(timer);
    }, [nextChangeMs, now]);
    // #347: from 00:00 a Pending reservation shows as expired, like in "Mis reservas"
    const currentStatus = currentReservation && shownStatus(currentReservation, now);
    const cardLoading = reservationsLoading || historyLoading;

    return (
        <div className="mx-auto w-[92%] max-w-[1800px] px-4 py-8 sm:px-6">
            <title>Inicio | PARKEA</title>
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-6 sm:p-8 lg:flex-row lg:items-center">
                <div className="max-w-xl">
                    <h1 className="break-words text-display font-display uppercase text-neutral-900 min-[400px]:text-hero-sm motion-safe:animate-fade-up">
                        ¡Bienvenido, {user.fullName?.split(' ')[0]}!
                    </h1>
                    <p className="mt-3 text-subtitle-sm text-neutral-900 motion-safe:animate-fade-up-2">
                        Encuentra y reserva tu espacio de parqueo de forma rápida, segura y confiable.
                    </p>
                    <Link
                        to="/zones"
                        className={HERO_BUTTON}
                    >
                        <MapPin className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${ICON_ON_HOVER}`} aria-hidden="true" />
                        Ver zonas disponibles
                    </Link>
                </div>
                <HeroIllustration src={heroUserIllustration} height={315} right={160} />
            </section>

            <section className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-3">
                <CardShell
                    title="Reservas"
                    icon={CalendarCheck}
                    footerTo="/reservations"
                    footerLabel="Ver mis reservas"
                    step={0}
                >
                    <p className="mb-2 text-label text-neutral-600">Tus reservas</p>

                    {cardLoading && <LoadingMessage />}
                    {!cardLoading && reservationsError && <ErrorMessage />}
                    {!cardLoading && !reservationsError && !currentReservation && (
                        <p className="text-body text-neutral-600">Aún no tienes reservas registradas.</p>
                    )}
                    {!cardLoading && !reservationsError && currentReservation && (
                        <div className="rounded-md bg-parkea-50 p-3">
                            <div className="flex items-start justify-between gap-2">
                                {/* #309: a long name goes on to more lines; the pin stays on the first one */}
                                <p className="flex min-w-0 items-start gap-1 text-label font-medium text-neutral-900">
                                    <span className="flex h-[1lh] shrink-0 items-center">
                                        <MapPin className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                                    </span>
                                    <span className="min-w-0 break-words">{currentReservation.zone.name}</span>
                                </p>
                                <span
                                    className={`shrink-0 text-label font-medium ${RESERVATION_STATUS_LABEL[currentStatus]?.color ?? 'text-neutral-600'
                                        }`}
                                >
                                    {RESERVATION_STATUS_LABEL[currentStatus]?.text ?? currentStatus}
                                </span>
                            </div>

                            {currentReservation.zone.address && (
                                <p className="mt-0.5 pl-[18px] text-body text-neutral-600">
                                    {currentReservation.zone.address}
                                </p>
                            )}

                            <p className="mt-2 flex items-center gap-1 text-body font-medium text-neutral-900">
                                <Calendar className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                                {/* #357: the day in Colombia, like the hours below */}
                                {formatDate(currentReservation.startTime, COLOMBIA_TIME_ZONE)}
                            </p>

                            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 pl-[18px]">
                                <p className="text-body text-neutral-600">
                                    {/* An open stay (HU-27, or switched to it in HU-28) has no exit time yet.
                                        #357: an exit on another day says its date too. */}
                                    {currentReservation.endTime
                                        ? formatStayHours(currentReservation.startTime, currentReservation.endTime)
                                        : `${keepTogether(formatTime(currentReservation.startTime, COLOMBIA_TIME_ZONE))} · Sin hora de salida`}
                                </p>
                                {/* HU-31 AC-03 */}
                                <p className="shrink-0 font-mono text-label text-neutral-600">
                                    {spotLabel(currentReservation.spotNumber, currentReservation.spotVehicleType)}
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
                    step={1}
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
                                // HU-31 AC-08: each type with its free spots now and its rate
                                return (
                                    <li key={zone.id} className="rounded-md bg-parkea-50 p-3">
                                        <div className="flex items-start justify-between gap-2">
                                            <p className="flex min-w-0 items-start gap-1 text-body text-neutral-900">
                                                <span className="flex h-[1lh] shrink-0 items-center">
                                                    <MapPin className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                                                </span>
                                                <span className="min-w-0 break-words">{zone.name}</span>
                                            </p>
                                            <span className={`shrink-0 text-right text-label font-medium ${ZONE_AVAILABILITY_COLORS[availability.state]}`}>
                                                {availability.text}
                                            </span>
                                        </div>
                                        <ZoneTypeSpots zone={zone} size="sm" className="mt-1.5 pl-[18px]" />
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
                    step={2}
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
                                    <div className="flex min-w-0 items-center gap-1.5">
                                        <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-parkea-600" aria-hidden="true" />
                                        <div className="min-w-0">
                                            <p className="break-words text-body leading-tight text-neutral-900">{item.zone.name}</p>
                                            <p className="text-caption leading-tight text-neutral-600">
                                                {/* #357: a stay that ends on another day shows both dates */}
                                                {formatStay(item.startTime, item.endTime)}
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
            <title>Inicio de administrador | PARKEA</title>
            <section className="relative flex flex-col items-start justify-between gap-6 rounded-lg bg-parkea-50 p-6 sm:p-8 lg:flex-row lg:items-center">
                {/* HU-04 AC-08: on phones the shield goes above the headline so the
                    text and the button get the full width of the card. */}
                <div className="flex flex-col items-start gap-4 sm:flex-row sm:gap-5">
                    <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-parkea-800 text-white motion-safe:animate-fade-up">
                        <ShieldCheck className="h-8 w-8" aria-hidden="true" />
                    </span>
                    <div className="min-w-0 max-w-xl">
                        <h1 className="text-display font-display uppercase text-neutral-900 min-[400px]:text-hero-sm motion-safe:animate-fade-up">
                            Bienvenido, Administrador
                        </h1>
                        <p className="mt-2 text-subtitle-sm text-neutral-900 motion-safe:animate-fade-up-2">
                            Desde aquí puedes administrar el sistema PARKEA, gestionar zonas,{' '}
                            <br className="hidden xl:block" />
                            usuarios y consultar el rendimiento del servicio.
                        </p>
                        <Link
                            to="/admin/panel"
                            aria-label="Ir al panel de administración"
                            className={HERO_BUTTON}
                        >
                            <LayoutGrid className={`h-5 w-5 shrink-0 sm:h-6 sm:w-6 ${ICON_ON_HOVER}`} aria-hidden="true" />
                            {/* The full label doesn't fit in one line on phones */}
                            <span className="sm:hidden">Ir al panel</span>
                            <span className="hidden sm:inline">Ir al panel de administración</span>
                        </Link>
                    </div>
                </div>
                {/* HU-04 AC-08: the illustration scales with the screen so it never
                    covers the headline on laptop widths (1024 to 1366 px). */}
                <HeroIllustration
                    src={heroAdminIllustration}
                    height="clamp(150px, 16vw, 250px)"
                    right="clamp(24px, 30vw - 300px, 250px)"
                />
            </section>

            <section className="mt-8">
                <h2 className="text-title font-display uppercase text-parkea-700">Módulos principales</h2>
                <p className="mt-1 text-body text-neutral-900">
                    Accede rápidamente a las funcionalidades más importantes del sistema.
                </p>

                <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-3">
                    <Reveal step={0} className={`group rounded-lg border border-neutral-200 bg-white p-6 text-center ${RISE_ON_HOVER}`}>
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <BarChart3 className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Panel de control</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Consulta estadísticas generales, reservas, ocupación de{' '}
                            <br className="hidden 2xl:block" />
                            zonas y actividad del sistema en tiempo real.
                        </p>
                        <Link
                            to="/admin/panel"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir al panel de control
                            <ChevronRight className={`h-3.5 w-3.5 ${ARROW_ON_HOVER}`} aria-hidden="true" />
                        </Link>
                    </Reveal>

                    <Reveal step={1} className={`group rounded-lg border border-neutral-200 bg-white p-6 text-center ${RISE_ON_HOVER}`}>
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <MapPin className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Gestión de zonas</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Crea, edita y administra las zonas de parqueo, tarifas{' '}
                            <br className="hidden 2xl:block" />
                            y cupos disponibles.
                        </p>
                        <Link
                            to="/admin/zones"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir a gestión de zonas
                            <ChevronRight className={`h-3.5 w-3.5 ${ARROW_ON_HOVER}`} aria-hidden="true" />
                        </Link>
                    </Reveal>

                    <Reveal step={2} className={`group rounded-lg border border-neutral-200 bg-white p-6 text-center ${RISE_ON_HOVER}`}>
                        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-parkea-100 text-parkea-600">
                            <Users className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <h3 className="mt-4 text-body font-medium text-neutral-900">Gestión de usuarios</h3>
                        <p className="mt-1 text-body text-neutral-600">
                            Administra los usuarios del sistema, asigna roles y{' '}
                            <br className="hidden 2xl:block" />
                            consulta la información de las cuentas registradas.
                        </p>
                        <Link
                            to="/admin/users"
                            className="mt-3 inline-flex items-center justify-center gap-1 text-label text-parkea-600 hover:text-parkea-700"
                        >
                            Ir a gestión de usuarios
                            <ChevronRight className={`h-3.5 w-3.5 ${ARROW_ON_HOVER}`} aria-hidden="true" />
                        </Link>
                    </Reveal>
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
