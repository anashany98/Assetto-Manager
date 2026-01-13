import axios from 'axios';
import { API_URL } from '../config';

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
