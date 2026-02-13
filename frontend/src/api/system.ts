import client from './client';

export type AppUpdateStep = {
    name: string;
    status: 'success' | 'failed' | 'queued' | 'running';
    command?: string | null;
    return_code?: number | null;
    duration_ms?: number | null;
    output_tail?: string | null;
    error_tail?: string | null;
};

export type AppUpdateRunInfo = {
    status: 'queued' | 'running' | 'success' | 'failed';
    started_at?: string | null;
    finished_at?: string | null;
    restart_required?: boolean;
    error?: string | null;
    steps: AppUpdateStep[];
};

export type AppUpdateStatus = {
    supported: boolean;
    has_update: boolean;
    current_branch?: string | null;
    current_commit?: string | null;
    latest_commit?: string | null;
    behind_count: number;
    check_error?: string | null;
    checked_at?: string | null;
    is_updating: boolean;
    last_run?: AppUpdateRunInfo | null;
    restart_supported?: boolean;
    restart_service_name?: string | null;
    restart_error?: string | null;
};

export const getAppUpdateStatus = async (refresh = true): Promise<AppUpdateStatus> => {
    const response = await client.get('/system/app-update/status', { params: { refresh } });
    return response.data;
};

export const runAppUpdate = async (force = false): Promise<{ status: string; force: boolean; message: string }> => {
    const response = await client.post('/system/app-update/run', { force });
    return response.data;
};

export const restartAppService = async (): Promise<{ status: string; service_name?: string; delay_seconds?: number; message?: string }> => {
    const response = await client.post('/system/app-update/restart-service');
    return response.data;
};
