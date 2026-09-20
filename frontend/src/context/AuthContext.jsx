import { useState, useEffect } from 'react';
import { AuthContext } from './authContextValue';

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const token = localStorage.getItem('token');
        const storedUser = localStorage.getItem('user');
        if (token && storedUser) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setUser({ token, ...JSON.parse(storedUser) });
        }
        setLoading(false);
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

    const logoutUser = () => {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
        setUser(null);
    };

    return (
        <AuthContext.Provider value={{ user, loginUser, updateUser, logoutUser, loading }}>
            {children}
        </AuthContext.Provider>
    );
}