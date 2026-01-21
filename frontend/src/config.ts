const normalizeBase = (value?: string) => (value ? value.replace(/\/+$/, '') : '');

const envApiUrl = normalizeBase(import.meta.env.VITE_API_URL);

const inferApiUrl = () => {
    if (envApiUrl) return envApiUrl;
    if (typeof window === 'undefined') return '';
    if (import.meta.env.PROD) return window.location.origin;
    return `${window.location.protocol}//${window.location.hostname}:8000`;
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
