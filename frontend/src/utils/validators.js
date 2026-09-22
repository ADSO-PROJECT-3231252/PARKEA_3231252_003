export const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

// Mirrors backend's PLATE_FORMATS (vehiculo.controller.js) exactly.
// Cars and trucks share the same plate format; motorcycles differ.
const PLATE_FORMATS = {
    car: /^[A-Z]{3}\d{3}$/,
    truck: /^[A-Z]{3}\d{3}$/,
    motorcycle: /^[A-Z]{3}\d{2}[A-Z]$/,
};

export const isValidPlate = (plate, vehicleType) => {
    const regex = PLATE_FORMATS[vehicleType];
    return regex ? regex.test(plate.toUpperCase()) : false;
};

// Colombian mobile numbers are always 10 digits. People type them with spaces,
// dashes or parentheses ("300 123 4567", "(300) 123-4567"), so those are removed
// before validating and sending; only the 10 digits reach the backend.
export const normalizePhone = (phone) => {
    return (phone ?? '').replace(/[\s\-().]/g, '');
};

export const isValidPhone = (phone) => {
    return /^[0-9]{10}$/.test(normalizePhone(phone));
};

export const isNotEmpty = (value) => {
    return value !== undefined && value !== null && value.toString().trim() !== '';
};