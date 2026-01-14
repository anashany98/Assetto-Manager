import axios from 'axios';
import type { Event, EventCreate, LeaderboardEntry } from '../types';
import { API_URL } from '../config';



export const getEvents = async (status?: string, skip = 0, limit = 100, name?: string, championshipId?: number): Promise<Event[]> => {
    const params: any = { skip, limit };
    if (status) params.status = status;
    if (name) params.name = name;
    if (championshipId) params.championship_id = championshipId;

    const response = await axios.get(`${API_URL}/events/`, { params });
    return response.data;
};

export const getActiveEvent = async (): Promise<Event | null> => {
    const response = await axios.get(`${API_URL}/events/active`);
    return response.data;
};

export const getEvent = async (id: number): Promise<Event> => {
    const response = await axios.get(`${API_URL}/events/${id}`);
    return response.data;
};

export const updateEvent = async (id: number, event: EventCreate): Promise<Event> => {
    const response = await axios.put(`${API_URL}/events/${id}`, event);
    return response.data;
};

export const deleteEvent = async (id: number): Promise<void> => {
    await axios.delete(`${API_URL}/events/${id}`);
};

export const submitManualResults = async (id: number, results: { winner_name: string; second_name?: string; third_name?: string }): Promise<Event> => {
    const response = await axios.post(`${API_URL}/events/${id}/results/manual`, results);
    return response.data;
};

export const createEvent = async (event: EventCreate): Promise<Event> => {
    const response = await axios.post(`${API_URL}/events/`, event);
    return response.data;
};

export const getEventLeaderboard = async (id: number): Promise<LeaderboardEntry[]> => {
    const response = await axios.get(`${API_URL}/events/${id}/leaderboard`);
    return response.data;
};
