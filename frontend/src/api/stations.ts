import axios from 'axios';
import { API_URL } from '../config';

export interface StationDiagnostics {
    cpu_percent: number;
    ram_total_gb: number;
    ram_used_gb: number;
    ram_percent: number;
    disk_total_gb: number;
    disk_used_gb: number;
    disk_percent: number;
}

export interface Station {
    id: number;
    name: string;
    ip_address: string;
    mac_address: string;
    hostname: string;
    is_active: boolean;
    is_online: boolean;
    is_kiosk_mode?: boolean;
    is_tv_mode?: boolean;
    is_vr?: boolean;
    status: string;
    ac_path?: string;
    diagnostics?: StationDiagnostics;
}

export const getStations = async (): Promise<Station[]> => {
    const response = await axios.get(`${API_URL}/stations`);
    return response.data;
};

export const updateStation = async (id: number, data: Partial<Station>): Promise<Station> => {
    const response = await axios.put(`${API_URL}/stations/${id}`, data);
    return response.data;
};
export const massLaunch = async (data: {
    station_ids: number[],
    car: string,
    track: string,
    mode: 'practice' | 'race',
    duration_minutes?: number,
    laps?: number,
    name?: string
}): Promise<any> => {
    const response = await axios.post(`${API_URL}/stations/mass-launch`, data);
    return response.data;
};
