import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

// #316: a screen of users that also visitors can open, like the zones list. An
// administrator does not reserve, so it goes to its own version of the screen.
export default function NotForAdminRoute({ children, adminPath }) {
    const { user, loading } = useAuth();

    if (loading) return null;

    if (user?.role === 'admin') {
        return <Navigate to={adminPath} replace />;
    }

    return children;
}
