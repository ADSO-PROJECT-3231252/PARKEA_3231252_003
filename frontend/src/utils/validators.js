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

// The password rule of the backend and its message, shared by sign-up, profile
// and password reset (#313). The backend checks it in auth.validator.js,
// usuario.validator.js and passwordReset.validator.js.
export const PASSWORD_MESSAGE = 'Entre 8 y 20 caracteres, con una mayúscula, un número y un carácter especial.';

// The length is counted like isLength of express-validator: an emoji (two
// UTF-16 units) is one character, and a variation selector (U+FE0E, U+FE0F)
// after another character does not count. So the same password is accepted or
// rejected on both sides.
const passwordLength = (text) => text.length
    - (text.match(/[^\uFE0E\uFE0F][\uFE0E\uFE0F]/g) || []).length
    - (text.match(/[\uD800-\uDBFF][\uDC00-\uDFFF]/g) || []).length;

export const isValidPassword = (password) => typeof password === 'string'
    && passwordLength(password) >= 8 && passwordLength(password) <= 20
    && /[A-Z]/.test(password) && /[0-9]/.test(password) && /[^A-Za-z0-9]/.test(password);
