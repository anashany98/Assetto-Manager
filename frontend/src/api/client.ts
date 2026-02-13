import axios, { AxiosHeaders } from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';

const client = axios.create({
    baseURL: API_URL,
});

client.interceptors.request.use((config) => {
    const token = localStorage.getItem('token');
    const headers = AxiosHeaders.from(config.headers);

    // Prefer user JWT for admin/private routes.
    if (token) {
        headers.set('Authorization', `Bearer ${token}`);
    } else if (PUBLIC_API_TOKEN) {
        // Public/kiosk routes rely on a client token in production.
        headers.set('X-Client-Token', PUBLIC_API_TOKEN);
    }

    config.headers = headers;

    return config;
});

export default client;
