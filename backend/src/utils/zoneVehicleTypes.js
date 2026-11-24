// HU-31: the vehicle types of a zone in the body of POST and PUT /api/zones,
// one item for each type the zone accepts:
//   vehicleTypes: [{ vehicleType: 'car', totalSlots: 20, hourlyRate: 2000 }]
// The rules are the same as the checks of zone_vehicle_types in the database.
const { VEHICLE_TYPES } = require('../constants/vehicleTypes');

// Upper limit of the spots of a zone, all its types together, so a typo (e.g.
// 50000 instead of 50) can't create thousands of spots in a single request
const MAX_TOTAL_SLOTS = 500;
// DECIMAL(10, 2) in the database
const MAX_HOURLY_RATE = 99999999.99;

const isPlainObject = (value) => typeof value === 'object' && value !== null && !Array.isArray(value);

// What is wrong with a rate, or null when it is valid
function rateProblem(hourlyRate) {
    if (typeof hourlyRate !== 'number' || !Number.isFinite(hourlyRate) || hourlyRate > MAX_HOURLY_RATE) {
        return `hourlyRate must be a number up to ${MAX_HOURLY_RATE}`;
    }
    // #316: every zone charges for its hours. With a rate of 0 the reservation
    // would ask the user to pay $ 0
    if (hourlyRate <= 0) return 'hourlyRate must be greater than 0';
    // hourly_rate is DECIMAL(10, 2): the database would round a third decimal
    // without any warning, so a rate is valid only when rounding it to 2
    // decimals does not change it. Checking rate * 100 for a whole number is
    // not safe: floating point makes 1.005 * 100 equal 100.49999999999999.
    if (Number(hourlyRate.toFixed(2)) !== hourlyRate) return 'hourlyRate must have at most 2 decimals';
    return null;
}

// Every error of `vehicleTypes`, in the shape of express-validator
// ({ path, msg }), so the screen can show each one next to its field. An
// empty list when it is valid.
function vehicleTypesErrors(vehicleTypes) {
    if (!Array.isArray(vehicleTypes)) {
        return [{ path: 'vehicleTypes', msg: 'vehicleTypes must be a list' }];
    }
    if (vehicleTypes.length === 0) {
        return [{ path: 'vehicleTypes', msg: 'vehicleTypes must have at least one vehicle type' }];
    }

    const errors = [];
    const seen = new Set();
    let total = 0;
    vehicleTypes.forEach((item, i) => {
        const at = `vehicleTypes[${i}]`;
        if (!isPlainObject(item)) {
            errors.push({ path: at, msg: 'each vehicle type must have vehicleType, totalSlots and hourlyRate' });
            return;
        }
        const { vehicleType, totalSlots, hourlyRate } = item;
        if (!VEHICLE_TYPES.includes(vehicleType)) {
            errors.push({ path: `${at}.vehicleType`, msg: `vehicleType must be one of ${VEHICLE_TYPES.join(', ')}` });
        } else if (seen.has(vehicleType)) {
            errors.push({ path: `${at}.vehicleType`, msg: `vehicleType ${vehicleType} is repeated` });
        } else {
            seen.add(vehicleType);
        }
        if (!Number.isInteger(totalSlots) || totalSlots < 1 || totalSlots > MAX_TOTAL_SLOTS) {
            errors.push({ path: `${at}.totalSlots`, msg: `totalSlots must be a whole number between 1 and ${MAX_TOTAL_SLOTS}` });
        } else {
            total += totalSlots;
        }
        const problem = rateProblem(hourlyRate);
        if (problem) errors.push({ path: `${at}.hourlyRate`, msg: problem });
    });
    if (total > MAX_TOTAL_SLOTS) {
        errors.push({ path: 'vehicleTypes', msg: `the zone can have at most ${MAX_TOTAL_SLOTS} spots, all its vehicle types together` });
    }
    return errors;
}

// The vehicle types of a valid body, in the order of VEHICLE_TYPES, with only
// the three values of each one
function vehicleTypesOf(vehicleTypes) {
    return VEHICLE_TYPES
        .map((type) => vehicleTypes.find((item) => item.vehicleType === type))
        .filter(Boolean)
        .map(({ vehicleType, totalSlots, hourlyRate }) => ({ vehicleType, totalSlots, hourlyRate }));
}

module.exports = { MAX_TOTAL_SLOTS, MAX_HOURLY_RATE, vehicleTypesErrors, vehicleTypesOf };
