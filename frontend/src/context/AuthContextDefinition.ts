
import { createContext } from "react";
import type { User } from "../api/auth";

export interface AuthContextType {
    user: User | null;
    token: string | null;
    login: (username: string, password: string) => Promise<void>;
    logout: () => void;
    isLoading: boolean;
    setupAdmin: (username: string, password: string) => Promise<void>;
    isAuthenticated: boolean;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);
