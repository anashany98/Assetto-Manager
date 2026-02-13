
import React, { useState, useEffect } from "react";
import { login as apiLogin, getMe, type User, setupAdmin as apiSetupAdmin } from "../api/auth";

import { AuthContext } from "./AuthContextDefinition";

const decodeBase64Url = (value: string): string | null => {
    try {
        const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
        return atob(padded);
    } catch {
        return null;
    }
};

const parseUserFromToken = (jwt: string): User | null => {
    const [, payload] = jwt.split(".");
    if (!payload) return null;
    const decoded = decodeBase64Url(payload);
    if (!decoded) return null;
    try {
        const parsed = JSON.parse(decoded) as { sub?: string; role?: string };
        if (!parsed.sub || !parsed.role) return null;
        return { username: parsed.sub, role: parsed.role, permissions: [] };
    } catch {
        return null;
    }
};

const isAuthError = (error: unknown): boolean => {
    if (!(error instanceof Error)) return false;
    const status = (error as Error & { status?: number }).status;
    return status === 401 || status === 403;
};

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
    const [isLoading, setIsLoading] = useState(true);

    const logout = () => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
    };

    useEffect(() => {
        const initAuth = async () => {
            const storedToken = localStorage.getItem("token");
            if (storedToken) {
                try {
                    const userData = await getMe(storedToken);
                    setUser(userData);
                    setToken(storedToken);
                } catch (error) {
                    if (isAuthError(error)) {
                        logout();
                    } else {
                        // Preserve local session during transient API outages.
                        setToken(storedToken);
                        const fallbackUser = parseUserFromToken(storedToken);
                        if (fallbackUser) {
                            setUser(fallbackUser);
                        }
                    }
                }
            }
            setIsLoading(false);
        };

        initAuth();
    }, []);

    const login = async (username: string, password: string) => {
        const data = await apiLogin(username, password);
        localStorage.setItem("token", data.access_token);
        setToken(data.access_token);

        // Fetch user immediately
        const userData = await getMe(data.access_token);
        setUser(userData);
    };

    const setupAdmin = async (username: string, password: string) => {
        await apiSetupAdmin(username, password);
        // Auto login after setup?
        await login(username, password);
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading, setupAdmin, isAuthenticated: !!token }}>
            {children}
        </AuthContext.Provider>
    );
};

// Re-export deprecated
// export { useAuth } from './useAuth';
