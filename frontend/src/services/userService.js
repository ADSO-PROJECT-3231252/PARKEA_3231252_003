import api from './api';

export const getProfile = () => {
    return api.get('/users/me');
};

export const updateProfile = (data) => {
    return api.put('/users/me', data);
};

export const changePassword = (data) => {
    return api.put('/users/me/password', data);
};