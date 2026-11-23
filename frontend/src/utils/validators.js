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

// People type a phone with spaces, dashes or parentheses ("300 123 4567",
// "(300) 123-4567"), so those are removed before validating and sending; only
// the 10 digits reach the backend. The rule of the phone is in personRules.js.
export const normalizePhone = (phone) => {
    return (phone ?? '').replace(/[\s\-().]/g, '');
};

export const isNotEmpty = (value) => {
    return value !== undefined && value !== null && value.toString().trim() !== '';
};

// Shared message for empty required fields, so every form says it the same way.
export const REQUIRED_MESSAGE = 'Este campo es obligatorio.';

// The password rule and its message are shared by sign-up, profile and password reset (#313)
export const PASSWORD_RULE = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,20}$/;
export const PASSWORD_MESSAGE = 'Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.';

export const isValidPassword = (password) => PASSWORD_RULE.test(password);
