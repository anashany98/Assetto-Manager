import axios from 'axios';
import type { Mod } from './mods';
import { API_URL } from '../config';

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
