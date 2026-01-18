import axios from 'axios';
import { API_URL } from '../config';

export interface Scenario {
    id?: number;
    name: string;
    description?: string;
    allowed_cars: string[]; // List of car IDs/names
    allowed_tracks: string[]; // List of track IDs/names
    allowed_durations: number[];
    is_active: boolean;
    created_at?: string;
    updated_at?: string;
}

export const getScenarios = async (): Promise<Scenario[]> => {
    const response = await axios.get(`${API_URL}/scenarios/`);
    return response.data;
};

export const getScenario = async (id: number): Promise<Scenario> => {
    const response = await axios.get(`${API_URL}/scenarios/${id}`);
    return response.data;
};

export const createScenario = async (scenario: Scenario): Promise<Scenario> => {
    const response = await axios.post(`${API_URL}/scenarios/`, scenario);
    return response.data;
};

export const updateScenario = async (id: number, scenario: Partial<Scenario>): Promise<Scenario> => {
    const response = await axios.put(`${API_URL}/scenarios/${id}`, scenario);
    return response.data;
};

export const deleteScenario = async (id: number): Promise<void> => {
    await axios.delete(`${API_URL}/scenarios/${id}`);
};
