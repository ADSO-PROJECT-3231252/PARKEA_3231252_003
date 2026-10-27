import api from './api';

export const register = (userData) => {
    return api.post('/auth/register', userData);
};

export const login = (credentials) => {
    return api.post('/auth/login', credentials);
};

export const loginAdmin = (credentials) => {
    return api.post('/auth/login-admin', credentials);
};

export const forgotPassword = (data) => {
    return api.post('/auth/forgot-password', data);
};

export const resetPassword = (data) => {
    return api.post('/auth/reset-password', data);
};