import axios from 'axios';
import type { Event, EventCreate, LeaderboardEntry } from '../types';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

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
