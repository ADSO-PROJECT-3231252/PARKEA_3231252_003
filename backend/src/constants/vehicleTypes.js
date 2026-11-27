// The vehicle types of PARKEA, in the order the screens show them. A vehicle
// has one of them (vehicles.vehicle_type), and so does every spot of a zone
// (parking_spots.vehicle_type) and every type a zone accepts
// (zone_vehicle_types.vehicle_type, HU-31).
const VEHICLE_TYPES = Object.freeze(['car', 'motorcycle', 'truck']);

module.exports = { VEHICLE_TYPES };
