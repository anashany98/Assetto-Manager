import axios from 'axios';

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt'
        : `http://${window.location.hostname}:8000`;

export interface VMSSyncResult {
    users_found: number;
    users_synced: number;
    users_created: number;
    users_updated: number;
    details: string[];
}

export const syncVMSUsers = async (dryRun: boolean = false): Promise<VMSSyncResult> => {
    const response = await axios.post(`${API_URL}/integrations/vms/sync`, { dry_run: dryRun });
    return response.data;
};
