import axios from 'axios';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/championships`;

export interface Championship {
    id: number;
    name: string;
    description?: string;
    start_date: string;
    end_date?: string;
    is_active: boolean;
    events?: any[];
}

export interface ChampionshipStanding {
    driver_name: string;
    total_points: number;
    events_participated: number;
    wins: number;
    podiums: number;
    best_lap_ever?: number;
}

export const getChampionships = async () => {
    const response = await axios.get<Championship[]>(API_BASE);
    return response.data;
};

export const getChampionship = async (id: number) => {
    const response = await axios.get<Championship>(`${API_BASE}/${id}`);
    return response.data;
};

export const createChampionship = async (data: Partial<Championship>) => {
    const response = await axios.post<Championship>(API_BASE, data);
    return response.data;
};

export const addEventToChampionship = async (champId: number, eventId: number) => {
    const response = await axios.post(`${API_BASE}/${champId}/events/${eventId}`);
    return response.data;
};

export const getChampionshipStandings = async (id: number) => {
    const response = await axios.get<ChampionshipStanding[]>(`${API_BASE}/${id}/standings`);
    return response.data;
};

export const linkSessionToEvent = async (champId: number, eventId: number, sessionId: number) => {
    const response = await axios.post(`${API_BASE}/${champId}/events/${eventId}/link-session/${sessionId}`);
    return response.data;
};
