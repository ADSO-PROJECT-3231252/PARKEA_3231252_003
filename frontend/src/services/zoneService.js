import api from './api';

export const getZones = () => api.get('/zones');
export const getZone = (id) => api.get(`/zones/${id}`);

// HU-19: admin list with active and inactive zones, and the activate/deactivate toggle
export const getAllZones = () => api.get('/zones/all');
export const toggleZone = (id) => api.patch(`/zones/${id}/toggle`);

// HU-20: create a zone (admin)
export const createZone = (zone) => api.post('/zones', zone);
