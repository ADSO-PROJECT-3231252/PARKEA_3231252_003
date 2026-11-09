import { useEffect } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { getProfile } from '../services/userService';
import { endSession } from '../services/api';

export default function ProtectedRoute({ children, role }) {
    const { user, loading } = useAuth();
    const location = useLocation();
    const isAdminScreen = role === 'admin' && user?.role === 'admin';

    // DEF-010: the role saved in the browser can be out of date if another admin
    // removed it. Screens like "Inicio" or "Crear zona" make no admin request, so
    // the api.js interceptor never sees FORBIDDEN_ROLE there. Each admin screen
    // reads the current role from the backend and ends the session if it changed.
    useEffect(() => {
        if (!isAdminScreen) return undefined;
        let active = true;
        getProfile()
            .then(({ data }) => {
                if (active && data.user?.role !== 'admin') endSession('roleChanged');
            })
            // Session errors are already handled by the api.js interceptor; a network
            // error here must not sign the admin out.
            .catch(() => {});
        return () => {
            active = false;
        };
    }, [isAdminScreen, location.pathname]);

    if (loading) return null;

    if (!user) {
        return <Navigate to="/login" state={{ from: location.pathname + location.search }} replace />;
    }

    if (role && user.role !== role) {
        return <Navigate to="/" replace />;
    }

    return children;
}
