const normalizeBase = (value?: string) => (value ? value.replace(/\/+$/, '') : '');

const envApiUrl = normalizeBase(import.meta.env.VITE_API_URL);

const inferApiUrl = () => {
    if (envApiUrl) return envApiUrl;
    if (typeof window === 'undefined') return '';
    if (import.meta.env.PROD) return window.location.origin;

    // Fallback to 127.0.0.1 for localhost to avoid IPv6 resolution issues on Windows
    const hostname = window.location.hostname === 'localhost' ? '127.0.0.1' : window.location.hostname;
    return `${window.location.protocol}//${hostname}:8000`;
};

export const API_URL = inferApiUrl();

export const WS_BASE_URL = (() => {
    if (typeof window === 'undefined') return '';
    const base = API_URL || window.location.origin;
    const url = new URL(base, window.location.origin);
    const wsProtocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${wsProtocol}//${url.host}`;
})();

export const PUBLIC_WS_TOKEN = import.meta.env.VITE_PUBLIC_WS_TOKEN || '';
export const PUBLIC_API_TOKEN = import.meta.env.VITE_PUBLIC_API_TOKEN || PUBLIC_WS_TOKEN;
export const USE_WS_QUERY_TOKEN = (import.meta.env.VITE_USE_WS_QUERY_TOKEN || '').toLowerCase() === 'true';
