export const isValidEmail = (email) => {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
};

export const isValidPlate = (plate) => {
    return /^[A-Z]{3}\d{3}$/.test(plate);
};

export const isNotEmpty = (value) => {
    return value !== undefined && value !== null && value.toString().trim() !== '';
};