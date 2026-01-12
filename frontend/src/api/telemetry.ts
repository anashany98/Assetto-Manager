import axios from 'axios';
import type { DriverSummary, PilotProfile, DriverDetails } from '../types';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

const API_URL = `${API_BASE}/telemetry`;

export const getDrivers = async (): Promise<DriverSummary[]> => {
    const res = await axios.get(`${API_URL}/drivers`);
    return res.data;
};

export const getPilotProfile = async (driverName: string): Promise<PilotProfile> => {
    const res = await axios.get(`${API_URL}/pilot/${driverName}`);
    return res.data;
};

export const getDriverTrackDetails = async (track: string, driver: string): Promise<DriverDetails> => {
    const res = await axios.get(`${API_URL}/details/${track}/${driver}`);
    return res.data;
};

export const uploadSession = async (data: any) => {
    const res = await axios.post(`${API_URL}/session`, data);
    return res.data;
};

export const getRecentSessions = async (filters: { track_name?: string, driver_name?: string, car_model?: string, limit?: number } = {}) => {
    const res = await axios.get(`${API_URL}/sessions`, {
        params: filters
    });
    return res.data;
};
