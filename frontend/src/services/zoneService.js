import api from './api';

export const getZones = () => api.get('/zones');
export const getZone = (id) => api.get(`/zones/${id}`);