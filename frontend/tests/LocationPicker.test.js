import { render } from '@testing-library/react';
import L from 'leaflet';
import { useMap } from 'react-leaflet';
import LocationPicker from '../src/components/LocationPicker';

jest.mock('react-leaflet', () => ({
    MapContainer: ({ children }) => children,
    TileLayer: () => null,
    ZoomControl: () => null,
    useMap: jest.fn(),
    useMapEvents: jest.fn(),
}));

function openMap(width) {
    const map = L.map(document.createElement('div'), { center: [4.83, -75.67], zoom: 13 });
    // jsdom has no layout. Leaflet still calculates the zoom from these dimensions.
    const size = jest.spyOn(map, 'getSize').mockReturnValue(L.point(width, 280));
    useMap.mockReturnValue(map);
    const view = render(<LocationPicker position={null} onPick={jest.fn()} focusKey={0} />);
    return { map, size, unmount: view.unmount };
}

test('shrinking the zone map gives the same minimum zoom as opening it at that width', () => {
    const small = openMap(320);
    const expected = small.map.getMinZoom();
    small.unmount();
    small.map.remove();

    const wide = openMap(640);
    try {
        expect(wide.map.getMinZoom()).toBeGreaterThan(expected);
        wide.size.mockReturnValue(L.point(320, 280));
        wide.map.fire('resize');
        expect(wide.map.getMinZoom()).toBe(expected);
    } finally {
        wide.unmount();
        wide.map.remove();
    }
});
