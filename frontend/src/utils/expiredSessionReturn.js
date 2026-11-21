const STORAGE_KEY = 'expiredSessionReturnTo';

export function saveExpiredSessionReturn() {
    const { pathname, search, hash } = window.location;

    try {
        sessionStorage.setItem(STORAGE_KEY, pathname + search + hash);
    } catch {
        // The login page is still available if the browser blocks storage.
    }
}

export function takeExpiredSessionReturn() {
    try {
        const path = sessionStorage.getItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);

        if (!path || !path.startsWith('/') || path.startsWith('//')) return null;

        const url = new URL(path, window.location.origin);
        if (url.origin !== window.location.origin) return null;

        return url.pathname + url.search + url.hash;
    } catch {
        return null;
    }
}
