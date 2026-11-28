import { VEHICLE_TYPE_INFO } from '../utils/vehicleTypes';

// HU-31: the icon of a vehicle type (a car when the type is not known). It
// only adds to the name next to it, so screen readers skip it.
export default function VehicleTypeIcon({ type, className = 'h-4 w-4' }) {
    const Icon = (VEHICLE_TYPE_INFO[type] ?? VEHICLE_TYPE_INFO.car).icon;
    return <Icon className={className} aria-hidden="true" />;
}
