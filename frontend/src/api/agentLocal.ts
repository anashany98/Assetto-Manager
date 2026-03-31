import axios from 'axios';
import type { Car, Track } from './content';

const DEFAULT_LOCAL_PORT = 9090;

export interface LocalAgentHealth {
    status: string;
    agent_version: string;
    hostname: string;
    ip_address: string;
}

export interface LocalAgentContent {
    cars: Car[];
    tracks: Track[];
}

export interface LocalAgentLaunchPayload {
    car: string;
    track: string;
    driver_name?: string;
    duration_minutes?: number;
    difficulty?: string;
    transmission?: string;
    time_of_day?: string;
    weather?: string;
    session_type?: string;
    ai_count?: number;
    station_id?: number;
}

export interface LocalAgentStatus {
    ac_running: boolean;
    session_active: boolean;
    car: string;
    track: string;
    hostname: string;
    ip_address: string;
}

const buildLocalUrl = (ip: string, port?: number): string => {
    const effectivePort = port || DEFAULT_LOCAL_PORT;
    return `http://${ip}:${effectivePort}`;
};

const buildHeaders = (token?: string, kioskCode?: string): Record<string, string> => {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
    };
    if (token) {
        headers['X-Local-Token'] = token;
    } else if (kioskCode) {
        headers['X-Kiosk-Code'] = kioskCode.trim().toUpperCase();
    }
    return headers;
};

/**
 * Check if the local agent server is reachable.
 */
export const checkLocalHealth = async (
    ip: string,
    token?: string,
    port?: number,
    kioskCode?: string,
): Promise<LocalAgentHealth | null> => {
    try {
        const url = buildLocalUrl(ip, port);
        const res = await axios.get<LocalAgentHealth>(`${url}/health`, {
            headers: buildHeaders(token, kioskCode),
            timeout: 3000,
        });
        return res.data;
    } catch {
        return null;
    }
};

/**
 * Fetch cached content from the local agent.
 */
export const fetchLocalContent = async (
    ip: string,
    token?: string,
    port?: number,
    kioskCode?: string,
): Promise<LocalAgentContent | null> => {
    try {
        const url = buildLocalUrl(ip, port);
        const res = await axios.get<LocalAgentContent>(`${url}/content`, {
            headers: buildHeaders(token, kioskCode),
            timeout: 5000,
        });
        return res.data;
    } catch {
        return null;
    }
};

/**
 * Launch a session directly on the local agent (bypassing the central server).
 */
export const launchLocalSession = async (
    ip: string,
    token: string | undefined,
    payload: LocalAgentLaunchPayload,
    port?: number,
    kioskCode?: string,
): Promise<boolean> => {
    try {
        const url = buildLocalUrl(ip, port);
        const res = await axios.post(`${url}/launch`, payload, {
            headers: buildHeaders(token, kioskCode),
            timeout: 30000,
        });
        return res.status === 200;
    } catch {
        return false;
    }
};

/**
 * Stop the current session on the local agent.
 */
export const stopLocalSession = async (
    ip: string,
    token?: string,
    port?: number,
    kioskCode?: string,
): Promise<boolean> => {
    try {
        const url = buildLocalUrl(ip, port);
        const res = await axios.post(`${url}/stop`, {}, {
            headers: buildHeaders(token, kioskCode),
            timeout: 5000,
        });
        return res.status === 200;
    } catch {
        return false;
    }
};

/**
 * Get the current status of the local agent / simulator.
 */
export const getLocalStatus = async (
    ip: string,
    token?: string,
    port?: number,
    kioskCode?: string,
): Promise<LocalAgentStatus | null> => {
    try {
        const url = buildLocalUrl(ip, port);
        const res = await axios.get<LocalAgentStatus>(`${url}/status`, {
            headers: buildHeaders(token, kioskCode),
            timeout: 3000,
        });
        return res.data;
    } catch {
        return null;
    }
};
