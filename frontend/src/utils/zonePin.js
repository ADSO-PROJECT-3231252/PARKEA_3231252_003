import { getZoneAvailability } from './zones';

// HU-25 AC-02/AC-03: HTML of the zone pins on the map. It is a plain string
// (not react-dom/server) so the map chunk does not have to bundle the React
// server renderer.

const PIN_CLASSES = {
    available: 'bg-parkea-600',
    almost: 'bg-warning',
    full: 'bg-danger',
};

// The icon strokes below are copied from lucide-react 1.33.0 (SquareParking
// and Ban). Unlike the other icons in the app, they do NOT update with the
// package: whoever upgrades lucide-react must check these two by hand.
const ICON_ATTRS =
    'xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"';

const ICON_PATHS = {
    parking: '<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 17V7h4a3 3 0 0 1 0 6H9"/>',
    ban: '<circle cx="12" cy="12" r="10"/><path d="M4.929 4.929 19.07 19.071"/>',
};

// Zone names are user data and go into an HTML string, so they must be
// escaped (React did this automatically before). Do not remove this.
export function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// One pin per zone, colored by availability; full zones also get a different
// icon so the state is not conveyed by color alone.
export function buildPinHtml(name, availableSlots, totalSlots) {
    const availability = getZoneAvailability(availableSlots, totalSlots);
    const iconPaths = availability.state === 'full' ? ICON_PATHS.ban : ICON_PATHS.parking;
    return (
        '<span class="relative block h-10 w-8">' +
        `<span class="zone-marker-pin absolute left-0 top-0 flex h-8 w-8 items-center justify-center border-2 border-white shadow-md ${PIN_CLASSES[availability.state]}">` +
        `<svg ${ICON_ATTRS} class="h-4 w-4 text-white">${iconPaths}</svg>` +
        '</span>' +
        '<span class="absolute left-9 top-1 max-w-[160px] truncate whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-caption font-medium text-neutral-900 shadow-sm">' +
        escapeHtml(name) +
        '</span>' +
        '<span class="sr-only">' +
        escapeHtml(`, ${availability.text}, ${availableSlots} de ${totalSlots} cupos`) +
        '</span>' +
        '</span>'
    );
}
