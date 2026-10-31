import api from './api';

export const getReservations = (params) => api.get('/reservations', { params });
export const createReservation = (data) => api.post('/reservations', data);
export const getReservation = (id) => api.get(`/reservations/${id}`);

// HU-16: the backend checks ownership, status and start time, and frees the spot.
export const cancelReservation = (id) => api.patch(`/reservations/${id}/cancel`);
