import { isNotEmpty, REQUIRED_MESSAGE } from './validators';
import { translateError } from './errorMessages';

// Rules of the zone form, shared by create (HU-20) and edit (HU-21).
// They mirror validarZona in the backend (zona.controller.js), so most
// mistakes are caught before the request is sent.
export const ZONE_LIMITS = {
    name: 100,
    address: 255,
    maxSlots: 500,
    // hourly_rate is DECIMAL(10, 2): up to 8 whole digits
    rateDigits: 8,
};

// Order of the fields on screen: the first one with an error gets the focus.
export const ZONE_FIELDS = ['name', 'address', 'totalSlots', 'hourlyRate', 'latitude', 'longitude'];

export const EMPTY_ZONE_FORM = {
    name: '',
    address: '',
    totalSlots: '',
    hourlyRate: '',
    latitude: '',
    longitude: '',
};

// Capacity and rate only accept digits: the rate is in whole pesos, so a
// typed "2.000" stays "2000" instead of becoming 2.
export const onlyDigits = (value) => value.replace(/\D/g, '');

// Coordinates: digits, one leading minus and a decimal point. A comma is
// taken as the decimal point, since that is how many people type it.
export const cleanCoordinate = (value) => value.replace(/,/g, '.').replace(/[^\d.-]/g, '');

// Decimal degrees only ("4.8284", "-75.6912"). Number() alone would also
// accept things like "1e2" or "0x10".
const COORDINATE_FORMAT = /^-?\d{1,3}(\.\d+)?$/;

// Accepts "4.8284, -75.6912" or "4.8284 -75.6912", the format Google Maps
// copies when you right-click a place.
const COORDINATE_PAIR = /^\s*(-?\d{1,3}(?:\.\d+)?)\s*[,;\s]\s*(-?\d{1,3}(?:\.\d+)?)\s*$/;

export function parseCoordinatePair(text) {
    const match = COORDINATE_PAIR.exec(text);
    return match ? { latitude: match[1], longitude: match[2] } : null;
}

// The DB keeps 7 decimals; 6 are about 11 cm, more than enough for a zone.
export const formatCoordinate = (value) => String(Number(value.toFixed(6)));

function coordinateError(value, min, max, label) {
    if (!isNotEmpty(value)) return REQUIRED_MESSAGE;
    if (!COORDINATE_FORMAT.test(value)) return `Ingresa la ${label} en grados decimales, por ejemplo ${min === -90 ? '4.8284' : '-75.6912'}.`;
    const number = Number(value);
    if (number < min || number > max) return `La ${label} debe estar entre ${min} y ${max}.`;
    return '';
}

// HU-21 AC-01: the zone as the API returns it, as the form holds it. Numbers
// become text; String(Number()) drops the zeros the DB adds ("4.8284000",
// "2500.00") but keeps every decimal, so saving without changes moves nothing.
export function zoneToForm(zone) {
    return {
        name: zone.name ?? '',
        address: zone.address ?? '',
        totalSlots: String(zone.totalSlots ?? ''),
        hourlyRate: zone.hourlyRate == null ? '' : String(Number(zone.hourlyRate)),
        latitude: zone.latitude == null ? '' : String(Number(zone.latitude)),
        longitude: zone.longitude == null ? '' : String(Number(zone.longitude)),
    };
}

// HU-21 AC-03: the capacity can't go below the spots taken by Pending or
// Active reservations. Same text whether the form or the API catches it.
export function capacityInUseError(spotsInUse) {
    return spotsInUse === 1
        ? 'Hay 1 cupo en uso por una reserva pendiente o activa. La capacidad no puede ser menor.'
        : `Hay ${spotsInUse} cupos en uso por reservas pendientes o activas. La capacidad no puede ser menor.`;
}

// Returns the coordinates as numbers when both are valid, or null.
export function getValidPosition(latitude, longitude) {
    if (coordinateError(latitude, -90, 90, 'latitud') || coordinateError(longitude, -180, 180, 'longitud')) return null;
    return [Number(latitude), Number(longitude)];
}

// HU-20 AC-01 to AC-06: one message per field, or none when the field is
// valid. spotsInUse (HU-21 AC-03) is only known when editing.
export function validateZoneForm(form, { spotsInUse = 0 } = {}) {
    const errors = {};

    if (!isNotEmpty(form.name)) errors.name = REQUIRED_MESSAGE;
    if (!isNotEmpty(form.address)) errors.address = REQUIRED_MESSAGE;

    if (!isNotEmpty(form.totalSlots)) {
        errors.totalSlots = REQUIRED_MESSAGE;
    } else {
        const slots = Number(form.totalSlots);
        if (!Number.isInteger(slots) || slots < 1 || slots > ZONE_LIMITS.maxSlots) {
            errors.totalSlots = `La capacidad debe ser un número entero entre 1 y ${ZONE_LIMITS.maxSlots}.`;
        } else if (slots < spotsInUse) {
            errors.totalSlots = capacityInUseError(spotsInUse);
        }
    }

    if (!isNotEmpty(form.hourlyRate)) errors.hourlyRate = REQUIRED_MESSAGE;

    const latitudeError = coordinateError(form.latitude, -90, 90, 'latitud');
    if (latitudeError) errors.latitude = latitudeError;
    const longitudeError = coordinateError(form.longitude, -180, 180, 'longitud');
    if (longitudeError) errors.longitude = longitudeError;

    return errors;
}

// Body of POST /api/zones (and PUT /api/zones/:id). The backend checks the
// types, so the numbers are sent as numbers, not as the strings typed.
export function buildZonePayload(form) {
    return {
        name: form.name.trim(),
        address: form.address.trim(),
        totalSlots: Number(form.totalSlots),
        hourlyRate: Number(form.hourlyRate),
        latitude: Number(Number(form.latitude).toFixed(7)),
        longitude: Number(Number(form.longitude).toFixed(7)),
    };
}

const FIELD_BY_CODE = {
    ZONE_NAME_TAKEN: ['name'],
    INVALID_CAPACITY: ['totalSlots'],
    NEGATIVE_VALUE: ['hourlyRate'],
    INVALID_COORDINATES: ['latitude', 'longitude'],
    CAPACITY_BELOW_IN_USE: ['totalSlots'],
    INSUFFICIENT_AVAILABLE_SPOTS: ['totalSlots'],
};

const VALIDATION_MESSAGES = {
    name: `El nombre puede tener máximo ${ZONE_LIMITS.name} caracteres.`,
    address: `La dirección puede tener máximo ${ZONE_LIMITS.address} caracteres.`,
    hourlyRate: 'Ingresa una tarifa válida en pesos.',
};

// HU-20 AC-02 / AC-11: errors returned by the API go under their field when
// there is one. Returns { fields } for those, or { general } for anything else.
export function mapZoneApiError(err) {
    const data = err.response?.data ?? {};
    const fields = {};

    if (FIELD_BY_CODE[data.code]) {
        for (const field of FIELD_BY_CODE[data.code]) fields[field] = translateError(data.code);
        // HU-21 AC-03: the message says how many spots are in use
        if (data.code === 'CAPACITY_BELOW_IN_USE' && Number.isInteger(data.spotsInUse)) {
            fields.totalSlots = capacityInUseError(data.spotsInUse);
        }
    } else if (data.code === 'VALIDATION_ERROR' && Array.isArray(data.errors)) {
        for (const { path } of data.errors) {
            if (VALIDATION_MESSAGES[path]) fields[path] = VALIDATION_MESSAGES[path];
        }
    }

    if (Object.keys(fields).length > 0) return { fields };
    return { general: translateError(data.code) };
}
