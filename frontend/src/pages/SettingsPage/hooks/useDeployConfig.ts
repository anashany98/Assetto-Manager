/**
 * Custom hook for AC profile/deploy configuration
 * Extracted from SettingsPage.tsx to reduce component complexity.
 */
import { useState, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../../config';
import { parseApiError } from '../../../lib/apiError';

type StationGroup = {
    name: string;
    station_ids: number[];
};

type HardwarePresets = {
    vr: Record<string, string>;
    flat: Record<string, string>;
};

type DeployJobSummary = {
    job_id: string;
    status: string;
    created_at?: string | null;
    started_at?: string | null;
    finished_at?: string | null;
    requested_by?: string;
    summary?: {
        total?: number;
        queued?: number;
        running?: number;
        success?: number;
        failed?: number;
        preflight_failed?: number;
    };
};

type DeployJobDetail = DeployJobSummary & {
    station_results?: Record<string, {
        station_id: number;
        station_name: string;
        status: string;
        error?: string | null;
        preflight?: { errors?: string[]; warnings?: string[] };
    }>;
};

export function useDeployConfig(activeTab: string) {
    const queryClient = useQueryClient();
    const [selectedCategory, setSelectedCategory] = useState('controls');
    const [isEditorOpen, setIsEditorOpen] = useState(false);
    const [newProfileName, setNewProfileName] = useState('');
    const [selectedProfiles, setSelectedProfiles] = useState<Record<string, string>>({});
    const [selectedStationIds, setSelectedStationIds] = useState<number[]>([]);
    const [editorDirty, setEditorDirty] = useState(false);
    const [strictDeploy, setStrictDeploy] = useState(false);
    const [selectedGroupName, setSelectedGroupName] = useState('');
    const [newGroupName, setNewGroupName] = useState('');
    const [activeDeployJobId, setActiveDeployJobId] = useState<string | null>(null);
    const [hardwarePresetDrafts, setHardwarePresetDrafts] = useState<HardwarePresets>({ vr: {}, flat: {} });
    const [safeModeEnabled, setSafeModeEnabled] = useState(true);

    const { data: profiles } = useQuery({
        queryKey: ['config_profiles'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/profiles`)).data
    });

    const { data: wheelProfiles = [] } = useQuery({
        queryKey: ['wheel-profiles'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/control/profiles`);
            return Array.isArray(res.data) ? res.data : [];
        }
    });

    const { data: stationGroupsData } = useQuery<{ groups: StationGroup[] }>({
        queryKey: ['config-station-groups'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/groups`)).data,
        enabled: activeTab === 'game'
    });

    const { data: hardwarePresetsData } = useQuery<HardwarePresets>({
        queryKey: ['config-hardware-presets'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/hardware-presets`)).data,
        enabled: activeTab === 'game'
    });

    const { data: safeModeData } = useQuery<{ enabled: boolean }>({
        queryKey: ['config-safe-mode'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/safe-mode`)).data,
        enabled: activeTab === 'game'
    });

    const { data: deployJobs = [] } = useQuery<DeployJobSummary[]>({
        queryKey: ['deploy-jobs'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/deploy/jobs?limit=20`)).data,
        enabled: activeTab === 'game',
        refetchInterval: activeTab === 'game' ? 3000 : false
    });

    const { data: deployJobDetail } = useQuery<DeployJobDetail>({
        queryKey: ['deploy-job-detail', activeDeployJobId],
        queryFn: async () => (await axios.get(`${API_URL}/configs/deploy/jobs/${activeDeployJobId}`)).data,
        enabled: !!activeDeployJobId && activeTab === 'game',
        refetchInterval: activeTab === 'game' ? 3000 : false
    });

    const { data: deployAudit = [] } = useQuery<any[]>({
        queryKey: ['deploy-audit'],
        queryFn: async () => (await axios.get(`${API_URL}/configs/deploy/audit?limit=15`)).data,
        enabled: activeTab === 'game',
        refetchInterval: activeTab === 'game' ? 5000 : false
    });

    useEffect(() => {
        if (hardwarePresetsData) {
            setHardwarePresetDrafts({
                vr: hardwarePresetsData.vr || {},
                flat: hardwarePresetsData.flat || {},
            });
        }
    }, [hardwarePresetsData]);

    useEffect(() => {
        if (safeModeData && typeof safeModeData.enabled === 'boolean') {
            setSafeModeEnabled(safeModeData.enabled);
        }
    }, [safeModeData]);

    useEffect(() => {
        if (!isEditorOpen) {
            setEditorDirty(false);
        }
    }, [isEditorOpen]);

    const stationGroups = Array.isArray(stationGroupsData?.groups) ? stationGroupsData.groups : [];

    const applyGroupSelection = (groupName: string) => {
        const match = stationGroups.find((g) => g.name === groupName);
        if (!match) return;
        setSelectedStationIds(match.station_ids);
        setSelectedGroupName(groupName);
    };

    const confirmDiscardEditorChanges = () => {
        if (!editorDirty) return true;
        return confirm("Hay cambios sin guardar en el editor. ¿Quieres descartarlos?");
    };

    const handleEditProfile = (filename: string) => {
        if (!confirmDiscardEditorChanges()) return;
        setNewProfileName(filename.replace('.ini', ''));
        setIsEditorOpen(true);
    };

    return {
        selectedCategory,
        setSelectedCategory,
        isEditorOpen,
        setIsEditorOpen,
        newProfileName,
        setNewProfileName,
        selectedProfiles,
        setSelectedProfiles,
        selectedStationIds,
        setSelectedStationIds,
        editorDirty,
        setEditorDirty,
        strictDeploy,
        setStrictDeploy,
        selectedGroupName,
        setSelectedGroupName,
        newGroupName,
        setNewGroupName,
        activeDeployJobId,
        setActiveDeployJobId,
        hardwarePresetDrafts,
        setHardwarePresetDrafts,
        safeModeEnabled,
        setSafeModeEnabled,
        profiles,
        wheelProfiles,
        stationGroups,
        stationGroupsData,
        hardwarePresetsData,
        safeModeData,
        deployJobs,
        deployJobDetail,
        deployAudit,
        applyGroupSelection,
        confirmDiscardEditorChanges,
        handleEditProfile,
    };
}

export function useDeployMutations(queryClient: ReturnType<typeof useQueryClient>, selectedProfiles: Record<string, string>, selectedStationIds: number[], strictDeploy: boolean, setActiveDeployJobId: (id: string | null) => void) {
    const saveGroupMutation = useMutation({
        mutationFn: async (payload: { name: string; station_ids: number[] }) => {
            return await axios.post(`${API_URL}/configs/groups`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-station-groups'] });
            toast.success('Grupo guardado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'No se pudo guardar el grupo.'))
    });

    const deleteGroupMutation = useMutation({
        mutationFn: async (name: string) => {
            return await axios.delete(`${API_URL}/configs/groups/${encodeURIComponent(name)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-station-groups'] });
            toast.success('Grupo eliminado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'No se pudo eliminar el grupo.'))
    });

    const saveHardwarePresetsMutation = useMutation({
        mutationFn: async (payload: HardwarePresets) => {
            return await axios.post(`${API_URL}/configs/hardware-presets`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-hardware-presets'] });
            toast.success('Presets de hardware guardados.');
        },
        onError: (error: any) => {
            const detail = error?.response?.data?.detail;
            if (detail?.errors && Array.isArray(detail.errors)) {
                toast.error(`No se pudo guardar presets: ${detail.errors.join(' | ')}`);
                return;
            }
            toast.error(parseApiError(error, 'No se pudieron guardar los presets de hardware.'));
        }
    });

    const safeModeMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            await axios.post(`${API_URL}/configs/safe-mode`, { enabled });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-safe-mode'] });
            toast.success('Modo seguro actualizado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'No se pudo cambiar el modo seguro.'))
    });

    const deployMutation = useMutation({
        mutationFn: async () => {
            if (Object.keys(selectedProfiles).length === 0) {
                throw new Error("Selecciona perfiles");
            }
            const res = await axios.post(`${API_URL}/configs/deploy`, {
                deploy_map: selectedProfiles,
                station_ids: selectedStationIds.length > 0 ? selectedStationIds : null,
                strict: strictDeploy
            });
            return res.data as { job_id?: string; preflight?: Array<{ ok: boolean }> };
        },
        onSuccess: (data) => {
            if (data?.job_id) {
                setActiveDeployJobId(data.job_id);
            }
            queryClient.invalidateQueries({ queryKey: ['deploy-jobs'] });
            const preflight = Array.isArray(data?.preflight) ? data.preflight : [];
            const failed = preflight.filter((p) => !p.ok).length;
            const msg = selectedStationIds.length > 0
                ? `Despliegue en cola para ${selectedStationIds.length} estación(es).`
                : "Despliegue en cola para todas las estaciones activas.";
            toast.success(failed > 0 ? `${msg} Preflight falló en ${failed} estación(es).` : msg);
        },
        onError: (error: any) => {
            const detail = error?.response?.data?.detail;
            if (detail?.job_id) {
                setActiveDeployJobId(detail.job_id);
            }
            if (detail?.message) {
                toast.error(`${detail.message}${detail.job_id ? ` (job: ${detail.job_id})` : ''}`);
                return;
            }
            toast.error(parseApiError(error, 'Error en despliegue'));
        }
    });

    const retryDeployMutation = useMutation({
        mutationFn: async (jobId: string) => {
            const res = await axios.post(`${API_URL}/configs/deploy/jobs/${jobId}/retry`, {});
            return res.data as { job_id?: string };
        },
        onSuccess: (data) => {
            if (data?.job_id) {
                setActiveDeployJobId(data.job_id);
            }
            queryClient.invalidateQueries({ queryKey: ['deploy-jobs'] });
            toast.success('Reintento de despliegue en cola.');
        },
        onError: (error) => toast.error(parseApiError(error, 'No se pudo reintentar el despliegue.'))
    });

    return {
        saveGroupMutation,
        deleteGroupMutation,
        saveHardwarePresetsMutation,
        safeModeMutation,
        deployMutation,
        retryDeployMutation,
    };
}
