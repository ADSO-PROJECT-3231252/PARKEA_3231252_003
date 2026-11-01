// The session is saved in the browser as two items: the token and the user.
// Either of them can be broken: text that is not JSON, a value of the wrong
// shape, or only one of the two items. A broken session must never crash the
// app, so it is thrown away and the person continues as a visitor.

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

function isPlainObject(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

// The Header, ProtectedRoute and the pages read these fields as text.
function isUsableUser(value) {
    if (!isPlainObject(value)) return false;
    if (typeof value.role !== 'string' || value.role === '') return false;
    const { fullName } = value;
    return fullName === undefined || fullName === null || typeof fullName === 'string';
}

export function clearSavedSession() {
    try {
        localStorage.removeItem(TOKEN_KEY);
        localStorage.removeItem(USER_KEY);
    } catch {
        // The browser blocks its storage: there is nothing to clear.
    }
}

// Returns { ...user, token } when a good session is saved, and null when there
// is none or it is broken (a broken one is also cleared).
export function readSavedSession() {
    let token;
    let storedUser;
    try {
        token = localStorage.getItem(TOKEN_KEY);
        storedUser = localStorage.getItem(USER_KEY);
    } catch {
        return null;
    }

    // Nothing saved: this is a visitor, not a broken session.
    if (token === null && storedUser === null) return null;

    let user = null;
    if (token && storedUser) {
        try {
            user = JSON.parse(storedUser);
        } catch {
            user = null;
        }
    }

    if (!isUsableUser(user)) {
        clearSavedSession();
        return null;
    }
    return { ...user, token };
}
