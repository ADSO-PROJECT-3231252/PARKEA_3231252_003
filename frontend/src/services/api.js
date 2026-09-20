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
        if (sessionEndingCodes.includes(code)) {
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