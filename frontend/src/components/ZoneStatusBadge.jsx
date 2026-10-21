// HU-19 AC-14 / HU-21: the zone status is always written out, not shown by
// color alone.
export default function ZoneStatusBadge({ isActive }) {
    return (
        <span
            className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-caption font-medium ${isActive ? 'bg-parkea-50 text-parkea-700' : 'bg-danger-soft text-danger'}`}
        >
            <span className={`h-1.5 w-1.5 rounded-full ${isActive ? 'bg-parkea-600' : 'bg-danger'}`} aria-hidden="true" />
            {isActive ? 'Activa' : 'Inactiva'}
        </span>
    );
}
