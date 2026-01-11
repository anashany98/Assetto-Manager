import axios from 'axios';
import type { Mod } from './mods';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

export interface Profile {
    id: number;
    name: string;
    description: string;
    mods: Mod[];
    created_at: string;
}

export const getProfiles = async (): Promise<Profile[]> => {
    const response = await axios.get(`${API_URL}/profiles`);
    return response.data;
};

export const createProfile = async (data: { name: string; description?: string; mod_ids: number[] }) => {
    const response = await axios.post(`${API_URL}/profiles`, data);
    return response.data;
};

export const assignProfileToStation = async (profileId: number, stationId: number) => {
    const response = await axios.put(`${API_URL}/profiles/${profileId}/assign`, stationId);
    return response.data;
};
