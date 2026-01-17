import axios from 'axios';
import type { DriverSummary, PilotProfile, DriverDetails } from '../types';
import { API_URL } from '../config';

const API_BASE = `${API_URL}/telemetry`;

export const getDrivers = async (): Promise<DriverSummary[]> => {
    const res = await axios.get(`${API_BASE}/drivers`);
    return res.data;
};

export const getPilotProfile = async (driverName: string): Promise<PilotProfile> => {
    const res = await axios.get(`${API_BASE}/pilot/${encodeURIComponent(driverName)}`);
    return res.data;
};

export const getDriverTrackDetails = async (track: string, driver: string): Promise<DriverDetails> => {
    const res = await axios.get(`${API_BASE}/details/${encodeURIComponent(track)}/${encodeURIComponent(driver)}`);
    return res.data;
};

export const uploadSession = async (data: { station_id: number; track_name: string; track_config?: string; car_model: string; driver_name: string; session_type?: string; date?: string; best_lap: number; laps?: unknown[] }) => {
    const res = await axios.post(`${API_BASE}/session`, data);
    return res.data;
};

export const getRecentSessions = async (filters: { track_name?: string, driver_name?: string, car_model?: string, limit?: number } = {}) => {
    const res = await axios.get(`${API_BASE}/sessions`, {
        params: filters
    });
    return res.data;
};

export const compareDrivers = async (data: { drivers: string[], track: string, car?: string }) => {
    const res = await axios.post(`${API_BASE}/compare-multi`, data);
    return res.data;
};
