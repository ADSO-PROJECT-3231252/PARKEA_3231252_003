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

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const code = error.response?.data?.code;
        const sessionEndingCodes = ['NO_TOKEN', 'INVALID_TOKEN', 'ACCOUNT_DEACTIVATED'];
        const hadSession = Boolean(localStorage.getItem('token'));

        // Only a session that actually existed can expire. A failed login attempt
        // returns the same codes but must stay inline on its own form (HU-05 AC-10,
        // HU-06 AC-10), so it must not be treated as an expired session.
        if (hadSession && sessionEndingCodes.includes(code)) {
            localStorage.removeItem('token');
            localStorage.removeItem('user');
            if (window.location.pathname !== '/login') {
                window.location.href = '/login?expired=1';
            }
        }
        return Promise.reject(error);
    }
);

export default api;