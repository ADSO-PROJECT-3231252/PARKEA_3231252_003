import { useEffect } from 'react';

// #311: while a dialog is open, the page behind it must not scroll. A counter
// (and not a boolean) keeps the lock while another dialog is still open, and
// gives back the overflow the page had before the first one opened.
let openDialogs = 0;
let overflowBeforeLock = '';

export function useBodyScrollLock(locked) {
    useEffect(() => {
        if (!locked) return undefined;

        if (openDialogs === 0) {
            overflowBeforeLock = document.body.style.overflow;
            document.body.style.overflow = 'hidden';
        }
        openDialogs += 1;

        return () => {
            openDialogs -= 1;
            if (openDialogs === 0) document.body.style.overflow = overflowBeforeLock;
        };
    }, [locked]);
}
