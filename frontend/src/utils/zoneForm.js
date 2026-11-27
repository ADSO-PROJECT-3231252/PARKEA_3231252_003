import { isNotEmpty, REQUIRED_MESSAGE } from './validators';
import { translateError } from './errorMessages';
import { DAYS, MIN_OPEN_MINUTES, minutesOf } from './zoneHours';
import { VEHICLE_TYPES, vehicleTypePlural } from './vehicleTypes';

// Rules of the zone form, shared by create (HU-20) and edit (HU-21).
// They mirror validarZona in the backend (zona.controller.js), so most
// mistakes are caught before the request is sent.
export const ZONE_LIMITS = {
    name: 100,
    address: 255,
    // HU-31: the spots of a type, and of all the types of the zone together
    maxSlots: 500,
    // hourly_rate is DECIMAL(10, 2): up to 8 whole digits
    rateDigits: 8,
};

// HU-29: the key of the error of one day of the schedule ("day1" ... "day7")
export const dayField = (day) => `day${day}`;

// HU-31: the key of the error of the spots or the rate of one vehicle type
// ("car.totalSlots", "motorcycle.hourlyRate"). "vehicleTypes" is the error
// of the whole section (no type checked, or too many spots together).
export const typeField = (type, name) => `${type}.${name}`;

// Order of the fields on screen: the first one with an error gets the focus.
export const ZONE_FIELDS = [
    'name', 'address', 'vehicleTypes',
    ...VEHICLE_TYPES.flatMap((type) => [typeField(type, 'totalSlots'), typeField(type, 'hourlyRate')]),
    'latitude', 'longitude', 'open24h', 'schedule', ...DAYS.map(dayField),
];

// HU-31 AC-01: one entry per vehicle type, none checked. A type keeps its
// spots and its rate while it is unchecked, so checking it again uses them.
export const emptyVehicleTypes = () =>
    Object.fromEntries(VEHICLE_TYPES.map((type) => [type, { checked: false, totalSlots: '', hourlyRate: '' }]));

// The types that are checked, in the order car, motorcycle, truck: the order
// of the body of the API, so its errors (vehicleTypes[1]) find their type.
export const checkedTypes = (form) => VEHICLE_TYPES.filter((type) => form.vehicleTypes[type].checked);

// HU-31 AC-01: "Total: 30 cupos", the spots of the checked types. A type
// whose spots are not a valid number yet adds nothing.
export function totalSlotsOf(form) {
    return checkedTypes(form).reduce((sum, type) => {
        const slots = Number(form.vehicleTypes[type].totalSlots);
        return Number.isInteger(slots) && slots > 0 ? sum + slots : sum;
    }, 0);
}

// HU-31 AC-01: the rate a type starts with when it is checked: the first rate
// already typed for another checked type, or empty.
export function suggestedRate(form, type) {
    const other = checkedTypes(form).find((t) => t !== type && form.vehicleTypes[t].hourlyRate !== '');
    return other ? form.vehicleTypes[other].hourlyRate : '';
}

// HU-29 AC-02: one row per day, Monday to Sunday. A new row is open, with
// its times still to be written.
export const emptyWeek = () => DAYS.map((day) => ({ day, open: true, opensAt: '', closesAt: '' }));

export const EMPTY_ZONE_FORM = {
    name: '',
    address: '',
    // HU-31: { car: { checked, totalSlots, hourlyRate }, motorcycle, truck }
    vehicleTypes: emptyVehicleTypes(),
    latitude: '',
    longitude: '',
    // HU-29 AC-01: null until the admin chooses "Abierta 24 horas" (true) or
    // "Horario personalizado" (false); neither is chosen by default
    open24h: null,
    schedule: emptyWeek(),
};

export const SCHEDULE_MESSAGES = {
    choose: 'Elige si la zona abre las 24 horas o tiene un horario personalizado.',
    noOpenDay: 'Marca al menos un día como abierto.',
    missingTime: 'Escribe la hora de apertura y la de cierre.',
    tooShort: 'La apertura debe ser al menos 30 minutos antes del cierre. Si la zona abre de noche, elige Abierta 24 horas.',
    fromApi: 'Revisa las horas de este día.',
    scheduleFromApi: 'Revisa el horario: marca al menos un día como abierto.',
};

// HU-29 AC-02: the error of one open day, or '' when its times are valid
export function dayError(row) {
    if (!row.open) return '';
    if (!row.opensAt || !row.closesAt) return SCHEDULE_MESSAGES.missingTime;
    if (minutesOf(row.closesAt) - minutesOf(row.opensAt) < MIN_OPEN_MINUTES) return SCHEDULE_MESSAGES.tooShort;
    return '';
}

// The class of a text field of the zone form, red while it has an error
export const zoneInputClass = (hasError) =>
    `w-full rounded-md border bg-white px-3 py-2.5 text-body text-neutral-900 placeholder:text-neutral-500 focus:outline-none focus:ring-2 focus:ring-parkea-600 ${hasError ? 'border-danger' : 'border-neutral-200'}`;

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

// #232: a zone can only be inside Colombia. Same rectangle as validarZona in
// the backend (COORDINATES_OUTSIDE_COLOMBIA), San Andrés and Leticia included.
export const COLOMBIA_RECTANGLE = { south: -4.3, north: 13.5, west: -82, east: -66.8 };

const insideColombia = (lat, lng) =>
    lat >= COLOMBIA_RECTANGLE.south && lat <= COLOMBIA_RECTANGLE.north &&
    lng >= COLOMBIA_RECTANGLE.west && lng <= COLOMBIA_RECTANGLE.east;

// The DB keeps 7 decimals; 6 are about 11 cm, more than enough for a zone.
export const formatCoordinate = (value) => String(Number(value.toFixed(6)));

function coordinateError(value, min, max, label) {
    if (!isNotEmpty(value)) return REQUIRED_MESSAGE;
    if (!COORDINATE_FORMAT.test(value)) return `Ingresa la ${label} en grados decimales, por ejemplo ${min === -90 ? '4.8284' : '-75.6912'}.`;
    const number = Number(value);
    if (number < min || number > max) return `La ${label} debe estar entre ${min} y ${max}.`;
    return '';
}

// HU-31: the vehicle types of a zone as the form holds them. `types` is the
// list of the API: the administrator gets the types turned off too
// (isAccepting false), which stay unchecked with their spots and rate.
export function typesToForm(types) {
    const form = emptyVehicleTypes();
    if (!Array.isArray(types)) return form;
    for (const item of types) {
        if (!form[item.vehicleType]) continue;
        form[item.vehicleType] = {
            checked: item.isAccepting !== false,
            totalSlots: String(item.totalSlots ?? ''),
            hourlyRate: item.hourlyRate == null ? '' : String(Number(item.hourlyRate)),
        };
    }
    return form;
}

// HU-21 AC-01: the zone as the API returns it, as the form holds it. Numbers
// become text; String(Number()) drops the zeros the DB adds ("4.8284000",
// "2500.00") but keeps every decimal, so saving without changes moves nothing.
// HU-29 AC-01: the current choice of hours is shown; the days a custom
// schedule does not list are closed. HU-31: `types` replaces the types of
// the zone when the administrator list has them (with the ones turned off).
export function zoneToForm(zone, types = zone.vehicleTypes) {
    const custom = zone.open24h === false;
    return {
        name: zone.name ?? '',
        address: zone.address ?? '',
        vehicleTypes: typesToForm(types),
        latitude: zone.latitude == null ? '' : String(Number(zone.latitude)),
        longitude: zone.longitude == null ? '' : String(Number(zone.longitude)),
        open24h: typeof zone.open24h === 'boolean' ? zone.open24h : null,
        schedule: custom
            ? DAYS.map((day) => {
                const hours = (zone.schedule ?? []).find((s) => s.day === day);
                return hours
                    ? { day, open: true, opensAt: hours.opensAt, closesAt: hours.closesAt }
                    : { day, open: false, opensAt: '', closesAt: '' };
            })
            : emptyWeek(),
    };
}

export const VEHICLE_TYPE_MESSAGES = {
    noType: 'Marca al menos un tipo de vehículo.',
    slots: `Los cupos deben ser un número entero entre 1 y ${ZONE_LIMITS.maxSlots}.`,
    rate: 'La tarifa por hora debe ser mayor que $ 0.',
    rateFromApi: 'Ingresa una tarifa válida en pesos.',
    fromApi: `Revisa los tipos de vehículo: marca al menos uno, con máximo ${ZONE_LIMITS.maxSlots} cupos entre todos.`,
};

// HU-31 AC-02: the zone has at most 500 spots, all its types together
export const tooManySlotsError = (total) =>
    `La zona puede tener máximo ${ZONE_LIMITS.maxSlots} cupos entre todos los tipos. Ahora suma ${total}.`;

// HU-21 AC-03 and HU-31 AC-04: the spots of a type can't go below the ones
// that hold a Pending or Active reservation. Same text whether the form or
// the API catches it: "Mínimo 4: hay 4 cupos de motos con reservas".
export function capacityInUseError(spotsInUse, type) {
    const spots = spotsInUse === 1 ? 'hay 1 cupo' : `hay ${spotsInUse} cupos`;
    return `Mínimo ${spotsInUse}: ${spots} de ${vehicleTypePlural(type)} con reservas pendientes o activas.`;
}

// Returns the coordinates as numbers when both are valid and inside Colombia,
// or null. Outside Colombia the map shows no pin and does not move to them.
export function getValidPosition(latitude, longitude) {
    if (coordinateError(latitude, -90, 90, 'latitud') || coordinateError(longitude, -180, 180, 'longitud')) return null;
    const lat = Number(latitude);
    const lng = Number(longitude);
    return insideColombia(lat, lng) ? [lat, lng] : null;
}

export function validateZoneCoordinates(latitude, longitude) {
    const errors = {};
    const latitudeError = coordinateError(latitude, -90, 90, 'latitud');
    const longitudeError = coordinateError(longitude, -180, 180, 'longitud');

    if (latitudeError) errors.latitude = latitudeError;
    if (longitudeError) errors.longitude = longitudeError;

    // #232: valid coordinates, but outside Colombia
    if (!latitudeError && !longitudeError && !insideColombia(Number(latitude), Number(longitude))) {
        const message = translateError('COORDINATES_OUTSIDE_COLOMBIA');
        errors.latitude = message;
        errors.longitude = message;
    }

    return errors;
}

// HU-31 AC-02: the errors of the vehicle types. spotsInUse has the spots in
// use of each type ({ motorcycle: 4 }), only known when editing (AC-04).
function vehicleTypeErrors(form, spotsInUse) {
    const errors = {};
    const checked = checkedTypes(form);
    if (checked.length === 0) {
        errors.vehicleTypes = VEHICLE_TYPE_MESSAGES.noType;
        return errors;
    }

    let total = 0;
    let allValid = true;
    for (const type of checked) {
        const { totalSlots, hourlyRate } = form.vehicleTypes[type];
        const slots = Number(totalSlots);
        if (!isNotEmpty(totalSlots)) {
            errors[typeField(type, 'totalSlots')] = REQUIRED_MESSAGE;
            allValid = false;
        } else if (!Number.isInteger(slots) || slots < 1 || slots > ZONE_LIMITS.maxSlots) {
            errors[typeField(type, 'totalSlots')] = VEHICLE_TYPE_MESSAGES.slots;
            allValid = false;
        } else if (slots < (spotsInUse[type] ?? 0)) {
            errors[typeField(type, 'totalSlots')] = capacityInUseError(spotsInUse[type], type);
        } else {
            total += slots;
        }

        // HU-20 AC-04 (#316): every type charges for its hours
        if (!isNotEmpty(hourlyRate)) {
            errors[typeField(type, 'hourlyRate')] = REQUIRED_MESSAGE;
        } else if (Number(hourlyRate) <= 0) {
            errors[typeField(type, 'hourlyRate')] = VEHICLE_TYPE_MESSAGES.rate;
        }
    }
    if (allValid && total > ZONE_LIMITS.maxSlots) errors.vehicleTypes = tooManySlotsError(total);
    return errors;
}

// HU-20 AC-01 to AC-06: one message per field, or none when the field is
// valid. spotsInUse (HU-21 AC-03, HU-31 AC-04) is only known when editing.
export function validateZoneForm(form, { spotsInUse = {} } = {}) {
    const errors = {};

    if (!isNotEmpty(form.name)) errors.name = REQUIRED_MESSAGE;
    if (!isNotEmpty(form.address)) errors.address = REQUIRED_MESSAGE;

    Object.assign(errors, vehicleTypeErrors(form, spotsInUse));

    Object.assign(errors, validateZoneCoordinates(form.latitude, form.longitude));

    // HU-29 AC-01 / AC-02: the hours must be chosen; a custom schedule needs
    // at least one open day, and each open day valid times
    if (typeof form.open24h !== 'boolean') {
        errors.open24h = SCHEDULE_MESSAGES.choose;
    } else if (!form.open24h) {
        if (!form.schedule.some((row) => row.open)) errors.schedule = SCHEDULE_MESSAGES.noOpenDay;
        for (const row of form.schedule) {
            const error = dayError(row);
            if (error) errors[dayField(row.day)] = error;
        }
    }

    return errors;
}

// Body of POST /api/zones (and PUT /api/zones/:id). The backend checks the
// types, so the numbers are sent as numbers, not as the strings typed.
export function buildZonePayload(form) {
    return {
        name: form.name.trim(),
        address: form.address.trim(),
        // HU-31: the checked types only; a type that is not sent is turned off
        vehicleTypes: checkedTypes(form).map((vehicleType) => ({
            vehicleType,
            totalSlots: Number(form.vehicleTypes[vehicleType].totalSlots),
            hourlyRate: Number(form.vehicleTypes[vehicleType].hourlyRate),
        })),
        latitude: Number(Number(form.latitude).toFixed(7)),
        longitude: Number(Number(form.longitude).toFixed(7)),
        // HU-29: the open days only; a day that is not sent is closed
        open24h: form.open24h,
        ...(form.open24h
            ? {}
            : { schedule: form.schedule.filter((row) => row.open).map(({ day, opensAt, closesAt }) => ({ day, opensAt, closesAt })) }),
    };
}

const FIELD_BY_CODE = {
    ZONE_NAME_TAKEN: ['name'],
    INVALID_COORDINATES: ['latitude', 'longitude'],
    COORDINATES_OUTSIDE_COLOMBIA: ['latitude', 'longitude'],
};

const VALIDATION_MESSAGES = {
    name: `El nombre puede tener máximo ${ZONE_LIMITS.name} caracteres.`,
    address: `La dirección puede tener máximo ${ZONE_LIMITS.address} caracteres.`,
    vehicleTypes: VEHICLE_TYPE_MESSAGES.fromApi,
};

// HU-31 AC-02: "vehicleTypes[1].totalSlots" is the spots of the second type
// sent, which buildZonePayload sends in the order of checkedTypes
const TYPE_PATH = /^vehicleTypes\[(\d+)\](?:\.(\w+))?$/;
const TYPE_PATH_MESSAGES = { totalSlots: VEHICLE_TYPE_MESSAGES.slots, hourlyRate: VEHICLE_TYPE_MESSAGES.rateFromApi };

// HU-31 AC-04: the spots of one type could not be lowered
function capacityFields(data) {
    if (!VEHICLE_TYPES.includes(data.vehicleType)) return { vehicleTypes: translateError(data.code) };
    const field = typeField(data.vehicleType, 'totalSlots');
    if (data.code === 'CAPACITY_BELOW_IN_USE' && Number.isInteger(data.spotsInUse)) {
        return { [field]: capacityInUseError(data.spotsInUse, data.vehicleType) };
    }
    return { [field]: translateError(data.code) };
}

// HU-20 AC-02 / AC-11: errors returned by the API go under their field when
// there is one. Returns { fields } for those, or { general } for anything else.
// `form` is the form that was sent, to find the type of "vehicleTypes[1]".
export function mapZoneApiError(err, form) {
    const data = err.response?.data ?? {};
    let fields = {};

    if (FIELD_BY_CODE[data.code]) {
        for (const field of FIELD_BY_CODE[data.code]) fields[field] = translateError(data.code);
    } else if (data.code === 'CAPACITY_BELOW_IN_USE' || data.code === 'INSUFFICIENT_AVAILABLE_SPOTS') {
        fields = capacityFields(data);
    } else if (data.code === 'VALIDATION_ERROR' && Array.isArray(data.errors)) {
        const sent = form ? checkedTypes(form) : [];
        for (const { path, day } of data.errors) {
            if (VALIDATION_MESSAGES[path]) fields[path] = VALIDATION_MESSAGES[path];
            const typePath = TYPE_PATH.exec(path ?? '');
            if (typePath) {
                const type = sent[Number(typePath[1])];
                const message = TYPE_PATH_MESSAGES[typePath[2]];
                if (type && message) fields[typeField(type, typePath[2])] = message;
                else fields.vehicleTypes = VEHICLE_TYPE_MESSAGES.fromApi;
            }
            // HU-29 AC-02: an error about one day goes next to that day
            if (path === 'open24h') fields.open24h = SCHEDULE_MESSAGES.choose;
            if (path === 'schedule') {
                if (DAYS.includes(day)) fields[dayField(day)] = SCHEDULE_MESSAGES.fromApi;
                else fields.schedule = SCHEDULE_MESSAGES.scheduleFromApi;
            }
        }
    }

    if (Object.keys(fields).length > 0) return { fields };
    return { general: translateError(data.code) };
}
