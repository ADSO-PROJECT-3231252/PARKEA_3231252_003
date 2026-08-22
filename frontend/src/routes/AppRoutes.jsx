import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ComingSoon from '../pages/ComingSoon';
import ProtectedRoute from './ProtectedRoute';

export default function AppRoutes() {
    return (
        <Routes>
            {/* Pública — Home manages the three statuses (visitor/user/admin) internally */}
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin/login" element={<ComingSoon />} />
            <Route path="/forgot-password" element={<ComingSoon />} />
            <Route path="/reset-password" element={<ComingSoon />} />
            <Route path="/zones" element={<ComingSoon />} />
            <Route path="/zones/map" element={<ComingSoon />} />

            {/* Authenticated user */}
            <Route path="/profile" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/vehicles" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/vehicles/new" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/vehicles/:id/edit" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/reserve/:zoneId" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/reservations" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/reservations/:id" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
            <Route path="/reservations/:id/payment" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />

            {/* Administrator */}
            <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
            <Route path="/admin/zones" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
            <Route path="/admin/zones/new" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
            <Route path="/admin/zones/:id/edit" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
            <Route path="/admin/users" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />

            <Route path="*" element={<Home />} />
        </Routes>
    );
}