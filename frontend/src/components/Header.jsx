import { useState, useRef, useEffect, startTransition } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';

import {
    MapPin,
    Calendar,
    Car,
    LayoutDashboard,
    Users,
    LogIn,
    UserPlus,
    ChevronDown,
    LogOut,
    User,
    Menu,
    X,
    Home,
} from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { getInitials } from '../utils/format';
import logo from '../assets/logo.png';

const NAV_ITEMS_USER = [
    { to: '/', label: 'Inicio', icon: Home, end: true },
    { to: '/zones', label: 'Zonas', icon: MapPin },
    { to: '/reservations', label: 'Mis reservas', icon: Calendar },
    { to: '/vehicles', label: 'Mis vehículos', icon: Car },
];

const NAV_ITEMS_ADMIN = [
    { to: '/admin/dashboard', label: 'Inicio', icon: Home, end: true },
    { to: '/admin/panel', label: 'Panel', icon: LayoutDashboard },
    { to: '/admin/zones', label: 'Zonas', icon: MapPin },
    { to: '/admin/users', label: 'Usuarios', icon: Users },
];

const FOCUS_RING =
    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600 focus-visible:ring-offset-2';

export default function Header() {
    const { user, logoutUser } = useAuth();
    const navigate = useNavigate();
    const [menuOpen, setMenuOpen] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);
    const menuRef = useRef(null);
    const menuButtonRef = useRef(null);

    const isAdmin = user?.role === 'admin';
    const homeLink = isAdmin ? '/admin/dashboard' : '/';
    const navItems = isAdmin ? NAV_ITEMS_ADMIN : NAV_ITEMS_USER;

    useEffect(() => {
        if (!menuOpen) return;

        function handleClickOutside(event) {
            if (
                menuRef.current &&
                !menuRef.current.contains(event.target) &&
                menuButtonRef.current &&
                !menuButtonRef.current.contains(event.target)
            ) {
                setMenuOpen(false);
            }
        }

        function handleEscape(event) {
            if (event.key === 'Escape') {
                setMenuOpen(false);
                menuButtonRef.current?.focus();
            }
        }

        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [menuOpen]);

    function handleLogout() {
        // HU-24 AC-04: signing out always lands on the public home. navigate()
        // runs as a low-priority transition while logoutUser() clears the user
        // at normal priority, done separately, React first re-renders the
        // current (possibly protected) page with no user, so ProtectedRoute
        // bounces to /login and saves that page as the post-login destination,
        // before the navigate to '/' ever takes effect. Wrapping both in the
        // same startTransition makes React apply them together in one render,
        // so a protected page never renders without a user in the first place.
        setMenuOpen(false);
        startTransition(() => {
            navigate('/', { replace: true });
            logoutUser();
        });
    }

    const desktopNavLinkClass = ({ isActive }) =>
        `flex h-full items-center gap-1.5 border-b-2 px-1 text-label transition-colors ${FOCUS_RING} ${isActive
            ? 'border-parkea-600 text-parkea-600'
            : 'border-transparent text-neutral-600 hover:text-parkea-600'
        }`;

    const mobileNavLinkClass = ({ isActive }) =>
        `flex items-center gap-2 rounded-md px-3 py-2 text-label transition-colors ${FOCUS_RING} ${isActive ? 'bg-parkea-50 text-parkea-600' : 'text-neutral-900 hover:bg-neutral-50'
        }`;

    return (
        <header className="sticky top-0 z-50 border-b border-neutral-200 bg-white">
            <div className="mx-auto flex h-16 w-[92%] max-w-[1800px] items-center gap-4 px-4 sm:px-6">
                <NavLink
                    to={homeLink}
                    className={`flex shrink-0 items-center rounded-md ${FOCUS_RING}`}
                    aria-label="Ir al inicio"
                >
                    <img src={logo} alt="PARKEA" className="h-15 w-auto" />
                </NavLink>

                <div className="hidden h-8 w-px bg-neutral-200 sm:block" aria-hidden="true" />

                {user && (
                    <nav
                        className="hidden h-16 flex-1 items-center gap-6 md:flex"
                        aria-label="Navegación principal"
                    >
                        {navItems.map(({ to, label, icon: Icon, end }) => (
                            <NavLink key={to} to={to} end={end} className={desktopNavLinkClass}>
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </NavLink>
                        ))}
                    </nav>
                )}

                {!user && <div className="flex-1" />}

                <div className="flex items-center gap-3">
                    {!user && (
                        <>
                            <NavLink
                                to="/login"
                                className={`flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600 ${FOCUS_RING}`}
                            >
                                <LogIn className="h-4 w-4" aria-hidden="true" />
                                Iniciar sesión
                            </NavLink>
                            <NavLink
                                to="/register"
                                className={`flex items-center gap-1.5 rounded-md bg-parkea-600 px-3 py-1.5 text-label text-white transition-colors hover:bg-parkea-700 ${FOCUS_RING}`}
                            >
                                <UserPlus className="h-4 w-4" aria-hidden="true" />
                                Crear cuenta
                            </NavLink>
                        </>
                    )}

                    {user && (
                        <>
                            {isAdmin && (
                                <span className="hidden rounded-full border border-parkea-600 bg-parkea-50 px-3 py-1 text-label text-parkea-600 sm:inline-block">
                                    Administrador
                                </span>
                            )}

                            <div className="relative">
                                <button
                                    ref={menuButtonRef}
                                    type="button"
                                    onClick={() => setMenuOpen((open) => !open)}
                                    aria-haspopup="true"
                                    aria-expanded={menuOpen}
                                    aria-label="Abrir menú de usuario"
                                    className={`flex items-center gap-1 rounded-full ${FOCUS_RING}`}
                                >
                                    <span className="flex h-9 w-9 items-center justify-center rounded-full bg-parkea-600 text-label text-white">
                                        {getInitials(user.fullName)}
                                    </span>
                                    <ChevronDown
                                        className={`h-4 w-4 text-neutral-600 transition-transform ${menuOpen ? 'rotate-180' : ''
                                            }`}
                                        aria-hidden="true"
                                    />
                                </button>

                                {menuOpen && (
                                    <div
                                        ref={menuRef}
                                        className="absolute right-0 top-full mt-2 w-48 rounded-lg border border-neutral-200 bg-white py-1 shadow-lg"
                                    >
                                        <NavLink
                                            to="/profile"
                                            onClick={() => setMenuOpen(false)}
                                            className={`flex items-center gap-2 px-4 py-2 text-label text-neutral-900 hover:bg-neutral-50 ${FOCUS_RING}`}
                                        >
                                            <User className="h-4 w-4" aria-hidden="true" />
                                            Mi perfil
                                        </NavLink>

                                        {!isAdmin && (
                                            <NavLink
                                                to="/vehicles"
                                                onClick={() => setMenuOpen(false)}
                                                className={`flex items-center gap-2 px-4 py-2 text-label text-neutral-900 hover:bg-neutral-50 ${FOCUS_RING}`}
                                            >
                                                <Car className="h-4 w-4" aria-hidden="true" />
                                                Mis vehículos
                                            </NavLink>
                                        )}

                                        <div className="my-1 border-t border-neutral-200" />

                                        <button
                                            type="button"
                                            onClick={handleLogout}
                                            className={`flex w-full items-center gap-2 px-4 py-2 text-left text-label text-danger hover:bg-danger-soft ${FOCUS_RING}`}
                                        >
                                            <LogOut className="h-4 w-4" aria-hidden="true" />
                                            Cerrar sesión
                                        </button>
                                    </div>
                                )}
                            </div>

                            <button
                                type="button"
                                onClick={() => setMobileOpen((open) => !open)}
                                aria-label={mobileOpen ? 'Cerrar menú' : 'Abrir menú'}
                                aria-expanded={mobileOpen}
                                className={`flex h-9 w-9 items-center justify-center rounded-md text-neutral-900 hover:bg-neutral-50 md:hidden ${FOCUS_RING}`}
                            >
                                {mobileOpen ? (
                                    <X className="h-5 w-5" aria-hidden="true" />
                                ) : (
                                    <Menu className="h-5 w-5" aria-hidden="true" />
                                )}
                            </button>
                        </>
                    )}
                </div>
            </div>

            {user && mobileOpen && (
                <nav
                    className="border-t border-neutral-200 bg-white px-4 py-3 md:hidden"
                    aria-label="Navegación principal (móvil)"
                >
                    <div className="flex flex-col gap-1">
                        {navItems.map(({ to, label, icon: Icon, end }) => (
                            <NavLink
                                key={to}
                                to={to}
                                end={end}
                                onClick={() => setMobileOpen(false)}
                                className={mobileNavLinkClass}
                            >
                                <Icon className="h-4 w-4" aria-hidden="true" />
                                {label}
                            </NavLink>
                        ))}
                    </div>
                </nav>
            )}
        </header>
    );
}