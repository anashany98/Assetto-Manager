import axios from 'axios';
import { API_URL } from '../config';

export interface Station {
    id: number;
    name: string;
    ip_address: string;
    mac_address: string;
    hostname: string;
    is_active: boolean;
    is_online: boolean;
    status: string;
}

export const getStations = async (): Promise<Station[]> => {
    const response = await axios.get(`${API_URL}/stations`);
    return response.data;
};

export const updateStation = async (id: number, data: Partial<Station>): Promise<Station> => {
    const response = await axios.put(`${API_URL}/stations/${id}`, data);
    return response.data;
};
