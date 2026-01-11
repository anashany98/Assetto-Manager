import axios from 'axios';

const API_BASE = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

const API_URL = `${API_BASE}/telemetry`;

export interface DriverSummary {
    driver_name: string;
    total_laps: number;
    favorite_car: string;
    last_seen: string;
    rank_tier: string;
}

export interface TrackRecord {
    track_name: string;
    best_lap: number;
    car_model: string;
    date: string;
}

export interface SessionSummary {
    session_id: number;
    track_name: string;
    car_model: string;
    date: string;
    best_lap: number;
    laps_count: number;
}

export interface PilotProfile {
    driver_name: string;
    total_laps: number;
    total_km: number;
    favorite_car: string;
    avg_consistency: number;
    active_days: number;
    records: TrackRecord[];
    recent_sessions: SessionSummary[];
}

export interface DriverDetails {
    driver_name: string;
    track_name: string;
    car_model: string;
    best_lap: number;
    best_sectors: number[];
    optimal_lap: number;
    consistency_score: number;
    lap_history: number[];
    total_laps: number;
    invalid_laps: number;
}

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
