import axios from 'axios';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

const API_URL = `${API_BASE}/championships`;

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
    const response = await axios.get<Championship[]>(API_URL);
    return response.data;
};

export const getChampionship = async (id: number) => {
    const response = await axios.get<Championship>(`${API_URL}/${id}`);
    return response.data;
};

export const createChampionship = async (data: Partial<Championship>) => {
    const response = await axios.post<Championship>(API_URL, data);
    return response.data;
};

export const addEventToChampionship = async (champId: number, eventId: number) => {
    const response = await axios.post(`${API_URL}/${champId}/events/${eventId}`);
    return response.data;
};

export const getChampionshipStandings = async (id: number) => {
    const response = await axios.get<ChampionshipStanding[]>(`${API_URL}/${id}/standings`);
    return response.data;
};

export const linkSessionToEvent = async (champId: number, eventId: number, sessionId: number) => {
    const response = await axios.post(`${API_URL}/${champId}/events/${eventId}/link-session/${sessionId}`);
    return response.data;
};
