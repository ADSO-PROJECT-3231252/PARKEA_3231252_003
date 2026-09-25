import api from './api';

export const getReservations = (params) => api.get('/reservations', { params });
export const createReservation = (data) => api.post('/reservations', data);