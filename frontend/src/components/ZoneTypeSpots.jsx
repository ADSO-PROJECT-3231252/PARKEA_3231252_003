import { formatCurrency } from '../utils/format';
import { vehicleTypeLabel } from '../utils/vehicleTypes';
import { acceptedTypesOf, zoneTypeOf } from '../utils/zones';
import VehicleTypeIcon from './VehicleTypeIcon';

const SIZES = {
    md: { text: 'text-body', icon: 'h-4 w-4' },
    sm: { text: 'text-caption', icon: 'h-3.5 w-3.5' },
};

// HU-31 AC-08: the vehicle types a zone accepts, each one with its free spots
// now and its rate, in columns so the numbers line up:
//
//     Moto     5 libres   $ 1.500/h
//
// Where there is no room for the three columns (the summary of a pin on a
// phone), the rate goes under the name. The API only sends the types that
// take reservations, so a type that is off is not here. A screen reader
// hears "Moto, 5 libres, $ 1.500 por hora".
export default function ZoneTypeSpots({ zone, size = 'md', className = '' }) {
    const { text, icon } = SIZES[size];
    return (
        <div className={`@container ${className}`}>
            <ul
                aria-label="Tipos de vehículo"
                className={`grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 @[15rem]:grid-cols-[auto_auto_auto] @[15rem]:justify-start ${text}`}
            >
                {acceptedTypesOf(zone).map((type) => {
                    const { availableSlots, hourlyRate } = zoneTypeOf(zone, type);
                    return (
                        <li key={type} className="col-span-full grid grid-cols-subgrid items-center text-neutral-900">
                            <span className="flex items-center gap-1.5 font-medium">
                                <VehicleTypeIcon type={type} className={`${icon} shrink-0 text-parkea-600`} />
                                {vehicleTypeLabel(type)}
                                <span className="sr-only">, </span>
                            </span>
                            <span className="whitespace-nowrap text-right">
                                <span className="font-mono tabular-nums">{availableSlots}</span> {availableSlots === 1 ? 'libre' : 'libres'}
                                <span className="sr-only">, </span>
                            </span>
                            <span className="col-span-2 whitespace-nowrap pl-5 font-mono @[15rem]:col-span-1 @[15rem]:pl-0 @[15rem]:text-right">
                                {formatCurrency(hourlyRate)}
                                <span aria-hidden="true">/h</span>
                                <span className="sr-only"> por hora</span>
                            </span>
                        </li>
                    );
                })}
            </ul>
        </div>
    );
}
