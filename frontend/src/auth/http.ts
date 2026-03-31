import type { AxiosInstance, InternalAxiosRequestConfig } from 'axios';
import { AxiosHeaders } from 'axios';
import { refreshSession } from '../api/auth';
import { PUBLIC_API_TOKEN } from '../config';
import { clearAuthToken, getAuthToken, setAuthToken } from './session';

type RetryableRequestConfig = InternalAxiosRequestConfig & { _retry?: boolean };

const isAuthEndpoint = (url?: string) => {
    const target = url || '';
    return (
        target.includes('/auth/token') ||
        target.includes('/auth/refresh') ||
        target.includes('/auth/logout') ||
        target.includes('/auth/users/setup')
    );
};

let refreshPromise: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
    if (!refreshPromise) {
        refreshPromise = refreshSession()
            .then((data) => {
                const token = data.access_token || null;
                setAuthToken(token);
                return token;
            })
            .catch((error) => {
                clearAuthToken();
                throw error;
            })
            .finally(() => {
                refreshPromise = null;
            });
    }

    return refreshPromise;
}

export function applyAuthRequest(config: InternalAxiosRequestConfig): InternalAxiosRequestConfig {
    config.withCredentials = true;

    const headers = AxiosHeaders.from(config.headers);
    if (!headers.has('Authorization')) {
        const token = getAuthToken();
        if (token) {
            headers.set('Authorization', `Bearer ${token}`);
        } else if (!headers.has('X-Client-Token') && PUBLIC_API_TOKEN) {
            headers.set('X-Client-Token', PUBLIC_API_TOKEN);
        }
    }

    config.headers = headers;
    return config;
}

export function installAuthInterceptors(instance: AxiosInstance): AxiosInstance {
    instance.defaults.withCredentials = true;
    instance.interceptors.request.use(applyAuthRequest);
    instance.interceptors.response.use(
        (response) => response,
        async (error) => {
            const status = error?.response?.status;
            const originalRequest = error?.config as RetryableRequestConfig | undefined;

            if (status === 401 && originalRequest && !originalRequest._retry && !isAuthEndpoint(originalRequest.url)) {
                originalRequest._retry = true;
                const isKioskRoute = window.location.pathname.startsWith('/kiosk');
                if (isKioskRoute) {
                    const headers = AxiosHeaders.from(originalRequest.headers);
                    if (!headers.has('X-Client-Token') && PUBLIC_API_TOKEN) {
                        headers.set('X-Client-Token', PUBLIC_API_TOKEN);
                    }
                    originalRequest.headers = headers;
                    return instance(originalRequest);
                }
                try {
                    const token = await refreshAccessToken();
                    originalRequest.withCredentials = true;
                    const headers = AxiosHeaders.from(originalRequest.headers);
                    if (token) {
                        headers.set('Authorization', `Bearer ${token}`);
                    } else {
                        headers.delete('Authorization');
                    }
                    if (!token && PUBLIC_API_TOKEN && !headers.has('X-Client-Token')) {
                        headers.set('X-Client-Token', PUBLIC_API_TOKEN);
                    }
                    originalRequest.headers = headers;
                    return instance(originalRequest);
                } catch {
                    clearAuthToken();
                    const isKioskRoute = window.location.pathname.startsWith('/kiosk');
                    if (!isKioskRoute && !window.location.pathname.includes('/login')) {
                        window.location.href = '/login';
                    }
                }
            }

            return Promise.reject(error);
        },
    );

    return instance;
}
