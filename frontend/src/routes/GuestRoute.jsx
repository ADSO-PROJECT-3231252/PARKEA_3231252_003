import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function GuestRoute() {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (user) {
        const destination = user.role === 'admin' ? '/admin/dashboard' : '/';
        return <Navigate to={destination} replace />;
    }

    return <Outlet />;
}
