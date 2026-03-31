
import { API_URL as API_BASE_URL } from "../config";

const AUTH_BASE_URL = `${API_BASE_URL}/auth`;

export interface User {
    username: string;
    role: string;
    permissions?: string[];
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
    refresh_token?: string;
    expires_in?: number;
}

export const login = async (username: string, password: string): Promise<AuthResponse> => {
    const formData = new FormData();
    formData.append("password", password);
    formData.append("username", username);

    const response = await fetch(`${AUTH_BASE_URL}/token`, {
        method: "POST",
        body: formData,
        credentials: "include",  // Accept httpOnly cookies
    });

    if (!response.ok) {
        throw new Error("Invalid credentials");
    }

    return response.json();
};

export const logout = async (): Promise<void> => {
    try {
        await fetch(`${AUTH_BASE_URL}/logout`, {
            method: "POST",
            credentials: "include",  // Send cookies so backend can blacklist
        });
    } catch {
        // Logout should succeed even if backend is unreachable
    }
};

export const refreshSession = async (refreshToken?: string): Promise<AuthResponse> => {
    const response = await fetch(`${AUTH_BASE_URL}/refresh`, {
        method: "POST",
        headers: refreshToken
            ? { "Content-Type": "application/json" }
            : undefined,
        body: refreshToken
            ? JSON.stringify({ refresh_token: refreshToken })
            : undefined,
        credentials: "include",
    });

    if (!response.ok) {
        const error = new Error("Failed to refresh session") as Error & { status?: number };
        error.status = response.status;
        throw error;
    }

    return response.json();
};

export const getMe = async (token?: string): Promise<User> => {
    const response = await fetch(`${AUTH_BASE_URL}/users/me`, {
        headers: token
            ? {
                Authorization: `Bearer ${token}`,
            }
            : undefined,
        credentials: "include",  // Also send cookies
    });

    if (!response.ok) {
        const error = new Error("Failed to fetch user") as Error & { status?: number };
        error.status = response.status;
        throw error;
    }

    return response.json();
};

export const setupAdmin = async (username: string, password: string): Promise<{ username: string; role: string }> => {
    const setupToken = import.meta.env.VITE_SETUP_TOKEN as string | undefined;
    const headers: Record<string, string> = {
        "Content-Type": "application/json"
    };
    if (setupToken) {
        headers["X-Setup-Token"] = setupToken;
    }
    const response = await fetch(`${AUTH_BASE_URL}/users/setup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password }),
        credentials: "include",
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Setup failed");
    }

    return response.json();
};
