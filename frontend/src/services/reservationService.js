import api from './api';

export const getReservations = (params) => api.get('/reservations', { params });
export const createReservation = (data) => api.post('/reservations', data);
export const getReservation = (id) => api.get(`/reservations/${id}`);

// HU-16: the backend checks ownership, status and start time, and frees the spot.
export const cancelReservation = (id) => api.patch(`/reservations/${id}/cancel`);

// HU-27: ends an open stay. expectedHours is the number of hours the user saw
// and confirmed; if another hour started meanwhile, the backend answers
// STAY_AMOUNT_CHANGED with the new amount instead of charging it.
export const finishStay = (id, expectedHours) => api.patch(`/reservations/${id}/finish`, { expectedHours });

// HU-28: extends a stay. fromEndTime is the exit time the user saw; if it
// changed meanwhile, the backend answers RESERVATION_CHANGED and charges
// nothing. Body: { fromEndTime, newEndTime, paymentMethod, cardLastFour } to
// pay a later exit time now, or { fromEndTime, openEnded: true } to switch to
// an open stay, paid when it ends.
export const extendStay = (id, data) => api.patch(`/reservations/${id}/extend`, data);
