import { useCallback, useEffect, useMemo, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, ZoomControl } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ZoneMap.css';
import { SquareParking, Ban } from 'lucide-react';
import { getZoneAvailability } from '../utils/zones';

// HU-25: map view of the active zones. Base map: CARTO Positron (free,
// no API key, attribution required).
const TILE_URL = 'https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png';
const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>';

// Used only until the zones are fitted on screen (Dosquebradas / Pereira).
const DEFAULT_CENTER = [4.83, -75.67];
const DEFAULT_ZOOM = 13;
const SINGLE_ZONE_ZOOM = 16;

const PIN_CLASSES = {
    available: 'bg-parkea-600',
    almost: 'bg-warning',
    full: 'bg-danger',
};

// Coordinates come from MySQL DECIMAL columns, so they arrive as strings and
// may be null for zones created before they were required (HU-20).
function getPosition(zone) {
    if (zone.latitude == null || zone.longitude == null) return null;
    const lat = Number(zone.latitude);
    const lng = Number(zone.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return [lat, lng];
}

// AC-02/AC-03: one pin per zone, colored by availability; full zones also get
// a different icon so the state is not conveyed by color alone.
function buildIcon(name, availableSlots, totalSlots) {
    const availability = getZoneAvailability(availableSlots, totalSlots);
    const Icon = availability.state === 'full' ? Ban : SquareParking;
    const html = renderToStaticMarkup(
        <span className="relative block h-10 w-8">
            <span
                className={`zone-marker-pin absolute left-0 top-0 flex h-8 w-8 items-center justify-center border-2 border-white shadow-md ${PIN_CLASSES[availability.state]}`}
            >
                <Icon className="h-4 w-4 text-white" aria-hidden="true" />
            </span>
            <span className="absolute left-9 top-1 max-w-[160px] truncate whitespace-nowrap rounded-md border border-neutral-200 bg-white px-2 py-0.5 text-caption font-medium text-neutral-900 shadow-sm">
                {name}
            </span>
            <span className="sr-only">
                {`, ${availability.text}, ${availableSlots} de ${totalSlots} cupos`}
            </span>
        </span>,
    );
    return L.divIcon({
        html,
        className: 'zone-marker-icon',
        iconSize: [32, 40],
        // The pin's tip: bottom-center of the rotated square
        iconAnchor: [16, 39],
        popupAnchor: [0, -38],
    });
}

function ZoneMarker({ zone, position }) {
    // Rebuilt only when what the pin shows changes, so a background refresh of
    // the same data doesn't recreate the marker icon.
    const { name, availableSlots, totalSlots } = zone;
    const icon = useMemo(
        () => buildIcon(name, availableSlots, totalSlots),
        [name, availableSlots, totalSlots],
    );

    return (
        <Marker position={position} icon={icon} />
    );
}

export default function ZoneMap({ zones }) {
    const [map, setMap] = useState(null);

    const placed = useMemo(
        () => zones.map((zone) => ({ zone, position: getPosition(zone) })).filter((z) => z.position),
        [zones],
    );
    // Serialized so the view is only re-fitted when the pins actually change,
    // not on every background refresh of the same zones.
    const positionsKey = JSON.stringify(placed.map((p) => p.position));
    const positions = useMemo(() => JSON.parse(positionsKey), [positionsKey]);

    // AC-07: open on a view that includes every zone.
    const fitAll = useCallback(() => {
        if (!map || positions.length === 0) return;
        if (positions.length === 1) {
            map.setView(positions[0], SINGLE_ZONE_ZOOM);
        } else {
            map.fitBounds(positions, { padding: [56, 56], maxZoom: SINGLE_ZONE_ZOOM });
        }
    }, [map, positions]);

    useEffect(() => {
        fitAll();
    }, [fitAll]);

    return (
        <div>
            {/* isolate: Leaflet's panes use z-index up to 1000; this keeps them
                below the sticky header and the dialogs. */}
            <div className="relative isolate h-[65vh] min-h-[380px] overflow-hidden rounded-lg border border-neutral-200">
                <MapContainer
                    ref={setMap}
                    center={DEFAULT_CENTER}
                    zoom={DEFAULT_ZOOM}
                    zoomControl={false}
                    className="zone-map h-full w-full"
                >
                    <TileLayer
                        url={TILE_URL}
                        attribution={TILE_ATTRIBUTION}
                        subdomains="abcd"
                        maxZoom={20}
                    />
                    <ZoomControl position="bottomleft" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
                    {placed.map(({ zone, position }) => (
                        <ZoneMarker key={zone.id} zone={zone} position={position} />
                    ))}
                </MapContainer>

            </div>
        </div>
    );
}