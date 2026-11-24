import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { RefreshCw } from 'lucide-react';
import GuestRoute from './GuestRoute';
import ProtectedRoute from './ProtectedRoute';
import NotForAdminRoute from './NotForAdminRoute';
import Layout from '../components/Layout';

// Shown instead of a blank screen when the file of a page can't be downloaded:
// the connection dropped for a moment, or a new version was published and the
// files of the old one are gone. Reloading downloads the current version.
// The pages without the Header (standalone) have no <main> around them.
function PageLoadError({ standalone }) {
    const Wrapper = standalone ? 'main' : 'div';
    return (
        <Wrapper className={`flex ${standalone ? 'min-h-screen' : 'min-h-[60vh]'} items-center justify-center px-4`}>
            <div role="alert" className="flex flex-col items-center gap-3 text-center">
                <h1 className="text-subtitle text-neutral-900">No pudimos cargar esta página</h1>
                <p className="text-body text-neutral-600">Revisa tu conexión e inténtalo de nuevo.</p>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="flex items-center gap-1.5 rounded-md border border-neutral-200 px-3 py-1.5 text-label text-neutral-900 transition-colors hover:border-parkea-600 hover:text-parkea-600"
                >
                    <RefreshCw className="h-4 w-4" aria-hidden="true" />
                    Reintentar
                </button>
            </div>
        </Wrapper>
    );
}

// Every page is downloaded only when its route is opened. Like the map in
// Zones.jsx, a failed download shows PageLoadError instead of a blank screen.
const lazyPage = (load, standalone = false) =>
    lazy(() => load().catch(() => ({ default: () => <PageLoadError standalone={standalone} /> })));

const Home = lazyPage(() => import('../pages/Home'));
const Login = lazyPage(() => import('../pages/Login'), true);
const Register = lazyPage(() => import('../pages/Register'), true);
const Profile = lazyPage(() => import('../pages/Profile'));
const Zones = lazyPage(() => import('../pages/Zones'));
const VehicleList = lazyPage(() => import('../pages/VehicleList'));
const Reservations = lazyPage(() => import('../pages/Reservations'));
const RegisterVehicle = lazyPage(() => import('../pages/RegisterVehicle'));
const EditVehicle = lazyPage(() => import('../pages/EditVehicle'));
const AdminPanel = lazyPage(() => import('../pages/AdminPanel'));
const ReserveSpot = lazyPage(() => import('../pages/ReserveSpot'));
const AdminLogin = lazyPage(() => import('../pages/AdminLogin'), true);
const AdminUsers = lazyPage(() => import('../pages/AdminUsers'));
const AdminZones = lazyPage(() => import('../pages/AdminZones'));
const CreateZone = lazyPage(() => import('../pages/CreateZone'));
const EditZone = lazyPage(() => import('../pages/EditZone'));
const ForgotPassword = lazyPage(() => import('../pages/ForgotPassword'), true);
const ResetPassword = lazyPage(() => import('../pages/ResetPassword'), true);
const ReservationConfirmation = lazyPage(() => import('../pages/ReservationConfirmation'));
const PayReservation = lazyPage(() => import('../pages/PayReservation'));
const NotFound = lazyPage(() => import('../pages/NotFound'), true);
const CheckEmail = lazyPage(() => import('../pages/CheckEmail'), true);
const VerifyEmail = lazyPage(() => import('../pages/VerifyEmail'), true);
const ResendVerification = lazyPage(() => import('../pages/ResendVerification'), true);

// Shown while the file of a page is being downloaded
function PageFallback() {
    return (
        <div role="status" className="flex min-h-screen items-center justify-center text-body text-neutral-600">
            Cargando…
        </div>
    );
}

export default function AppRoutes() {
    return (
        <Suspense fallback={<PageFallback />}>
            <Routes>
                {/* Standalone auth screens — no shared Header */}
                <Route element={<GuestRoute />}>
                    <Route path="/login" element={<Login />} />
                    <Route path="/register" element={<Register />} />
                    <Route path="/admin/login" element={<AdminLogin />} />
                    <Route path="/forgot-password" element={<ForgotPassword />} />
                </Route>
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/verify-email/sent" element={<CheckEmail />} />
                <Route path="/verify-email/resend" element={<ResendVerification />} />

                {/* Everything else shares the Header via Layout */}
                <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    {/* #316: the zones list is open to visitors and users; an
                        administrator has its own list of zones */}
                    <Route path="/zones" element={<NotForAdminRoute adminPath="/admin/zones"><Zones /></NotForAdminRoute>} />
                    <Route path="/zones/map" element={<Navigate to="/zones?view=map" replace />} />

                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    {/* #316: vehicles and reservations are only for users */}
                    <Route path="/vehicles" element={<ProtectedRoute role="user"><VehicleList /></ProtectedRoute>} />
                    <Route path="/vehicles/new" element={<ProtectedRoute role="user"><RegisterVehicle /></ProtectedRoute>} />
                    <Route path="/vehicles/:id/edit" element={<ProtectedRoute role="user"><EditVehicle /></ProtectedRoute>} />
                    <Route path="/reserve/:zoneId" element={<ProtectedRoute role="user"><ReserveSpot /></ProtectedRoute>} />
                    <Route path="/reservations" element={<ProtectedRoute role="user"><Reservations /></ProtectedRoute>} />
                    <Route path="/reservations/:id" element={<ProtectedRoute role="user"><ReservationConfirmation /></ProtectedRoute>} />
                    <Route path="/reservations/:id/payment" element={<ProtectedRoute role="user"><PayReservation /></ProtectedRoute>} />

                    <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><Home /></ProtectedRoute>} />
                    <Route path="/admin/panel" element={<ProtectedRoute role="admin"><AdminPanel /></ProtectedRoute>} />
                    <Route path="/admin/zones" element={<ProtectedRoute role="admin"><AdminZones /></ProtectedRoute>} />
                    <Route path="/admin/zones/new" element={<ProtectedRoute role="admin"><CreateZone /></ProtectedRoute>} />
                    <Route path="/admin/zones/:id/edit" element={<ProtectedRoute role="admin"><EditZone /></ProtectedRoute>} />
                    <Route path="/admin/users" element={<ProtectedRoute role="admin"><AdminUsers /></ProtectedRoute>} />
                </Route>

                {/* Unknown address: full-screen 404, no shared Header */}
                <Route path="*" element={<NotFound />} />
            </Routes>
        </Suspense>
    );
}
