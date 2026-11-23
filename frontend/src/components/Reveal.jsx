import { useEffect, useRef, useState } from 'react';

// #330: a card of the home appears the first time it scrolls into view. Each
// card watches itself, so on a phone the cards below the first one appear when
// the person scrolls to them, and in a row they appear one after the other.

// The steps of index.css. A fourth card or more takes the last one.
const STEPS = ['motion-safe:animate-fade-up', 'motion-safe:animate-fade-up-2', 'motion-safe:animate-fade-up-3'];

export default function Reveal({ step = 0, className, children }) {
    const ref = useRef(null);
    // Without IntersectionObserver nothing can tell when the card is in view,
    // so it is shown at once, without moving: no content can stay hidden
    const watches = typeof IntersectionObserver !== 'undefined';
    const [shown, setShown] = useState(false);

    useEffect(() => {
        if (!watches || shown) return undefined;
        // Once shown, the effect ends and stops watching the card. It waits
        // until a part of the card is in view, not just its first pixel.
        const observer = new IntersectionObserver(
            (entries) => {
                if (entries.some((entry) => entry.isIntersecting)) setShown(true);
            },
            { threshold: 0.15 },
        );
        observer.observe(ref.current);
        return () => observer.disconnect();
    }, [watches, shown]);

    // Until then the card is transparent (but printed). motion-safe: shows it
    // at once, without moving, to a person who asked the system to reduce motion.
    let motion = null;
    if (watches) motion = shown ? STEPS[Math.min(step, STEPS.length - 1)] : 'motion-safe:opacity-0 print:opacity-100';
    const classes = [className, motion].filter(Boolean).join(' ');
    return (
        <div ref={ref} className={classes || undefined}>
            {children}
        </div>
    );
}
