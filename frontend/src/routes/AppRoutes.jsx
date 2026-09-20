import { Routes, Route } from 'react-router-dom';
import Home from '../pages/Home';
import Login from '../pages/Login';
import Register from '../pages/Register';
import ComingSoon from '../pages/ComingSoon';
import ProtectedRoute from './ProtectedRoute';
import Layout from '../components/Layout';

export default function AppRoutes() {
    return (
        <Routes>
            {/* Standalone auth screens — no shared Header */}
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/admin/login" element={<ComingSoon />} />
            <Route path="/forgot-password" element={<ComingSoon />} />
            <Route path="/reset-password" element={<ComingSoon />} />

            {/* Everything else shares the Header via Layout */}
            <Route element={<Layout />}>
                <Route path="/" element={<Home />} />
                <Route path="/zones" element={<ComingSoon />} />
                <Route path="/zones/map" element={<ComingSoon />} />

                <Route path="/profile" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/vehicles" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/vehicles/new" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/vehicles/:id/edit" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/reserve/:zoneId" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/reservations" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/reservations/:id" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />
                <Route path="/reservations/:id/payment" element={<ProtectedRoute><ComingSoon /></ProtectedRoute>} />

                <Route path="/admin/dashboard" element={<ProtectedRoute role="admin"><Home /></ProtectedRoute>} />
                <Route path="/admin/panel" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
                <Route path="/admin/zones" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
                <Route path="/admin/zones/new" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
                <Route path="/admin/zones/:id/edit" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />
                <Route path="/admin/users" element={<ProtectedRoute role="admin"><ComingSoon /></ProtectedRoute>} />

                <Route path="*" element={<Home />} />
            </Route>
        </Routes>
    );
}