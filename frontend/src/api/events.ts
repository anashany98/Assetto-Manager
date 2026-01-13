import axios from 'axios';
import type { Event, EventCreate, LeaderboardEntry } from '../types';
import { API_URL } from '../config';

export const getEvents = async (status?: string): Promise<Event[]> => {
    const params = status ? { status } : {};
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

export const createEvent = async (event: EventCreate): Promise<Event> => {
    const response = await axios.post(`${API_URL}/events/`, event);
    return response.data;
};

export const getEventLeaderboard = async (id: number): Promise<LeaderboardEntry[]> => {
    const response = await axios.get(`${API_URL}/events/${id}/leaderboard`);
    return response.data;
};
