// Vehicle types accepted by the backend (vehicle_type ENUM) and their labels.
// Shared by RegisterVehicle.jsx, EditVehicle.jsx and VehicleList.jsx so the
// three screens always show the same types with the same names.
export const VEHICLE_TYPE_OPTIONS = [
    { value: 'car', label: 'Automóvil' },
    { value: 'motorcycle', label: 'Motocicleta' },
    { value: 'truck', label: 'Camión' },
];

// Same data as a lookup table: { car: 'Automóvil', ... }
export const VEHICLE_TYPE_LABELS = Object.fromEntries(
    VEHICLE_TYPE_OPTIONS.map(({ value, label }) => [value, label]),
); 
