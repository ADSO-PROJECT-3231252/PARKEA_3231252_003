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