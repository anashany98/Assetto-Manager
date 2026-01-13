import axios from 'axios';
import { API_URL } from '../config';

export interface DashboardStats {
    total_stations: number;
    online_stations: number;
    syncing_stations: number;
    active_profile: string;
    total_drivers?: number;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const response = await axios.get(`${API_URL}/stations/stats`);
    return response.data;
};
