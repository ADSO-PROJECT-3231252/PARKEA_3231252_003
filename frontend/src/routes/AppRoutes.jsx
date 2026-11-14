import { lazy, Suspense } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/Layout';

// Every page is downloaded only when its route is opened
const Home = lazy(() => import('../pages/Home'));
const Login = lazy(() => import('../pages/Login'));
const Register = lazy(() => import('../pages/Register'));
const Profile = lazy(() => import('../pages/Profile'));
const Zones = lazy(() => import('../pages/Zones'));
const VehicleList = lazy(() => import('../pages/VehicleList'));
const Reservations = lazy(() => import('../pages/Reservations'));
const RegisterVehicle = lazy(() => import('../pages/RegisterVehicle'));
const EditVehicle = lazy(() => import('../pages/EditVehicle'));
const AdminPanel = lazy(() => import('../pages/AdminPanel'));
const ReserveSpot = lazy(() => import('../pages/ReserveSpot'));
const AdminLogin = lazy(() => import('../pages/AdminLogin'));
const AdminUsers = lazy(() => import('../pages/AdminUsers'));
const AdminZones = lazy(() => import('../pages/AdminZones'));
const CreateZone = lazy(() => import('../pages/CreateZone'));
const EditZone = lazy(() => import('../pages/EditZone'));
const ForgotPassword = lazy(() => import('../pages/ForgotPassword'));
const ResetPassword = lazy(() => import('../pages/ResetPassword'));
const ReservationConfirmation = lazy(() => import('../pages/ReservationConfirmation'));
const PayReservation = lazy(() => import('../pages/PayReservation'));
const NotFound = lazy(() => import('../pages/NotFound'));
const CheckEmail = lazy(() => import('../pages/CheckEmail'));
const VerifyEmail = lazy(() => import('../pages/VerifyEmail'));
const ResendVerification = lazy(() => import('../pages/ResendVerification'));

// Shown while the file of a page is being downloaded
function PageFallback() {
    return (
        <div role="status" className="flex min-h-screen items-center justify-center text-neutral-600">
            Cargando…
        </div>
    );
}

export default function AppRoutes() {
    return (
        <Suspense fallback={<PageFallback />}>
            <Routes>
                {/* Standalone auth screens — no shared Header */}
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/admin/login" element={<AdminLogin />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
                <Route path="/reset-password" element={<ResetPassword />} />
                <Route path="/verify-email" element={<VerifyEmail />} />
                <Route path="/verify-email/sent" element={<CheckEmail />} />
                <Route path="/verify-email/resend" element={<ResendVerification />} />

                {/* Everything else shares the Header via Layout */}
                <Route element={<Layout />}>
                    <Route path="/" element={<Home />} />
                    <Route path="/zones" element={<Zones />} />
                    <Route path="/zones/map" element={<Navigate to="/zones?view=map" replace />} />

                    <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
                    <Route path="/vehicles" element={<ProtectedRoute><VehicleList /></ProtectedRoute>} />
                    <Route path="/vehicles/new" element={<ProtectedRoute><RegisterVehicle /></ProtectedRoute>} />
                    <Route path="/vehicles/:id/edit" element={<ProtectedRoute><EditVehicle /></ProtectedRoute>} />
                    <Route path="/reserve/:zoneId" element={<ProtectedRoute><ReserveSpot /></ProtectedRoute>} />
                    <Route path="/reservations" element={<ProtectedRoute><Reservations /></ProtectedRoute>} />
                    <Route path="/reservations/:id" element={<ProtectedRoute><ReservationConfirmation /></ProtectedRoute>} />
                    <Route path="/reservations/:id/payment" element={<ProtectedRoute><PayReservation /></ProtectedRoute>} />

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
