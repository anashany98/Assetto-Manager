import { PUBLIC_API_TOKEN } from '../config';
import { getAuthToken } from '../auth/session';

export function getAuthHeaders(): Record<string, string> {
    const token = getAuthToken();
    if (token) return { Authorization: `Bearer ${token}` };
    if (PUBLIC_API_TOKEN) return { 'X-Client-Token': PUBLIC_API_TOKEN };
    return {};
}
