import api from './api';

// HU-17: simulated payment, POST /api/payments/:reservationId (pago.routes.js).
// Body: { paymentMethod: 'card' | 'pse', cardLastFour }. Only the last four
// digits of the card are ever sent (AC-05).
export const payReservation = (reservationId, data) => api.post(`/payments/${reservationId}`, data);

// HU-27: pays what an open stay still owes after it ended. Same body as above.
export const payBalance = (reservationId, data) => api.post(`/payments/${reservationId}/balance`, data);
