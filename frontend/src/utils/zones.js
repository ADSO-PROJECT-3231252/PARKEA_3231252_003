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
