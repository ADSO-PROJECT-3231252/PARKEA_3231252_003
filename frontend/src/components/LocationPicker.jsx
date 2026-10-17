import { useEffect, useMemo, useRef, useState } from 'react';
import { MapContainer, TileLayer, Marker, ZoomControl, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './LocationPicker.css';
import { LocateFixed, MapPin, AlertCircle } from 'lucide-react';

// HU-20 / HU-21: map to choose where a zone is. Same base map as HU-25
// (OpenStreetMap standard tiles: free, no API key, attribution required).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Dosquebradas / Pereira, until the zone has a location.
const DEFAULT_CENTER = [4.83, -75.67];
const DEFAULT_ZOOM = 13;
// Close enough to tell one block from the next.
const PLACE_ZOOM = 17;

// If this many tiles fail before any loads, the map is unusable.
const MAX_TILE_ERRORS = 3;

// Same teardrop pin as the zones map, built with plain HTML because Leaflet's
// default marker images don't resolve with Vite.
const PIN_ICON = L.divIcon({
    html: '<span class="location-picker-pin"></span>',
    className: 'location-picker-icon',
    iconSize: [32, 32],
    // The pin's tip: bottom-center of the rotated square
    iconAnchor: [16, 31],
});

// Clicking (or tapping) the map places the pin there. wrap() keeps the
// longitude between -180 and 180 if the map was panned past the date line.
function ClickToPlace({ onPick }) {
    useMapEvents({
        click: (e) => onPick(e.latlng.wrap()),
    });
    return null;
}

export default function LocationPicker({ position, onPick, focusKey }) {
    const [map, setMap] = useState(null);
    const [failed, setFailed] = useState(false);
    // True while the map is being pressed with the mouse or a finger
    const pressing = useRef(false);

    // Leaflet's container is a plain div; it is named so screen readers say
    // what it is. Typing the coordinates is the alternative to the map.
    useEffect(() => {
        if (!map) return;
        const container = map.getContainer();
        container.setAttribute('role', 'region');
        container.setAttribute('aria-label', 'Mapa para ubicar la zona. También puedes escribir la latitud y la longitud.');

        // Pressing the map takes the focus out of a coordinate field. The view
        // must not move then, or the click would land somewhere else.
        const press = () => {
            pressing.current = true;
        };
        const release = () => {
            // After the click event, which comes right after pointerup
            setTimeout(() => {
                pressing.current = false;
            }, 0);
        };
        container.addEventListener('pointerdown', press);
        document.addEventListener('pointerup', release);
        document.addEventListener('pointercancel', release);
        return () => {
            container.removeEventListener('pointerdown', press);
            document.removeEventListener('pointerup', release);
            document.removeEventListener('pointercancel', release);
        };
    }, [map]);

    // focusKey changes when the coordinates were typed or pasted (not when
    // they came from the map): the view moves to the pin only if it is out
    // of sight, so it doesn't jump on every key.
    useEffect(() => {
        if (!map || !position || focusKey === 0 || pressing.current) return;
        if (!map.getBounds().contains(position)) {
            map.setView(position, Math.max(map.getZoom(), PLACE_ZOOM), { animate: false });
        }
        // Only when the typed coordinates are confirmed, not while typing.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [map, focusKey]);

    const tileHandlers = useTileFailure(() => setFailed(true));

    const markerHandlers = useMemo(
        () => ({
            dragend: (e) => onPick(e.target.getLatLng().wrap()),
        }),
        [onPick],
    );

    const centerOnPin = () => {
        if (map && position) map.setView(position, Math.max(map.getZoom(), PLACE_ZOOM));
    };

    return (
        // isolate: Leaflet's panes use z-index up to 1000; this keeps them
        // below the sticky header.
        <div className="relative isolate h-[280px] overflow-hidden rounded-lg border border-neutral-200 sm:h-[320px]">
            <MapContainer
                ref={setMap}
                center={position ?? DEFAULT_CENTER}
                zoom={position ? PLACE_ZOOM : DEFAULT_ZOOM}
                zoomControl={false}
                className="location-picker-map h-full w-full"
            >
                <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} eventHandlers={tileHandlers} />
                <ZoomControl position="topright" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
                <ClickToPlace onPick={onPick} />
                {position && (
                    <Marker
                        position={position}
                        icon={PIN_ICON}
                        draggable
                        keyboard={false}
                        eventHandlers={markerHandlers}
                    />
                )}
            </MapContainer>

            {position ? (
                <button
                    type="button"
                    onClick={centerOnPin}
                    aria-label="Centrar el mapa en la ubicación"
                    title="Centrar el mapa en la ubicación"
                    className="absolute right-[10px] top-[86px] z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded-md border-2 border-black/20 bg-white bg-clip-padding text-neutral-900 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600"
                >
                    <LocateFixed className="h-4 w-4" aria-hidden="true" />
                </button>
            ) : (
                !failed && (
                    <p className="pointer-events-none absolute left-1/2 top-3 z-[1000] flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-white/95 px-3 py-1 text-caption font-medium text-neutral-900 shadow-sm">
                        <MapPin className="h-3.5 w-3.5 text-parkea-600" aria-hidden="true" />
                        Haz clic donde está la zona
                    </p>
                )
            )}

            {failed && (
                <div
                    role="alert"
                    className="absolute inset-0 z-[1000] flex flex-col items-center justify-center gap-2 bg-neutral-50 px-6 text-center"
                >
                    <AlertCircle className="h-6 w-6 text-neutral-600" aria-hidden="true" />
                    <p className="text-body text-neutral-900">No pudimos cargar el mapa.</p>
                    <p className="text-caption text-neutral-600">Puedes escribir la latitud y la longitud en los campos de arriba.</p>
                </div>
            )}
        </div>
    );
}

// Reports the map as failed when tiles keep erroring and none has loaded.
function useTileFailure(onFail) {
    const loaded = useRef(false);
    const errors = useRef(0);

    return useMemo(
        () => ({
            tileload: () => {
                loaded.current = true;
            },
            tileerror: () => {
                errors.current += 1;
                if (!loaded.current && errors.current === MAX_TILE_ERRORS) onFail();
            },
        }),
        // onFail only sets state, so the first one is enough.
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [],
    );
}
