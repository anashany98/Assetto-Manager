import axios from 'axios';
import { API_URL } from '../config';

export interface Session {
    id: number;
    station_id: number;
    station_name: string;
    driver_name?: string;
    start_time: string;
    end_time?: string;
    duration_minutes: number;
    remaining_minutes: number;
    status: 'active' | 'paused' | 'completed' | 'expired';
    price: number;
    is_vr?: boolean;
    payment_method?: string;
    is_paid?: boolean;
    notes?: string;
}

export type SessionCreate = {
    station_id: number;
    driver_name?: string;
    duration_minutes: number;
    price?: number;
    payment_method?: 'cash' | 'card_nayax' | 'online' | 'stripe_qr' | 'bizum';
    is_vr?: boolean;
    notes?: string;
}

export const getActiveSessions = async (): Promise<Session[]> => {
    const response = await axios.get(`${API_URL}/sessions/active`);
    return response.data;
};

export const startSession = async (data: SessionCreate): Promise<Session> => {
    const response = await axios.post(`${API_URL}/sessions/start`, data);
    return response.data;
};

export const stopSession = async (sessionId: number) => {
    const response = await axios.post(`${API_URL}/sessions/${sessionId}/stop`);
    return response.data;
};

export const addTime = async (sessionId: number, minutes: number) => {
    const response = await axios.post(`${API_URL}/sessions/${sessionId}/add-time`, { minutes });
    return response.data;
};
