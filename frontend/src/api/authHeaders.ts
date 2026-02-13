import { PUBLIC_API_TOKEN } from '../config';

export function getAuthHeaders(): Record<string, string> {
    const token = localStorage.getItem('token');
    if (token) return { Authorization: `Bearer ${token}` };
    if (PUBLIC_API_TOKEN) return { 'X-Client-Token': PUBLIC_API_TOKEN };
    return {};
}

