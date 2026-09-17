import api from './api';

export const getReservations = (params) => api.get('/reservations', { params });