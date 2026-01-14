
import React, { createContext, useContext, useState, useEffect } from "react";
import { login as apiLogin, getMe, type User, setupAdmin as apiSetupAdmin } from "../api/auth";

interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    setupAdmin: (username: string, password: string) => Promise<void>;
    isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [user, setUser] = useState<User | null>(null);
    const [token, setToken] = useState<string | null>(localStorage.getItem("token"));
    const [isLoading, setIsLoading] = useState(true);

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

    const logout = () => {
        localStorage.removeItem("token");
        setToken(null);
        setUser(null);
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

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
