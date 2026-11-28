import { useEffect, useRef } from 'react';

// #390: after a failed save, the focus goes to the message of the server
// ('server') or to the field with that id, once it is on screen. That also
// brings it into view on a phone, where the button is far below the message.
// The form sets pendingFocusRef.current before the render that shows the error.
export default function usePendingFocus(serverErrorRef) {
    const pendingFocusRef = useRef(null);
    useEffect(() => {
        if (!pendingFocusRef.current) return;
        const target = pendingFocusRef.current === 'server'
            ? serverErrorRef.current
            : document.getElementById(pendingFocusRef.current);
        pendingFocusRef.current = null;
        target?.focus();
    });
    return pendingFocusRef;
}
