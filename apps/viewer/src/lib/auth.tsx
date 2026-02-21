import React, { createContext, useContext, useEffect, useState } from 'react';
import { BASE_URL } from './api';

export interface AuthUser {
    id: string;
    email: string;
    role: string;
    client_id: string | null;
    site_id?: string | null;
    name?: string | null;
}

export interface AuthClient {
    id: string;
    name: string;
}

interface AuthContextType {
    user: AuthUser | null;
    client: AuthClient | null;
    loading: boolean;
    selectedClientId: string | null;
    selectedClientName: string | null;
    setSelectedClientId: (id: string | null, name?: string | null) => void;
    login: (token: string) => void;
    logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
    user: null,
    client: null,
    loading: true,
    selectedClientId: null,
    selectedClientName: null,
    setSelectedClientId: () => { },
    login: () => { },
    logout: () => { }
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
    const [user, setUser] = useState<AuthUser | null>(null);
    const [client, setClient] = useState<AuthClient | null>(null);
    const [loading, setLoading] = useState(true);
    const [selectedClientId, _setSelectedClientId] = useState<string | null>(() => {
        return localStorage.getItem('sense_selected_client_id');
    });
    const [selectedClientName, _setSelectedClientName] = useState<string | null>(() => {
        return localStorage.getItem('sense_selected_client_name');
    });

    const setSelectedClientId = (id: string | null, name?: string | null) => {
        if (id) {
            localStorage.setItem('sense_selected_client_id', id);
            if (name) localStorage.setItem('sense_selected_client_name', name);
        } else {
            localStorage.removeItem('sense_selected_client_id');
            localStorage.removeItem('sense_selected_client_name');
        }
        _setSelectedClientId(id);
        _setSelectedClientName(name || null);
    };

    const checkAuth = async () => {
        const token = localStorage.getItem('sense_auth_token');
        if (!token) {
            setLoading(false);
            return;
        }

        try {
            const res = await fetch(`${BASE_URL}/auth/me`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });

            if (res.ok) {
                const data = await res.json();
                setUser(data.user);
                setClient(data.client);
            } else {
                localStorage.removeItem('sense_auth_token');
            }
        } catch (e) {
            console.error('Failed to verify auth session', e);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        checkAuth();
    }, []);

    const login = (token: string) => {
        localStorage.setItem('sense_auth_token', token);
        setLoading(true);
        checkAuth();
    };

    const logout = () => {
        localStorage.removeItem('sense_auth_token');
        localStorage.removeItem('sense_selected_client_id');
        localStorage.removeItem('sense_selected_client_name');
        setUser(null);
        setClient(null);
        _setSelectedClientId(null);
        _setSelectedClientName(null);
        window.location.href = '/login';
    };

    return (
        <AuthContext.Provider value={{ user, client, loading, selectedClientId, selectedClientName, setSelectedClientId, login, logout }}>
            {children}
        </AuthContext.Provider>
    );
}
