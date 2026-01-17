
import React, { useState, useEffect } from "react";
import { login as apiLogin, getMe, type User, setupAdmin as apiSetupAdmin } from "../api/auth";

import { AuthContext } from "./AuthContextDefinition";

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
                    console.error("Auth init failed", error);
                    logout();
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
        <AuthContext.Provider value={{ user, token, login, logout, isLoading, setupAdmin, isAuthenticated: !!user }}>
            {children}
        </AuthContext.Provider>
    );
};

// Re-export deprecated
// export { useAuth } from './useAuth';
