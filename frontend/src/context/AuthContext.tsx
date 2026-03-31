
import React, { useState, useEffect } from "react";
import { login as apiLogin, logout as apiLogout, getMe, refreshSession, type User, setupAdmin as apiSetupAdmin } from "../api/auth";
import { clearAuthToken, getAuthToken, setAuthToken } from "../auth/session";

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
    if (!jwt) return null;
    const parts = jwt.split(".");
    if (parts.length < 2) return null;
    const [, payload] = parts;
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
    const [token, setToken] = useState<string | null>(getAuthToken());
    const [isLoading, setIsLoading] = useState(true);

    const syncToken = (nextToken: string | null) => {
        setAuthToken(nextToken);
        setToken(nextToken);
    };

    const clearSession = () => {
        clearAuthToken();
        setToken(null);
        setUser(null);
    };

    const logout = async () => {
        try { await apiLogout(); } catch { /* ignore */ }
        clearSession();
    };

    useEffect(() => {
        const isKioskRoute = typeof window !== 'undefined' && window.location.pathname.startsWith('/kiosk');
        if (isKioskRoute) {
            setIsLoading(false);
            return;
        }

        const initAuth = async () => {
            const storedToken = getAuthToken();
            if (!storedToken) {
                setIsLoading(false);
                return;
            }
            try {
                const userData = await getMe();
                setUser(userData);

                try {
                    const refreshed = await refreshSession();
                    syncToken(refreshed.access_token || null);
                } catch (refreshError) {
                    if (isAuthError(refreshError)) {
                        syncToken(null);
                    }
                }
            } catch (error) {
                if (isAuthError(error)) {
                    try {
                        const refreshed = await refreshSession();
                        syncToken(refreshed.access_token || null);
                        const userData = await getMe(refreshed.access_token);
                        setUser(userData);
                    } catch (refreshError) {
                        if (isAuthError(refreshError)) {
                            clearSession();
                        } else {
                            const fallbackUser = parseUserFromToken(getAuthToken() || "");
                            if (fallbackUser) {
                                setUser(fallbackUser);
                            } else {
                                clearSession();
                            }
                        }
                    }
                } else {
                    const fallbackUser = parseUserFromToken(getAuthToken() || "");
                    if (fallbackUser) {
                        setUser(fallbackUser);
                    }
                }
            }
            setIsLoading(false);
        };

        void initAuth();
    }, []);

    const login = async (username: string, password: string) => {
        const data = await apiLogin(username, password);
        syncToken(data.access_token);

        const userData = await getMe(data.access_token);
        setUser(userData);
    };

    const setupAdmin = async (username: string, password: string) => {
        await apiSetupAdmin(username, password);
        // Auto login after setup?
        await login(username, password);
    }

    return (
        <AuthContext.Provider value={{ user, token, login, logout, isLoading, setupAdmin, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};
