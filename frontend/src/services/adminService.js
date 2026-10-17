import api from './api';
export const getDashboardMetrics = (range) => api.get('/admin/dashboard', { params: { range } });
export const getReservationsByZone = (range) =>
    api.get('/admin/dashboard/reservations-by-zone', { params: { range } });
export const getZoneOccupancy = () => api.get('/admin/dashboard/occupancy');
export const getPaymentsStatus = (range) =>
    api.get('/admin/dashboard/payments-status', { params: { range } });
export const getRecentPayments = () => api.get('/admin/dashboard/recent-payments');
export const getDashboardAlerts = () => api.get('/admin/dashboard/alerts');

// HU-23: user management
export const getUsers = (params) => api.get('/admin/users', { params });
export const getUserLogs = () => api.get('/admin/users/logs');
export const changeUserRole = (id, role) => api.patch(`/admin/users/${id}/role`, { role });
export const changeUserStatus = (id, isActive) => api.patch(`/admin/users/${id}/status`, { isActive });
