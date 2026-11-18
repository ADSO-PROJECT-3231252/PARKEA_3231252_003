import { useLayoutEffect, useRef, useState } from 'react';
import { fitZoneName, shortZoneName } from '../utils/zoneChart';

// #309: one zone name of the axis of "Reservas por zona", always on one line
// and inside the axis. Recharts gives the place of the name (x, y) and the
// complete name (payload.value). A cut name keeps the complete one in its
// title, which the browser shows on hover.
export default function ZoneAxisTick({ x, y, textAnchor, fill, className, payload }) {
    const name = String(payload?.value ?? '');
    const textRef = useRef(null);
    // The cut measured for this name; until it is measured, the 16 letters
    const [fitted, setFitted] = useState(null);
    const label = fitted?.name === name ? fitted.label : shortZoneName(name);

    useLayoutEffect(() => {
        const text = textRef.current;
        // jsdom (the tests) does not draw, so it cannot measure
        if (typeof text?.getComputedTextLength !== 'function') return undefined;

        const fit = () => {
            // A hidden copy of the name measures each cut with the same font
            const probe = text.cloneNode(false);
            probe.setAttribute('visibility', 'hidden');
            text.parentNode.appendChild(probe);
            const measure = (candidate) => {
                probe.textContent = candidate;
                return probe.getComputedTextLength();
            };
            setFitted({ name, label: fitZoneName(name, measure) });
            probe.remove();
        };

        fit();
        // The font of the page can arrive after the chart is drawn: then the
        // name is measured again
        const fonts = document.fonts;
        fonts?.addEventListener('loadingdone', fit);
        return () => fonts?.removeEventListener('loadingdone', fit);
    }, [name]);

    return (
        <g>
            {label !== name && <title>{name}</title>}
            <text
                ref={textRef}
                x={x}
                y={y}
                dy="0.355em"
                textAnchor={textAnchor}
                fontSize={12}
                fill={fill}
                className={className}
            >
                {label}
            </text>
        </g>
    );
}
