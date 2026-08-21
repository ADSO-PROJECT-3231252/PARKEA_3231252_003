import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

function iniciales(nombre) {
    if (!nombre) return '?';
    return nombre.trim().split(/\s+/).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

export default function Home() {
    const { user, logoutUser } = useAuth();
    const esAdmin = user?.role === 'admin';

    function handleCerrarSesion() {
        logoutUser();
    }

    return (
        <div className="min-h-screen bg-neutral-50">
            <header className="flex items-center gap-4 border-b border-neutral-200 bg-white px-6 py-3">
                <div className="flex items-center gap-2">
                    <span className="grid h-7 w-7 place-items-center rounded-md bg-parkea-600 text-sm font-semibold text-white">
                        P
                    </span>
                    <span className="font-display text-lg font-semibold tracking-wide text-parkea-700">
                        PARKEA
                    </span>
                </div>

                <div className="ml-auto flex items-center gap-3">
                    {!user && (
                        <>
                            <Link to="/login" className="text-body text-neutral-700 hover:text-parkea-700">
                                Iniciar sesión
                            </Link>
                            <Link
                                to="/register"
                                className="rounded-md bg-parkea-600 px-4 py-2 text-body font-medium text-white hover:bg-parkea-700"
                            >
                                Crear cuenta
                            </Link>
                        </>
                    )}

                    {user && (
                        <>
                            {esAdmin && (
                                <span className="rounded bg-parkea-800 px-2.5 py-1 text-caption font-medium uppercase tracking-wide text-white">
                                    Administrador
                                </span>
                            )}
                            <span className="grid h-9 w-9 place-items-center rounded-full bg-parkea-100 text-label font-semibold text-parkea-800">
                                {iniciales(user.fullName)}
                            </span>
                            <button
                                type="button"
                                onClick={handleCerrarSesion}
                                className="text-body text-danger hover:underline"
                            >
                                Cerrar sesión
                            </button>
                        </>
                    )}
                </div>
            </header>

            <main className="mx-auto max-w-5xl px-6 py-10">
                {!user && (
                    <section>
                        <h1 className="font-display text-display font-semibold text-neutral-900">
                            Encuentra y reserva tu cupo de parqueo
                        </h1>
                        <p className="mt-2 text-body text-neutral-600 max-w-prose">
                            Explora las zonas de parqueo disponibles en la ciudad, reserva tu cupo con
                            anticipación y paga desde tu celular.
                        </p>
                        <div className="mt-6 flex gap-3">
                            <Link
                                to="/zones"
                                className="rounded-md bg-parkea-600 px-5 py-2.5 text-body font-medium text-white hover:bg-parkea-700"
                            >
                                Ver zonas disponibles
                            </Link>
                            <Link
                                to="/register"
                                className="rounded-md border border-neutral-300 bg-white px-5 py-2.5 text-body font-medium text-neutral-900 hover:border-parkea-600"
                            >
                                Crear cuenta
                            </Link>
                        </div>
                    </section>
                )}

                {user && !esAdmin && (
                    <section>
                        <h1 className="font-display text-title font-semibold text-neutral-900">
                            Bienvenido, {user.fullName}
                        </h1>
                        <p className="mt-2 text-body text-neutral-600">
                            Gestiona tus reservas y encuentra tu parqueadero de forma rápida y segura.
                        </p>
                    </section>
                )}

                {user && esAdmin && (
                    <section>
                        <h1 className="font-display text-title font-semibold text-neutral-900">
                            Bienvenido, Administrador
                        </h1>
                        <p className="mt-2 text-body text-neutral-600">
                            Desde aquí puedes administrar zonas, usuarios y visualizar las métricas del
                            sistema.
                        </p>
                    </section>
                )}

                <div className="mt-10 grid gap-4 sm:grid-cols-3">
                    {!esAdmin && (
                        <>
                            <Link
                                to={user ? '/reservations' : '#'}
                                className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-parkea-400"
                            >
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Reservas
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    {user
                                        ? 'Consulta y administra tus reservas.'
                                        : 'Reserva un cupo de parqueo por adelantado.'}
                                </p>
                            </Link>
                            <Link
                                to="/zones"
                                className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-parkea-400"
                            >
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Zonas
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    Explora las zonas disponibles y encuentra el lugar perfecto para estacionar.
                                </p>
                            </Link>
                            <div className="rounded-lg border border-neutral-200 bg-white p-5">
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Historial
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    {user
                                        ? 'Consulta tu historial de reservas y pagos.'
                                        : 'Revisa tus reservas y pagos anteriores. Requiere cuenta.'}
                                </p>
                            </div>
                        </>
                    )}

                    {esAdmin && (
                        <>
                            <Link
                                to="/admin/dashboard"
                                className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-parkea-400"
                            >
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Panel de control
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    Visualiza las métricas clave del sistema en tiempo real.
                                </p>
                            </Link>
                            <Link
                                to="/admin/zones"
                                className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-parkea-400"
                            >
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Gestión de zonas
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    Crea, edita y activa o desactiva zonas de parqueo.
                                </p>
                            </Link>
                            <Link
                                to="/admin/users"
                                className="rounded-lg border border-neutral-200 bg-white p-5 hover:border-parkea-400"
                            >
                                <h3 className="font-display text-subtitle font-semibold text-neutral-900">
                                    Gestión de usuarios
                                </h3>
                                <p className="mt-1 text-body text-neutral-600">
                                    Administra roles y el estado de las cuentas del sistema.
                                </p>
                            </Link>
                        </>
                    )}
                </div>
            </main>
        </div>
    );
}