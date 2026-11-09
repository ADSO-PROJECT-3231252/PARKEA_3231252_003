// The API address. It lives apart from api.js because Jest does not understand
// import.meta.env: the tests replace this file (see tests/setup.js).
export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api';
