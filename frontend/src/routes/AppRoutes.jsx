import { Routes, Route, Navigate } from 'react-router-dom';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import Profile from '../pages/Profile';
import Zones from '../pages/Zones';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/Layout';
import VehicleList from '../pages/VehicleList';
import Reservations from '../pages/Reservations';
import RegisterVehicle from '../pages/RegisterVehicle';
import EditVehicle from '../pages/EditVehicle';
import AdminPanel from '../pages/AdminPanel';
import ReserveSpot from '../pages/ReserveSpot';
import AdminLogin from '../pages/AdminLogin';
import AdminUsers from '../pages/AdminUsers';
import AdminZones from '../pages/AdminZones';
import CreateZone from '../pages/CreateZone';
import EditZone from '../pages/EditZone';
import ForgotPassword from '../pages/ForgotPassword';
import ResetPassword from '../pages/ResetPassword';
import ReservationConfirmation from '../pages/ReservationConfirmation';
import PayReservation from '../pages/PayReservation';
import NotFound from '../pages/NotFound';

export default function AppRoutes() {
    return (
        <Routes>
            {/* Standalone auth screens — no shared Header */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />

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
    );
}
