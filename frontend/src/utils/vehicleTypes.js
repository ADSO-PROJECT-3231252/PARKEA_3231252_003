import { Car, Motorbike, Truck } from 'lucide-react';

// The vehicle types of PARKEA (vehicle_type ENUM of the backend), in the
// order every screen shows them. HU-31: one place for their names and
// icons, so a vehicle, a zone and a spot always say the same: "Moto".
export const VEHICLE_TYPES = ['car', 'motorcycle', 'truck'];

// label: the name of one ("Moto"); plural: in a sentence ("no recibe motos")
export const VEHICLE_TYPE_INFO = {
    car: { label: 'Carro', plural: 'carros', icon: Car },
    motorcycle: { label: 'Moto', plural: 'motos', icon: Motorbike },
    truck: { label: 'Camión', plural: 'camiones', icon: Truck },
};

// The options of a select: [{ value: 'car', label: 'Carro' }, ...]
export const VEHICLE_TYPE_OPTIONS = VEHICLE_TYPES.map((value) => ({ value, label: VEHICLE_TYPE_INFO[value].label }));

// Same data as a lookup table: { car: 'Carro', ... }
export const VEHICLE_TYPE_LABELS = Object.fromEntries(VEHICLE_TYPE_OPTIONS.map(({ value, label }) => [value, label]));

// The name of a type, or the value itself when it is not one of PARKEA
export const vehicleTypeLabel = (type) => VEHICLE_TYPE_INFO[type]?.label ?? type;
export const vehicleTypePlural = (type) => VEHICLE_TYPE_INFO[type]?.plural ?? type;
