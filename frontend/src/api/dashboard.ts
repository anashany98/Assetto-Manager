// Removed invalid import

// Assuming stations.ts exports 'api' or similar, strict check:
// Actually stations.ts likely uses axios directly or fetch. Let's start clean.
import axios from 'axios';

const API_URL = 'http://localhost:8000';

export interface DashboardStats {
    total_stations: number;
    online_stations: number;
    syncing_stations: number;
    active_profile: string;
}

export const getDashboardStats = async (): Promise<DashboardStats> => {
    const response = await axios.get(`${API_URL}/stations/stats`);
    return response.data;
};
