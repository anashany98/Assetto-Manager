
import { API_URL as API_BASE_URL } from "../config";

export interface User {
    username: string;
    role: string;
}

export interface AuthResponse {
    access_token: string;
    token_type: string;
}

export const login = async (username: string, password: string): Promise<AuthResponse> => {
    const formData = new FormData();
    formData.append("username", username);
    formData.append("password", password);

    const response = await fetch(`${API_BASE_URL}/token`, {
        method: "POST",
        body: formData,
    });

    if (!response.ok) {
        throw new Error("Invalid credentials");
    }

    return response.json();
};

export const getMe = async (token: string): Promise<User> => {
    const response = await fetch(`${API_BASE_URL}/users/me`, {
        headers: {
            Authorization: `Bearer ${token}`,
        },
    });

    if (!response.ok) {
        throw new Error("Failed to fetch user");
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
    const response = await fetch(`${API_BASE_URL}/users/setup`, {
        method: "POST",
        headers,
        body: JSON.stringify({ username, password }),
    });

    if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Setup failed");
    }

    return response.json();
};
