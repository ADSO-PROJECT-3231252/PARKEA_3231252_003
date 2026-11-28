import { VEHICLE_TYPES, vehicleTypePlural } from './vehicleTypes';

// Availability state shared by the zone list (HU-09) and the Home zone widget.
// Returns the state key plus its label; each screen applies its own styles.
export function getZoneAvailability(availableSlots, totalSlots) {
    if (availableSlots === 0) {
        return { state: 'full', text: 'Llena' };
    }
    if (totalSlots > 0 && availableSlots / totalSlots <= 0.2) {
        return { state: 'almost', text: 'Casi llena' };
    }
    return { state: 'available', text: 'Disponible' };
}

// HU-31: the type `type` of a zone as the API sends it ({ vehicleType,
// totalSlots, availableSlots, hourlyRate }), or null when the zone does not
// accept it. The API only sends the types that take reservations.
export const zoneTypeOf = (zone, type) => zone?.vehicleTypes?.find((item) => item.vehicleType === type) ?? null;

// HU-31: the types a zone accepts, in the order of every screen
export const acceptedTypesOf = (zone) => VEHICLE_TYPES.filter((type) => zoneTypeOf(zone, type));

// HU-31 AC-09: the spots of the zone, or the ones of a type when the screen is
// about that type (the filter of the list): { availableSlots, totalSlots }
export function spotsOf(zone, type) {
    const item = type ? zoneTypeOf(zone, type) : null;
    return item ?? { availableSlots: zone.availableSlots, totalSlots: zone.totalSlots };
}

// HU-31 AC-09: the type of the filter "?type=motorcycle", or null for "Todos"
// (also when the value is not a type)
export const typeFilterOf = (value) => (VEHICLE_TYPES.includes(value) ? value : null);

// HU-19 AC-07 / AC-08: texts of the activate/deactivate confirmation, shared by
// the zone list (HU-19) and the edit form (HU-21 AC-07). activeReservations is
// the number of Pending or Active reservations; when it is unknown the warning
// is given anyway, without the number.
export function getZoneToggleDialog(zone) {
    if (!zone.isActive) {
        return {
            title: 'Activar zona',
            message: `Vas a activar la zona ${zone.name}. Volverá a aparecer en la lista pública y aceptará reservas.`,
            confirmLabel: 'Activar zona',
            variant: 'default',
        };
    }

    let message = `Vas a desactivar la zona ${zone.name}. Dejará de aparecer en la lista pública y no aceptará reservas nuevas.`;
    if (zone.activeReservations == null) {
        message += ' Si tiene reservas pendientes o activas, seguirán válidas hasta que terminen.';
    } else {
        const inUse = Number(zone.activeReservations) || 0;
        if (inUse > 0) {
            message += ` Tiene ${inUse} ${inUse === 1 ? 'reserva pendiente o activa, que seguirá válida' : 'reservas pendientes o activas, que seguirán válidas'} hasta que termine${inUse === 1 ? '' : 'n'}.`;
        }
    }
    return { title: 'Desactivar zona', message, confirmLabel: 'Desactivar zona', variant: 'danger' };
}

// HU-19 AC-10: outcome of the change, with the zone as the API returned it.
export function getZoneToggleSuccess(zone) {
    return zone.isActive
        ? `La zona ${zone.name} fue activada y vuelve a aparecer en la lista pública.`
        : `La zona ${zone.name} fue desactivada. Ya no aparece en la lista pública ni acepta reservas nuevas.`;
}

// "motos", "motos y camiones", "carros, motos y camiones"
export function joinTypes(types) {
    const names = types.map(vehicleTypePlural);
    return names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} y ${names.at(-1)}`;
}

// HU-31 AC-05: the confirmation before saving a zone whose types were
// unchecked. `turnedOff` has each type with its open reservations, or null
// when the number is unknown. Like a deactivated zone, the type takes no new
// reservations and the open ones stay valid.
export function getTypesOffDialog(zoneName, turnedOff) {
    const types = turnedOff.map(({ type }) => type);
    let message = `La zona ${zoneName} no aceptará reservas nuevas de ${joinTypes(types)}.`;
    const known = turnedOff.every(({ openReservations }) => Number.isInteger(openReservations));
    if (!known) {
        message += ` Si tiene reservas pendientes o activas de ${types.length === 1 ? 'ese tipo' : 'esos tipos'}, seguirán válidas hasta que terminen.`;
    } else {
        const open = turnedOff.filter(({ openReservations }) => openReservations > 0);
        if (open.length > 0) {
            const parts = open.map(({ type, openReservations }) =>
                `${openReservations} ${openReservations === 1 ? 'reserva' : 'reservas'} de ${vehicleTypePlural(type)}`);
            const total = open.reduce((sum, { openReservations }) => sum + openReservations, 0);
            message += ` Tiene ${parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts.at(-1)}`} ${total === 1 ? 'pendiente o activa, que seguirá válida' : 'pendientes o activas, que seguirán válidas'} hasta que ${total === 1 ? 'termine' : 'terminen'}.`;
        }
    }
    message += types.length === 1
        ? ' Sus cupos y su tarifa se conservan si lo vuelves a marcar.'
        : ' Sus cupos y sus tarifas se conservan si los vuelves a marcar.';
    return {
        title: `Dejar de recibir ${joinTypes(types)}`,
        message,
        confirmLabel: 'Guardar cambios',
        variant: 'danger',
    };
}
