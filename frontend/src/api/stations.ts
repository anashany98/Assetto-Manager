import axios from 'axios';

export const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

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
