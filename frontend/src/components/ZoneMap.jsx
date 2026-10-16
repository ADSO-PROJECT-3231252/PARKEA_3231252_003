import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MapContainer, TileLayer, Marker, Popup, ZoomControl, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import './ZoneMap.css';
import { SquareParking, Ban, LocateFixed, MapPin, Users, Banknote, X, Info } from 'lucide-react';
import { formatCurrency } from '../utils/format';
import { getZoneAvailability } from '../utils/zones';

// HU-25: map view of the active zones. Base map: OpenStreetMap standard
// tiles (free, no API key, attribution required).
const TILE_URL = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION =
    '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

// Used only until the zones are fitted on screen (Dosquebradas / Pereira).
const DEFAULT_CENTER = [4.83, -75.67];
const DEFAULT_ZOOM = 13;
const SINGLE_ZONE_ZOOM = 16;

// AC-08: if this many tiles fail before any tile loads, the map is unusable.
const MAX_TILE_ERRORS = 3;

const PIN_CLASSES = {
    available: 'bg-parkea-600',
    almost: 'bg-warning',
    full: 'bg-danger',
};

const BADGE_CLASSES = {
    available: 'bg-parkea-50 text-parkea-600',
    almost: 'bg-warning-soft text-warning',
    full: 'bg-danger-soft text-danger',
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

// AC-04/AC-05: summary shown when a marker is opened.
function ZoneSummary({ zone, availability, onReserve }) {
    const map = useMap();
    const reserveRef = useRef(null);
    const full = availability.state === 'full';

    // AC-10: the summary is rendered only once it opens, so focus is moved
    // here (not in Leaflet's popupopen event, which fires before it exists).
    useEffect(() => {
        reserveRef.current?.focus({ preventScroll: true });
    }, []);

    // Leaflet only handles Escape when the map itself has focus, not when
    // focus is inside the summary.
    const handleKeyDown = (e) => {
        if (e.key === 'Escape') map.closePopup();
    };

    return (
        <div className="p-4 text-neutral-900" onKeyDown={handleKeyDown}>
            <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-parkea-50 text-parkea-600">
                    <SquareParking className="h-5 w-5" aria-hidden="true" />
                </span>
                <h2 className="min-w-0 flex-1 break-words pt-1.5 text-subtitle font-display uppercase text-neutral-900">
                    {zone.name}
                </h2>
                <button
                    type="button"
                    onClick={() => map.closePopup()}
                    aria-label="Cerrar"
                    className="rounded-md p-1 text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900"
                >
                    <X className="h-4 w-4" aria-hidden="true" />
                </button>
            </div>

            {zone.address && (
                <p className="mt-2 flex items-start gap-2 text-body text-neutral-600">
                    <MapPin className="mt-1 h-4 w-4 shrink-0" aria-hidden="true" />
                    <span className="min-w-0 break-words">{zone.address}</span>
                </p>
            )}

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
                <span className="flex items-center gap-2 text-body text-neutral-900">
                    <Users className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden="true" />
                    <span>
                        <span className="font-mono tabular-nums">{zone.availableSlots}</span> de{' '}
                        <span className="font-mono tabular-nums">{zone.totalSlots}</span> cupos disponibles
                    </span>
                </span>
                <span className={`shrink-0 rounded-full px-2.5 py-1 text-caption font-medium ${BADGE_CLASSES[availability.state]}`}>
                    {availability.text}
                </span>
            </div>

            <div className="mt-3 flex items-center justify-between gap-3 border-t border-neutral-200 pt-3">
                <span className="flex items-center gap-2 text-body text-neutral-900">
                    <Banknote className="h-4 w-4 shrink-0 text-neutral-600" aria-hidden="true" />
                    Tarifa por hora
                </span>
                <span className="whitespace-nowrap font-mono text-body font-medium text-neutral-900">
                    {formatCurrency(zone.hourlyRate)}
                </span>
            </div>

            <button
                ref={reserveRef}
                type="button"
                data-reserve
                onClick={() => onReserve(zone)}
                aria-disabled={full || undefined}
                aria-describedby={full ? `full-${zone.id}` : undefined}
                className={`mt-4 w-full rounded-md px-4 py-2.5 text-label font-medium transition-colors ${full
                    ? 'cursor-not-allowed bg-neutral-200 text-neutral-700'
                    : 'bg-parkea-600 text-white hover:bg-parkea-700'
                    }`}
            >
                {full ? 'Sin cupos disponibles' : 'Reservar'}
            </button>
            {full && (
                <p id={`full-${zone.id}`} className="mt-2 text-center text-caption text-neutral-600">
                    Esta zona no tiene cupos en este momento, así que no se puede reservar.
                </p>
            )}
        </div>
    );
}

function ZoneMarker({ zone, position, onReserve }) {
    const availability = getZoneAvailability(zone.availableSlots, zone.totalSlots);
    // Rebuilt only when what the pin shows changes, so a background refresh of
    // the same data doesn't recreate the marker icon.
    const { name, availableSlots, totalSlots } = zone;
    const icon = useMemo(
        () => buildIcon(name, availableSlots, totalSlots),
        [name, availableSlots, totalSlots],
    );

    // AC-10: when the summary closes, focus goes back to the pin.
    const eventHandlers = useMemo(
        () => ({
            popupclose: (e) => {
                e.target.getElement()?.focus({ preventScroll: true });
            },
        }),
        [],
    );

    return (
        <Marker position={position} icon={icon} eventHandlers={eventHandlers}>
            <Popup className="zone-popup" closeButton={false} autoPanPadding={[16, 16]}>
                <ZoneSummary zone={zone} availability={availability} onReserve={onReserve} />
            </Popup>
        </Marker>
    );
}

// Reports the map as failed when tiles keep erroring and none has loaded.
function useTileFailure(onLoadError) {
    const loaded = useRef(false);
    const errors = useRef(0);
    const reported = useRef(false);

    return useMemo(
        () => ({
            tileload: () => {
                loaded.current = true;
            },
            tileerror: () => {
                errors.current += 1;
                if (!loaded.current && !reported.current && errors.current >= MAX_TILE_ERRORS) {
                    reported.current = true;
                    onLoadError?.();
                }
            },
        }),
        [onLoadError],
    );
}

export default function ZoneMap({ zones, onReserve, onLoadError, onShowList }) {
    const [map, setMap] = useState(null);

    const placed = useMemo(
        () => zones.map((zone) => ({ zone, position: getPosition(zone) })).filter((z) => z.position),
        [zones],
    );
    const missing = zones.length - placed.length;
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

    const tileHandlers = useTileFailure(onLoadError);

    return (
        <div>
            {missing > 0 && (
                <p className="mb-3 flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md bg-info-soft px-3 py-2 text-caption text-info">
                    <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
                    {missing === 1
                        ? '1 zona no tiene ubicación registrada.'
                        : `${missing} zonas no tienen ubicación registrada.`}
                    <button type="button" onClick={onShowList} className="font-medium underline underline-offset-2">
                        Verlas en la lista
                    </button>
                </p>
            )}

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
                        maxZoom={19}
                        eventHandlers={tileHandlers}
                    />
                    <ZoomControl position="bottomleft" zoomInTitle="Acercar" zoomOutTitle="Alejar" />
                    {placed.map(({ zone, position }) => (
                        <ZoneMarker key={zone.id} zone={zone} position={position} onReserve={onReserve} />
                    ))}
                </MapContainer>

                {placed.length > 0 && (
                    <button
                        type="button"
                        onClick={fitAll}
                        aria-label="Ver todas las zonas"
                        title="Ver todas las zonas"
                        className="absolute bottom-3 left-[10px] z-[1000] flex h-[34px] w-[34px] items-center justify-center rounded-md border-2 border-black/20 bg-white bg-clip-padding text-neutral-900 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-parkea-600"
                    >
                        <LocateFixed className="h-4 w-4" aria-hidden="true" />
                    </button>
                )}

                {/* Legend: states are named in text, not by color alone */}
                <div className="absolute bottom-6 right-2 z-[1000] rounded-md border border-neutral-200 bg-white/95 px-3 py-2 shadow-sm">
                    <p className="text-caption font-medium text-neutral-900">Convenciones</p>
                    <ul className="mt-1 space-y-1 text-caption text-neutral-700">
                        <li className="flex items-center gap-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-parkea-600" aria-hidden="true">
                                <SquareParking className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                            </span>
                            Disponible
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-warning" aria-hidden="true">
                                <SquareParking className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                            </span>
                            Casi llena
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-danger" aria-hidden="true">
                                <Ban className="h-2.5 w-2.5 text-white" aria-hidden="true" />
                            </span>
                            Llena (sin cupos)
                        </li>
                    </ul>
                </div>
            </div>
        </div>
    );
}