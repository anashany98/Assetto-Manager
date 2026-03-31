const STORAGE_KEY = 'ac_manager_token';

let authToken: string | null = null;

export function getAuthToken(): string | null {
    if (authToken) return authToken;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
        authToken = stored;
    }
    return authToken;
}

export function setAuthToken(token: string | null): void {
    authToken = token;
    if (token) {
        localStorage.setItem(STORAGE_KEY, token);
    } else {
        localStorage.removeItem(STORAGE_KEY);
    }
}

export function clearAuthToken(): void {
    authToken = null;
    localStorage.removeItem(STORAGE_KEY);
}