import { useState, useEffect } from 'react';
import { AuthContext } from './authContextValue';
import { readSavedSession } from '../utils/session';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // A broken saved session is dropped here instead of crashing the app
        const savedSession = readSavedSession();
        if (savedSession) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setUser(savedSession);
        }
        setLoading(false);

        function handleStorage(event) {
            if (event.storageArea !== localStorage) return;
            if (event.key !== 'token' && event.key !== 'user' && event.key !== null) return;

            // Read the current values in case a new session has already started.
            if (!localStorage.getItem('token') || !localStorage.getItem('user')) {
                setUser(null);
            }
        }

        window.addEventListener('storage', handleStorage);
        return () => window.removeEventListener('storage', handleStorage);
    }, []);

    const loginUser = (token, userData) => {
        localStorage.setItem('token', token);
        localStorage.setItem('user', JSON.stringify(userData));
        setUser({ token, ...userData });
    };

    const updateUser = (updatedFields) => {
        setUser((prev) => {
            const newUser = { ...prev, ...updatedFields };
            localStorage.setItem('user', JSON.stringify({ ...newUser, token: undefined }));
            return newUser;
        });
    };

    // #199: after a password change the API answers with a new token, because
    // the old one stops working. The session goes on with the new one.
    const updateToken = (token) => {
        localStorage.setItem('token', token);
        setUser((prev) => (prev ? { ...prev, token } : prev));
    };

    const logoutUser = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loginUser, updateUser, updateToken, logoutUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
}
