import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || 'http://localhost:3000/api',
    headers: {
        'Content-Type': 'application/json',
    },
});

api.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
});

// Clears the stored session and opens the login page with the reason, so the
// user is told why (expired, deactivated, roleChanged). Used by the interceptor
// below and by ProtectedRoute (DEF-010). Several requests can end the session at
// the same time; only the first one redirects, because setting location.href
// again while the first redirect is in progress can cancel it.
let redirecting = false;
export function endSession(reason) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    if (redirecting || window.location.pathname === '/login') return;
    redirecting = true;
    window.location.href = `/login?${reason}=1`;
}

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const code = error.response?.data?.code;
        const sessionEndingCodes = ['NO_TOKEN', 'INVALID_TOKEN', 'ACCOUNT_DEACTIVATED', 'FORBIDDEN_ROLE'];
        const hadSession = Boolean(localStorage.getItem('token'));

        // Only a session that actually existed can expire. A failed login attempt
        // returns the same codes but must stay inline on its own form (HU-05 AC-10,
        // HU-06 AC-10), so it must not be treated as an expired session.
        if (hadSession && sessionEndingCodes.includes(code)) {
            // HU-23 AC-11: a deactivated account is told why its session ended.
            // DEF-010: an admin who lost the role is told their permissions changed.
            const reasons = {
                ACCOUNT_DEACTIVATED: 'deactivated',
                FORBIDDEN_ROLE: 'roleChanged',
            };
            endSession(reasons[code] || 'expired');
        }
        return Promise.reject(error);
    }
);

export default api;
