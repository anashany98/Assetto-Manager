import axios from 'axios';
import { API_URL } from '../config';

export interface Car {
    id: string;
    name: string;
    brand?: string;
    image_url?: string;
    specs?: {
        bhp?: string;
        torque?: string;
        weight?: string;
        top_speed?: string;
        acceleration?: string;
        pwratio?: string;
    };
}

export interface Track {
    id: string;
    name: string;
    layout?: string;
    image_url?: string;
    map_url?: string;
    geotags?: number[];
}

export interface StationContent {
    station_id: number;
    cars: Car[];
    tracks: Track[];
    updated: string | null;
}

const cacheKey = (stationId: number) => `station_content_${stationId}`;

const readCache = (stationId: number): StationContent | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = window.localStorage.getItem(cacheKey(stationId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
};

const writeCache = (stationId: number, content: StationContent) => {
    if (typeof window === 'undefined') return;
    try {
        window.localStorage.setItem(cacheKey(stationId), JSON.stringify(content));
    } catch {
        // ignore cache errors
    }
};

/**
 * Get content (cars/tracks) for a specific station from cached scan.
 * Falls back to cached local data only (no dummy content).
 */
export const getStationContent = async (stationId: number): Promise<StationContent> => {
    try {
        const response = await axios.get<StationContent>(`${API_URL}/mods/station/${stationId}/content`);
        const data = response.data;
        if (data) {
            writeCache(stationId, data);
        }
        return data;
    } catch {
        const cached = readCache(stationId);
        if (cached) return cached;
        return {
            station_id: stationId,
            cars: [],
            tracks: [],
            updated: null
        };
    }
};

/**
 * Trigger a content scan for a station (the Agent will scan and cache results).
 */
export const triggerContentScan = async (stationId: number): Promise<void> => {
    await axios.get(`${API_URL}/control/station/${stationId}/content`);
};

/**
 * Get list of available cars. Uses station-specific endpoint if stationId provided.
 */
export const getCars = async (stationId?: number): Promise<Car[]> => {
    if (stationId) {
        const content = await getStationContent(stationId);
        return content.cars;
    }
    return [];
};

/**
 * Get list of available tracks. Uses station-specific endpoint if stationId provided.
 */
/**
 * Get list of available tracks. Uses station-specific endpoint if stationId provided.
 */
export const getTracks = async (stationId?: number): Promise<Track[]> => {
    if (stationId) {
        const content = await getStationContent(stationId);
        return content.tracks;
    }
    return [];
};

/**
 * Get ALL cars from the Global Library.
 */
export const getAllGlobalCars = async (): Promise<Car[]> => {
    const response = await axios.get<Car[]>(`${API_URL}/mods/?type=car&limit=1000`);
    return response.data;
};

/**
 * Get ALL tracks from the Global Library.
 */
export const getAllGlobalTracks = async (): Promise<Track[]> => {
    const response = await axios.get<Track[]>(`${API_URL}/mods/?type=track&limit=1000`);
    return response.data;
};

/**
 * Get Universal content (present on ALL active stations).
 */
export const getUniversalCars = async (): Promise<Car[]> => {
    const response = await axios.get<Car[]>(`${API_URL}/mods/?type=car&only_universal=true&limit=1000`);
    return response.data;
};

export const getUniversalTracks = async (): Promise<Track[]> => {
    const response = await axios.get<Track[]>(`${API_URL}/mods/?type=track&only_universal=true&limit=1000`);
    return response.data;
};
