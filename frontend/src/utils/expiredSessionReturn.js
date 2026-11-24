// #307: the screen where a session expired, to go back to it after signing in
// again. It is kept in this tab only (sessionStorage), with the account it
// belongs to: another account that signs in on this tab starts on its own home.
const STORAGE_KEY = 'expiredSessionReturnTo';

export function saveExpiredSessionReturn(userId) {
    const { pathname, search, hash } = window.location;

    try {
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ path: pathname + search + hash, userId }));
    } catch {
        // The login page is still available if the browser blocks storage.
    }
}

export function takeExpiredSessionReturn(userId) {
    try {
        const raw = sessionStorage.getItem(STORAGE_KEY);
        sessionStorage.removeItem(STORAGE_KEY);
        const saved = JSON.parse(raw);

        const path = saved?.path;
        if (!userId || saved?.userId !== userId) return null;
        if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) return null;

        const url = new URL(path, window.location.origin);
        if (url.origin !== window.location.origin) return null;

        return url.pathname + url.search + url.hash;
    } catch {
        return null;
    }
}
