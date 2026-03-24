import { useState, useRef, useEffect, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { getStations, updateStation, type Station } from '../api/stations';
import { QRCodeCanvas } from 'qrcode.react';

// Icons
import {
    Truck, Settings as SettingsIcon, Plus, FileText,
    Layout, Monitor, Wifi, WifiOff, Edit2, CheckCircle,
    Activity, Upload, QrCode, Gamepad2, Volume2, Zap,
    MonitorPlay, Globe, Terminal, Database, Bell, BadgeDollarSign, Megaphone,
    AlertTriangle, Power, RefreshCw, Link2, Copy, RotateCw, Lock, Unlock, Trash2, History, ShieldCheck,
    Wrench, HardDrive, Cpu, Radio, Info
} from 'lucide-react';
import { LogViewer } from '../components/LogViewer';
import AdsSettings from '../components/AdsSettings';
import { usePushNotifications } from '../hooks/usePushNotifications';
import ACSettingsEditor from '../components/ACSettingsEditor';
import { Camera, Cloud, Bot, Shield } from 'lucide-react';
import { LicenseSettings } from '../components/LicenseSettings';
import WallpaperSettings from '../components/WallpaperSettings';
import SystemUpdatePanel from '../components/SystemUpdatePanel';

import { calculatePrice, getPricingConfig, type PricingDiscount, type PricingRate } from '../utils/pricing';
import { isFeatureEnabled } from '../config/features';

type StationPresetDraft = {
    video?: string;
    race?: string;
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

type StationGroup = {
    name: string;
    station_ids: number[];
};

type HardwarePresets = {
    vr: Record<string, string>;
    flat: Record<string, string>;
};

const AC_CATEGORIES = [
    { id: 'controls', name: 'Controles', icon: Gamepad2, color: 'text-blue-500' },
    { id: 'gameplay', name: 'Ayudas / Gameplay', icon: Truck, color: 'text-orange-500' },
    { id: 'video', name: 'Gráficos', icon: Monitor, color: 'text-purple-500' },
    { id: 'audio', name: 'Audio', icon: Volume2, color: 'text-green-500' },
    { id: 'camera', name: 'Cámara', icon: Camera, color: 'text-cyan-500' },
    { id: 'race', name: 'IA / Carrera', icon: Bot, color: 'text-red-500' },
    { id: 'weather', name: 'Clima', icon: Cloud, color: 'text-yellow-500' },
];

export default function SettingsPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<'branding' | 'stations' | 'game' | 'sim' | 'logs' | 'ads' | 'database' | 'pricing' | 'license' | 'streaming' | 'maintenance'>('branding');
    const [searchParams, setSearchParams] = useSearchParams();
    const pushNotifications = usePushNotifications();
    const [showInactiveStations, setShowInactiveStations] = useState(false);
    const [showGhostStations, setShowGhostStations] = useState(false);
    const [ghostThresholdHours, setGhostThresholdHours] = useState(24);
    const [qrStationId, setQrStationId] = useState<number | null>(null);
    const [contentStationId, setContentStationId] = useState<number | null>(null);
    const [contentTab, setContentTab] = useState<'cars' | 'tracks'>('cars');
    const [ghostArchiveHours, setGhostArchiveHours] = useState(24);
    const [ghostArchiveIncludeNeverSeen, setGhostArchiveIncludeNeverSeen] = useState(true);
    const [ghostArchiveHour, setGhostArchiveHour] = useState(3);
    const [ghostArchiveMinute, setGhostArchiveMinute] = useState(0);
    const [savingGhostArchive, setSavingGhostArchive] = useState(false);

    // Sync tab with URL
    useEffect(() => {
        const tab = searchParams.get('tab');
        if (tab && ['branding', 'stations', 'game', 'sim', 'logs', 'ads', 'database', 'pricing', 'license', 'streaming', 'maintenance'].includes(tab)) {
            setActiveTab(tab as any);
        }
    }, [searchParams]);

    const handleTabChange = (tab: string) => {
        setActiveTab(tab as any);
        setSearchParams({ tab });
    };

    const buildKioskLink = (code?: string) => {
        if (!code) return '';
        return `${paymentPublicKioskUrl}?kiosk=${code}`;
    };
    const resolveContentUrl = (url?: string | null) => {
        if (!url) return '';
        if (/^(https?:|data:|blob:)/i.test(url)) return url;
        if (url.startsWith('/')) return `${API_URL}${url}`;
        return `${API_URL}/${url}`;
    };

    const copyToClipboard = async (text: string) => {
        if (!text) return;
        try {
            await navigator.clipboard.writeText(text);
            alert("Copiado al portapapeles.");
        } catch {
            alert("No se pudo copiar.");
        }
    };

    const formatLastSeen = (value?: string | null) => {
        if (!value) return 'nunca';
        const date = new Date(value);
        if (Number.isNaN(date.getTime())) return 'nunca';
        const diffMs = Date.now() - date.getTime();
        const diffMin = Math.floor(diffMs / 60000);
        if (diffMin < 1) return 'ahora';
        if (diffMin < 60) return `hace ${diffMin}m`;
        const diffHr = Math.floor(diffMin / 60);
        if (diffHr < 24) return `hace ${diffHr}h`;
        const diffDay = Math.floor(diffHr / 24);
        return `hace ${diffDay}d`;
    };

    const powerMutation = useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'shutdown' | 'power-on' | 'panic' | 'restart' }) => {
            await axios.post(`${API_URL}/stations/${id}/${action}`);
        },
        onSuccess: () => alert("Comando enviado")
    });

    const scanContentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.get(`${API_URL}/control/station/${stationId}/content`);
        },
        onSuccess: (_data, stationId) => {
            alert("Escaneo de contenido iniciado. Los coches y pistas aparecerán en unos segundos.");
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            setTimeout(() => {
                if (contentStationId === stationId) refetchStationContent();
            }, 2000);
        },
        onError: () => alert("Error al escanear contenido. ¿Está el agente conectado?")
    });

    const syncContentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/control/station/${stationId}/sync`);
        },
        onSuccess: () => alert("Sincronizacion solicitada al agente."),
        onError: () => alert("Error al sincronizar contenido. ¿Agente conectado?")
    });

    const restartAgentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/control/station/${stationId}/restart-agent`);
        },
        onSuccess: () => alert("Reinicio del agente solicitado."),
        onError: () => alert("Error al reiniciar el agente. ¿Agente conectado?")
    });

    const kioskToggleMutation = useMutation({
        mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
            await axios.post(`${API_URL}/control/station/${id}/kiosk`, { enabled });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al cambiar modo kiosko.")
    });

    const kioskCodeMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/kiosk-code`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al regenerar codigo de kiosko.")
    });

    const lockMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/lock`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al bloquear la estacion.")
    });

    const unlockMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/unlock`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al desbloquear la estacion.")
    });

    const testConnectionMutation = useMutation({
        mutationFn: async (stationId: number) => {
            const res = await axios.get(`${API_URL}/hardware/status/${stationId}`);
            return res.data;
        },
        onSuccess: (data: any) => {
            const online = data?.is_online ? "online" : "offline";
            alert(`Estado: ${online}`);
        },
        onError: () => alert("Error al comprobar conexion.")
    });

    const deleteStationMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.delete(`${API_URL}/stations/${stationId}`);
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al eliminar estacion.")
    });

    const reactivateStationMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await updateStation(stationId, { is_active: true, status: 'offline' });
        },
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['stations'] }),
        onError: () => alert("Error al reactivar estacion.")
    });

    const archiveGhostsMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.post(`${API_URL}/stations/archive-ghosts`, {
                older_than_hours: ghostThresholdHours,
                include_never_seen: ghostArchiveIncludeNeverSeen,
                dry_run: false
            });
            return res.data;
        },
        onSuccess: (data: any) => {
            const count = typeof data?.archived_count === 'number' ? data.archived_count : 0;
            alert(count > 0 ? `Archivadas ${count} estaciones fantasma.` : "No hay estaciones fantasma para archivar.");
            queryClient.invalidateQueries({ queryKey: ['stations'] });
        },
        onError: () => alert("Error al archivar estaciones fantasma.")
    });

    const handleExport = async () => {
        try {
            const token = localStorage.getItem('token');
            const response = await axios.get(`${API_URL}/backup/export`, {
                headers: { Authorization: `Bearer ${token}` },
                responseType: 'blob'
            });
            const url = window.URL.createObjectURL(new Blob([response.data]));
            const link = document.createElement('a');
            link.href = url;
            link.setAttribute('download', `backup_${new Date().toISOString()}.json`);
            document.body.appendChild(link);
            link.click();
            link.remove();
        } catch (error) {
            console.error(error);
            alert("Error al exportar backup");
        }
    };

    const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        if (!confirm("ADVERTENCIA: Restaurar una copia de seguridad BORRARÁ todos los datos actuales (Eventos, Pilotos, Resultados). ¿Estás seguro?")) return;

        const formData = new FormData();
        formData.append('file', file);
        const token = localStorage.getItem('token');
        try {
            await axios.post(`${API_URL}/backup/import`, formData, {
                headers: {
                    'Content-Type': 'multipart/form-data',
                    Authorization: `Bearer ${token}`
                }
            });
            alert("Base de datos restaurada correctamente. Se recomienda recargar la página.");
            window.location.reload();
        } catch (err) {
            console.error(err);
            alert("Error al restaurar backup");
        }
    };

    // --- BRANDING STATE ---
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
    });
    const { data: secureSettings = [] } = useQuery({
        queryKey: ['settings-secure'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/secure`);
                return Array.isArray(res.data) ? res.data : [];
            } catch {
                return [];
            }
        },
        initialData: []
    });
    const updateBranding = useMutation({
        mutationFn: async (data: { key: string, value: string }) => await axios.post(`${API_URL}/settings/`, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] })
    });
    const fileInputRef = useRef<HTMLInputElement>(null);
    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        const formData = new FormData();
        formData.append('file', file);
        try {
            await axios.post(`${API_URL}/settings/upload-logo`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch { alert("Error al subir logo"); }
    };

    // --- STATIONS STATE ---
    const { data: stations } = useQuery({ queryKey: ['stations'], queryFn: getStations });
    const { data: healthStatus = [] } = useQuery({
        queryKey: ['hardware-status'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/hardware/status`);
            return Array.isArray(res.data) ? res.data : [];
        },
        refetchInterval: activeTab === 'stations' ? 5000 : false,
        enabled: activeTab === 'stations'
    });
    const { data: stationContent, isFetching: stationContentLoading, refetch: refetchStationContent } = useQuery({
        queryKey: ['station-content', contentStationId],
        queryFn: async () => {
            if (!contentStationId) return null;
            const res = await axios.get(`${API_URL}/mods/station/${contentStationId}/content`);
            return res.data;
        },
        enabled: !!contentStationId
    });

    const healthById = useMemo(() => {
        const map = new Map<number, any>();
        (healthStatus || []).forEach((entry: any) => {
            map.set(entry.station_id, entry);
        });
        return map;
    }, [healthStatus]);

    const healthSummary = useMemo(() => {
        const total = (healthStatus || []).length;
        const online = (healthStatus || []).filter((s: any) => s.is_online).length;
        const withAlerts = (healthStatus || []).filter((s: any) => Array.isArray(s.alerts) && s.alerts.length > 0).length;
        return { total, online, withAlerts, offline: Math.max(total - online, 0) };
    }, [healthStatus]);
    const contentStation = useMemo(() => {
        if (!contentStationId || !Array.isArray(stations)) return null;
        return stations.find((station) => station.id === contentStationId) || null;
    }, [stations, contentStationId]);

    // --- MAINTENANCE DATA ---
    const { data: maintenanceLogs = [] } = useQuery({
        queryKey: ['maintenance-logs'],
        queryFn: async () => {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/maintenance/logs`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            return Array.isArray(res.data) ? res.data : [];
        },
        enabled: activeTab === 'maintenance',
        staleTime: 30000,
    });

    const { data: usageSummary } = useQuery({
        queryKey: ['maintenance-usage-summary'],
        queryFn: async () => {
            const token = localStorage.getItem('token');
            const res = await axios.get(`${API_URL}/maintenance/usage/summary`, {
                headers: token ? { Authorization: `Bearer ${token}` } : {}
            });
            return res.data;
        },
        enabled: activeTab === 'maintenance',
        staleTime: 60000,
    });

    const visibleStations = Array.isArray(stations)
        ? stations.filter((station) => showInactiveStations ? true : station.is_active !== false)
        : [];
    const ghostCutoff = useMemo(
        () => Date.now() - ghostThresholdHours * 60 * 60 * 1000,
        [ghostThresholdHours]
    );
    const isStationOnline = (station: Station) => {
        const health = healthById.get(station.id);
        if (health && typeof health.is_online === 'boolean') {
            return health.is_online;
        }
        return station.is_online;
    };
    const isGhostStation = (station: Station) => {
        if (station.is_active === false || station.status === 'archived') {
            return false;
        }
        if (isStationOnline(station)) return false;
        if (!station.last_seen) return true;
        const seenAt = new Date(station.last_seen).getTime();
        if (!Number.isFinite(seenAt)) return true;
        return seenAt < ghostCutoff;
    };
    const ghostStations = visibleStations.filter((station) => isGhostStation(station));
    const filteredStations = showGhostStations
        ? visibleStations
        : visibleStations.filter((station) => !isGhostStation(station));
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editForm, setEditForm] = useState<{ name: string, ip: string, ac_path: string, is_vr: boolean }>({ name: '', ip: '', ac_path: '', is_vr: false });
    const [stationPresetDrafts, setStationPresetDrafts] = useState<Record<number, StationPresetDraft>>({});
    const [stationWheelDrafts, setStationWheelDrafts] = useState<Record<number, string>>({});
    const stationMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<Station> }) => updateStation(id, data),
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['stations'] }); setEditingId(null); },
        onError: () => alert("Error al guardar la estación. Inténtalo de nuevo.")
    });
    const applyWheelProfileMutation = useMutation({
        mutationFn: async ({ stationId, profileId }: { stationId: number; profileId: string }) => {
            await axios.post(`${API_URL}/control/station/${stationId}/profile/${profileId}`);
        },
        onSuccess: () => alert("Perfil de volante aplicado.")
    });
    const applyStationPresetsMutation = useMutation({
        mutationFn: async ({ stationId, deployMap }: { stationId: number; deployMap: Record<string, string> }) => {
            await axios.post(`${API_URL}/configs/deploy`, {
                deploy_map: deployMap,
                station_ids: [stationId]
            });
        },
        onSuccess: () => alert("Presets enviados a la estación.")
    });

    // --- GAME CONFIG STATE ---
    const [selectedCategory, setSelectedCategory] = useState(AC_CATEGORIES[0].id);
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

    const confirmDiscardEditorChanges = () => {
        if (!editorDirty) return true;
        return confirm("Hay cambios sin guardar en el editor. ¿Quieres descartarlos?");
    };

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

    const saveGroupMutation = useMutation({
        mutationFn: async (payload: { name: string; station_ids: number[] }) => {
            return await axios.post(`${API_URL}/configs/groups`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-station-groups'] });
            alert("Grupo guardado.");
        },
        onError: () => alert("No se pudo guardar el grupo.")
    });

    const deleteGroupMutation = useMutation({
        mutationFn: async (name: string) => {
            return await axios.delete(`${API_URL}/configs/groups/${encodeURIComponent(name)}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-station-groups'] });
            setSelectedGroupName('');
            alert("Grupo eliminado.");
        },
        onError: () => alert("No se pudo eliminar el grupo.")
    });

    const saveHardwarePresetsMutation = useMutation({
        mutationFn: async (payload: HardwarePresets) => {
            return await axios.post(`${API_URL}/configs/hardware-presets`, payload);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-hardware-presets'] });
            alert("Presets de hardware guardados.");
        },
        onError: (error: any) => {
            const detail = error?.response?.data?.detail;
            if (detail?.errors && Array.isArray(detail.errors)) {
                alert(`No se pudo guardar presets:\n- ${detail.errors.join('\n- ')}`);
                return;
            }
            alert("No se pudieron guardar los presets de hardware.");
        }
    });

    const safeModeMutation = useMutation({
        mutationFn: async (enabled: boolean) => {
            await axios.post(`${API_URL}/configs/safe-mode`, { enabled });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['config-safe-mode'] });
        },
        onError: () => alert("No se pudo cambiar el modo seguro.")
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
            alert(failed > 0 ? `${msg}\nPreflight falló en ${failed} estación(es).` : msg);
        },
        onError: (error: any) => {
            const detail = error?.response?.data?.detail;
            if (detail?.job_id) {
                setActiveDeployJobId(detail.job_id);
            }
            if (detail?.message) {
                alert(`${detail.message}${detail.job_id ? ` (job: ${detail.job_id})` : ''}`);
                return;
            }
            alert(error instanceof Error ? error.message : "Error en despliegue");
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
            alert("Reintento de despliegue en cola.");
        },
        onError: () => alert("No se pudo reintentar el despliegue.")
    });

    const stationGroups = Array.isArray(stationGroupsData?.groups) ? stationGroupsData.groups : [];

    const applyGroupSelection = (groupName: string) => {
        const match = stationGroups.find((g) => g.name === groupName);
        if (!match) return;
        setSelectedStationIds(match.station_ids);
        setSelectedGroupName(groupName);
    };

    const applyHardwarePreset = (target: 'vr' | 'flat') => {
        const presetMap = target === 'vr' ? hardwarePresetDrafts.vr : hardwarePresetDrafts.flat;
        if (!presetMap || Object.keys(presetMap).length === 0) {
            alert(`No hay preset guardado para ${target.toUpperCase()}.`);
            return;
        }
        const targetIds = (stations || [])
            .filter((s: any) => target === 'vr' ? !!s.is_vr : !s.is_vr)
            .map((s: any) => s.id);
        setSelectedProfiles((prev) => ({ ...prev, ...presetMap }));
        setSelectedStationIds(targetIds);
    };

    const handleEditProfile = (filename: string) => {
        if (!confirmDiscardEditorChanges()) return;
        setNewProfileName(filename.replace('.ini', ''));
        setIsEditorOpen(true);
    };


    const safeBranding = Array.isArray(branding) ? branding : [];
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const pricingConfig = useMemo(() => getPricingConfig(safeBranding), [safeBranding]);
    const getSettingValue = (key: string, fallback: string) => {
        const setting = safeBranding.find((item: any) => item.key === key);
        return setting?.value ?? fallback;
    };
    const [durationRates, setDurationRates] = useState<PricingRate[]>([]);
    const [discountRules, setDiscountRules] = useState<PricingDiscount[]>([]);
    const [basePerMin, setBasePerMin] = useState<number>(pricingConfig.basePerMin);
    const [vrPerMin, setVrPerMin] = useState<number>(pricingConfig.vrSurchargePerMin);
    const [allowManualOverride, setAllowManualOverride] = useState<boolean>(pricingConfig.allowManualOverride);
    const [paymentEnabled, setPaymentEnabled] = useState(true);
    const [paymentCurrency, setPaymentCurrency] = useState('EUR');
    const [paymentPublicKioskUrl, setPaymentPublicKioskUrl] = useState('http://localhost:3010/kiosk');
    const [stripeSecretKey, setStripeSecretKey] = useState('');
    const [stripeWebhookSecret, setStripeWebhookSecret] = useState('');
    const [stripeSuccessUrl, setStripeSuccessUrl] = useState('');
    const [stripeCancelUrl, setStripeCancelUrl] = useState('');
    const [bizumReceiver, setBizumReceiver] = useState('');
    const [savingPaymentToggle, setSavingPaymentToggle] = useState(false);
    const [savingPaymentConfig, setSavingPaymentConfig] = useState(false);

    useEffect(() => {
        setDurationRates(pricingConfig.rates);
        setDiscountRules(pricingConfig.discounts);
        setBasePerMin(pricingConfig.basePerMin);
        setVrPerMin(pricingConfig.vrSurchargePerMin);
        setAllowManualOverride(pricingConfig.allowManualOverride);
    }, [pricingConfig]);

    useEffect(() => {
        const hours = Number(getSettingValue('ghost_archive_hours', '24'));
        const includeNeverSeen = getSettingValue('ghost_archive_include_never_seen', 'true');
        const hour = Number(getSettingValue('ghost_archive_hour', '3'));
        const minute = Number(getSettingValue('ghost_archive_minute', '0'));
        setGhostArchiveHours(Number.isFinite(hours) ? hours : 24);
        setGhostArchiveIncludeNeverSeen(includeNeverSeen === 'true' || includeNeverSeen === '1');
        setGhostArchiveHour(Number.isFinite(hour) ? hour : 3);
        setGhostArchiveMinute(Number.isFinite(minute) ? minute : 0);
    }, [safeBranding]);

    useEffect(() => {
        const enabled = getSettingValue('kiosk_payment_enabled', 'true');
        setPaymentEnabled(enabled === 'true' || enabled === '1');
    }, [safeBranding]);

    const getSecureValue = (key: string, fallback: string) => {
        const setting = secureSettings.find((item: any) => item.key === key);
        return setting?.value || fallback;
    };

    useEffect(() => {
        setPaymentCurrency(getSecureValue('payment_currency', 'EUR'));
        setPaymentPublicKioskUrl(getSecureValue('payment_public_kiosk_url', 'http://localhost:3010/kiosk'));
        setStripeSecretKey(getSecureValue('stripe_secret_key', ''));
        setStripeWebhookSecret(getSecureValue('stripe_webhook_secret', ''));
        setStripeSuccessUrl(getSecureValue('stripe_success_url', ''));
        setStripeCancelUrl(getSecureValue('stripe_cancel_url', ''));
        setBizumReceiver(getSecureValue('bizum_receiver', ''));
    }, [secureSettings]);

    const savePaymentConfig = async () => {
        setSavingPaymentConfig(true);
        try {
            await Promise.all([
                axios.post(`${API_URL}/settings/`, { key: 'kiosk_payment_enabled', value: paymentEnabled ? 'true' : 'false' }),
                axios.post(`${API_URL}/settings/`, { key: 'payment_currency', value: paymentCurrency }),
                axios.post(`${API_URL}/settings/`, { key: 'payment_public_kiosk_url', value: paymentPublicKioskUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_secret_key', value: stripeSecretKey }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_webhook_secret', value: stripeWebhookSecret }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_success_url', value: stripeSuccessUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'stripe_cancel_url', value: stripeCancelUrl }),
                axios.post(`${API_URL}/settings/`, { key: 'bizum_receiver', value: bizumReceiver })
            ]);
            queryClient.invalidateQueries({ queryKey: ['settings-secure'] });
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch (error) {
            console.error(error);
            alert("Error al guardar configuración de pagos");
        } finally {
            setSavingPaymentConfig(false);
        }
    };

    const handlePaymentToggle = async () => {
        if (savingPaymentToggle) return;
        const next = !paymentEnabled;
        setPaymentEnabled(next);
        setSavingPaymentToggle(true);
        try {
            await updateBranding.mutateAsync({
                key: 'kiosk_payment_enabled',
                value: next ? 'true' : 'false'
            });
        } catch (err) {
            console.error(err);
            setPaymentEnabled(!next);
            const status = axios.isAxiosError(err) ? err.response?.status : undefined;
            alert(status === 401 ? "Sesion expirada. Vuelve a iniciar sesion." : "No se pudo guardar el estado de pagos.");
        } finally {
            setSavingPaymentToggle(false);
        }
    };

    const saveGhostArchiveConfig = async () => {
        setSavingGhostArchive(true);
        try {
            await Promise.all([
                axios.post(`${API_URL}/settings/`, { key: 'ghost_archive_hours', value: String(ghostArchiveHours) }),
                axios.post(`${API_URL}/settings/`, { key: 'ghost_archive_include_never_seen', value: ghostArchiveIncludeNeverSeen ? 'true' : 'false' }),
                axios.post(`${API_URL}/settings/`, { key: 'ghost_archive_hour', value: String(ghostArchiveHour) }),
                axios.post(`${API_URL}/settings/`, { key: 'ghost_archive_minute', value: String(ghostArchiveMinute) })
            ]);
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        } catch (error) {
            console.error(error);
            alert("Error al guardar configuracion de auto-archivado");
        } finally {
            setSavingGhostArchive(false);
        }
    };

    const previewConfig = {
        basePerMin,
        vrSurchargePerMin: vrPerMin,
        rates: durationRates,
        discounts: discountRules,
        allowManualOverride
    };

    const saveDurationRates = () => {
        const cleaned = durationRates
            .filter((rate) => Number.isFinite(rate.minutes) && Number.isFinite(rate.price))
            .map((rate) => ({ minutes: Number(rate.minutes), price: Number(rate.price) }))
            .sort((a, b) => a.minutes - b.minutes);
        updateBranding.mutate({ key: 'pricing_duration_rates', value: JSON.stringify(cleaned) });
    };

    const saveDiscountRules = () => {
        const cleaned = discountRules
            .filter((rule) => Number.isFinite(rule.minutes) && Number.isFinite(rule.value))
            .map((rule) => ({
                minutes: Number(rule.minutes),
                type: rule.type === 'percent' ? 'percent' : 'flat',
                value: Number(rule.value)
            }))
            .sort((a, b) => a.minutes - b.minutes);
        updateBranding.mutate({ key: 'pricing_discounts', value: JSON.stringify(cleaned) });
    };

    return (
        <div className="h-full flex flex-col bg-[var(--bg-app)] text-[var(--text-primary)] font-sans overflow-hidden">
            {/* Header */}
            <div className="flex-none px-4 py-6 md:px-8 md:py-8 md:pb-4 flex flex-col gap-4 border-b border-[var(--border-default)] bg-[var(--bg-card)]/50 backdrop-blur-sm">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight flex items-center">
                        <SettingsIcon className="mr-3 text-blue-500" />
                        Configuración
                    </h1>
                    <p className="text-[var(--text-tertiary)] text-sm font-medium mt-1">Gestión integral del sistema y simuladores</p>
                </div>

                {/* Tabs */}
                <div className="flex flex-wrap items-center gap-1.5 w-full bg-[var(--bg-elevated)] p-1.5 rounded-2xl border border-[var(--border-default)] shadow-sm">
                    {[
                        { id: 'license', label: 'Licencia', icon: Shield },
                        { id: 'branding', label: 'Marca y TV', icon: Layout },
                        isFeatureEnabled('ads_tab') ? { id: 'ads', label: 'Promociones', icon: Megaphone } : null,
                        { id: 'pricing', label: 'Precios', icon: BadgeDollarSign },
                        { id: 'game', label: 'Editor AC', icon: Gamepad2 },
                        { id: 'sim', label: 'Simulador AC', icon: Zap },
                        { id: 'stations', label: 'Simuladores', icon: MonitorPlay },
                        { id: 'logs', label: 'Logs Sistema', icon: Terminal },
                        { id: 'database', label: 'Base de Datos', icon: Database },
                        { id: 'streaming', label: 'Transmisión', icon: Radio },
                        { id: 'maintenance', label: 'Mantenimiento', icon: Wrench }
                    ].filter(Boolean).map((tab: any) => (
                        <button
                            key={tab.id}
                            onClick={() => handleTabChange(tab.id)}
                            className={cn(
                                "shrink-0 whitespace-nowrap flex items-center gap-2 px-3 md:px-4 py-2 rounded-xl text-xs md:text-sm font-black transition-all uppercase tracking-wide",
                                activeTab === tab.id
                                    ? "bg-gray-700 shadow-lg text-blue-400 border border-[var(--border-strong)]"
                                    : "text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]"
                            )}>
                            <tab.icon size={16} />
                            <span>{tab.label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 overflow-y-auto px-4 pt-6 pb-8 md:px-8">

                {/* --- TAB: LICENSE --- */}
                {activeTab === 'license' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <LicenseSettings />
                    </div>
                )}

                {/* --- TAB: BRANDING --- */}
                {activeTab === 'branding' && (
                    <div className="max-w-5xl space-y-8 animate-in fade-in duration-300">
                        {/* Identity */}
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                            <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><Layout className="mr-2 text-blue-400" /> Identidad</h2>
                                <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Nombre del Local</label>
                                <input
                                    className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                    defaultValue={barName}
                                    onBlur={e => updateBranding.mutate({ key: 'bar_name', value: e.target.value })}
                                />
                                <div className="mt-6">
                                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Logo</label>
                                    <div className="flex items-center space-x-4">
                                        <img src={barLogo} className="h-16 w-16 object-contain bg-[var(--bg-card)] rounded-lg p-2" onError={(e: React.SyntheticEvent<HTMLImageElement>) => { e.currentTarget.src = '/logo.png'; }} />
                                        <div className="flex-1">
                                            <input
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-xs font-mono text-[var(--text-tertiary)] mb-2"
                                                defaultValue={barLogo}
                                                onBlur={e => updateBranding.mutate({ key: 'bar_logo', value: e.target.value })}
                                            />
                                            <button onClick={() => fileInputRef.current?.click()} className="text-xs bg-gray-700 text-[var(--text-primary)] px-3 py-1.5 rounded-lg hover:bg-gray-600 uppercase font-bold">Subir Archivo</button>
                                            <input type="file" hidden ref={fileInputRef} onChange={handleLogoUpload} accept="image/*" />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Ticker / Promo */}
                            <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><Activity className="mr-2 text-yellow-400" /> Ticker Noticias</h2>
                                <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Mensaje Promocional</label>
                                <textarea
                                    className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-yellow-500 transition-all min-h-[100px]"
                                    defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'promo_text')?.value}
                                    onBlur={e => updateBranding.mutate({ key: 'promo_text', value: e.target.value })}
                                />
                                <div className="mt-4 flex items-center justify-between">
                                    <span className="text-sm font-bold text-[var(--text-tertiary)]">Velocidad</span>
                                    <input type="range" min="20" max="200" className="w-1/2 accent-yellow-500" defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'ticker_speed')?.value || 80} onChange={e => updateBranding.mutate({ key: 'ticker_speed', value: e.target.value })} />
                                </div>
                            </div>
                        </div>

                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><Globe className="mr-2 text-green-400" /> Acceso Público (QR)</h2>
                            <div className="flex flex-col md:flex-row gap-6 items-center">
                                <div className="flex-1 w-full">
                                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">URL Pública</label>
                                    <input
                                        className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] font-mono text-sm text-blue-300"
                                        defaultValue={safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_public_url')?.value}
                                        onBlur={e => updateBranding.mutate({ key: 'bar_public_url', value: e.target.value })}
                                    />
                                    <button
                                        onClick={() => updateBranding.mutate({ key: 'bar_public_url', value: `${window.location.protocol}//${window.location.hostname}:${window.location.port}/mobile` })}
                                        className="mt-2 text-xs text-blue-500 hover:text-blue-400 font-bold uppercase underline"
                                    >
                                        Usar IP Local Detectada
                                    </button>
                                </div>
                                <div className="flex items-center space-x-3 bg-[var(--bg-card)] p-4 rounded-xl border border-[var(--border-default)]">
                                    <QrCode className="text-[var(--text-primary)]" size={32} />
                                    <div>
                                        <p className="text-xs font-bold text-[var(--text-tertiary)] uppercase">Mostrar en TV</p>
                                        <input type="checkbox" className="w-5 h-5 accent-blue-500" defaultChecked={safeBranding.find((s: { key: string; value: string }) => s.key === 'show_qr')?.value === 'true'} onChange={e => updateBranding.mutate({ key: 'show_qr', value: e.target.checked ? 'true' : 'false' })} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Kiosk Options */}
                        {/* Kiosk Options */}
                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><MonitorPlay className="mr-2 text-cyan-400" /> Opciones de Kiosko</h2>
                            <div className="flex flex-col gap-6">
                                <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-4 rounded-xl border border-[var(--border-default)]/50">
                                    <div>
                                        <p className="font-bold text-[var(--text-primary)] text-sm">Habilitar Funciones con Mods</p>
                                        <p className="text-xs text-[var(--text-tertiary)] text-balance">Desbloquea modos especiales como Tráfico, Overtake y lluvia (Requiere mods específicos en la PC)</p>
                                    </div>
                                    <button
                                        onClick={() => updateBranding.mutate({
                                            key: 'sim_mods_enabled',
                                            value: safeBranding.find(s => s.key === 'sim_mods_enabled')?.value === 'true' ? 'false' : 'true'
                                        })}
                                        className={cn(
                                            "w-14 h-7 rounded-full transition-all relative",
                                            safeBranding.find(s => s.key === 'sim_mods_enabled')?.value === 'true' ? "bg-blue-500" : "bg-gray-600"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                            safeBranding.find(s => s.key === 'sim_mods_enabled')?.value === 'true' && "translate-x-7"
                                        )} />
                                    </button>
                                </div>

                                {safeBranding.find(s => s.key === 'sim_mods_enabled')?.value === 'true' && (
                                    <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-4 rounded-xl border border-[var(--border-default)]/50 animate-in fade-in slide-in-from-top-2 duration-300">
                                        <div>
                                            <p className="font-bold text-[var(--text-primary)] text-sm">Habilitar Lluvia Visual</p>
                                            <p className="text-xs text-[var(--text-tertiary)]">Muestra la opción de lluvia en el menú de dificultad (Requiere CSP Preview)</p>
                                        </div>
                                        <button
                                            onClick={() => updateBranding.mutate({
                                                key: 'kiosk_rain_enabled',
                                                value: safeBranding.find(s => s.key === 'kiosk_rain_enabled')?.value === 'true' ? 'false' : 'true'
                                            })}
                                            className={cn(
                                                "w-14 h-7 rounded-full transition-all relative",
                                                safeBranding.find(s => s.key === 'kiosk_rain_enabled')?.value === 'true' ? "bg-cyan-500" : "bg-gray-600"
                                            )}
                                        >
                                            <div className={cn(
                                                "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                                safeBranding.find(s => s.key === 'kiosk_rain_enabled')?.value === 'true' && "translate-x-7"
                                            )} />
                                        </button>
                                    </div>
                                )}
                            </div>
                        </div>
                        {/* Video Wallpapers */}
                        <WallpaperSettings />

                        {/* Push Notifications */}
                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><Bell className="mr-2 text-purple-400" /> Notificaciones Push</h2>
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-sm font-bold text-[var(--text-secondary)]">Recibir alertas de nuevos récords y eventos</p>
                                    <p className="text-xs text-[var(--text-tertiary)] mt-1">
                                        {!pushNotifications.isSupported && 'Tu navegador no soporta notificaciones push'}
                                        {pushNotifications.isSupported && pushNotifications.permission === 'denied' && 'Permisos denegados - activa en config del navegador'}
                                        {pushNotifications.isSupported && pushNotifications.permission !== 'denied' && (pushNotifications.isSubscribed ? 'Suscrito ✓' : 'Click para activar')}
                                    </p>
                                </div>
                                <button
                                    onClick={() => pushNotifications.isSubscribed ? pushNotifications.unsubscribe() : pushNotifications.subscribe()}
                                    disabled={!pushNotifications.isSupported || pushNotifications.loading || pushNotifications.permission === 'denied'}
                                    className={cn(
                                        "relative w-14 h-7 rounded-full transition-colors",
                                        pushNotifications.isSubscribed ? "bg-purple-500" : "bg-gray-600",
                                        (!pushNotifications.isSupported || pushNotifications.permission === 'denied') && "opacity-50 cursor-not-allowed"
                                    )}
                                >
                                    <div className={cn(
                                        "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                        pushNotifications.isSubscribed && "translate-x-7"
                                    )} />
                                </button>
                            </div>
                        </div>
                    </div>
                )}
 
                {/* --- TAB: ADS --- */}
                {activeTab === 'ads' && (
                    <div className="max-w-5xl animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-card)]/50 p-8 rounded-3xl border border-[var(--border-default)]">
                            <p className="text-[var(--text-tertiary)] mb-6 text-sm font-medium">Gestiona la publicidad y promociones que aparecen en las pantallas del local (TV Mode).</p>
                            <AdsSettings />
                        </div>
                    </div>
                )}

                {/* --- TAB: PRICING --- */}
                {activeTab === 'pricing' && (
                    <div className="max-w-2xl animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                                <BadgeDollarSign className="mr-2 text-green-400" /> Configuración de Precios
                            </h2>
                            <p className="text-[var(--text-tertiary)] mb-6 text-sm">Define precios por duración, recargos y descuentos. El kiosko calculará el precio automáticamente.</p>

                            <div className="space-y-6">
                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Precio Base por Minuto</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-[var(--text-tertiary)]">€</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full p-3 pl-8 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-green-500 transition-all text-lg"
                                            value={basePerMin}
                                            onChange={e => setBasePerMin(Number(e.target.value))}
                                            onBlur={e => updateBranding.mutate({ key: 'pricing_base_per_min', value: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Si no defines tarifas por duración, se usa este precio por minuto.</p>
                                </div>

                                <div>
                                    <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Recargo VR por Minuto</label>
                                    <div className="relative">
                                        <span className="absolute left-4 top-3.5 text-[var(--text-tertiary)]">+ €</span>
                                        <input
                                            type="number"
                                            step="0.01"
                                            className="w-full p-3 pl-10 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-purple-500 transition-all text-lg"
                                            value={vrPerMin}
                                            onChange={e => setVrPerMin(Number(e.target.value))}
                                            onBlur={e => updateBranding.mutate({ key: 'pricing_vr_surcharge_per_min', value: e.target.value })}
                                        />
                                    </div>
                                    <p className="text-xs text-[var(--text-tertiary)] mt-1">Se suma al precio base por cada minuto si se usa VR.</p>
                                </div>

                                <div className="flex items-center justify-between bg-[var(--bg-card)]/60 border border-[var(--border-default)] rounded-xl p-4">
                                    <div>
                                        <p className="text-sm font-bold text-[var(--text-secondary)]">Permitir precio manual en admin</p>
                                        <p className="text-xs text-[var(--text-tertiary)]">Si está desactivado, el precio siempre se calcula por duración.</p>
                                    </div>
                                    <button
                                        onClick={() => {
                                            const next = !allowManualOverride;
                                            setAllowManualOverride(next);
                                            updateBranding.mutate({ key: 'pricing_allow_manual_override', value: next ? 'true' : 'false' });
                                        }}
                                        className={cn(
                                            "relative w-14 h-7 rounded-full transition-colors",
                                            allowManualOverride ? "bg-green-500" : "bg-gray-600"
                                        )}
                                    >
                                        <div className={cn(
                                            "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                            allowManualOverride && "translate-x-7"
                                        )} />
                                    </button>
                                </div>

                                <div className="bg-[var(--bg-card)]/40 border border-[var(--border-default)] rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)]">Tarifas por Duración</h3>
                                        <button
                                            onClick={() => setDurationRates([...durationRates, { minutes: 15, price: 0 }])}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            Añadir tarifa
                                        </button>
                                    </div>
                                    {durationRates.length === 0 && (
                                        <p className="text-xs text-[var(--text-tertiary)]">Sin tarifas definidas. Se usará el precio por minuto.</p>
                                    )}
                                    {durationRates.map((rate, idx) => (
                                        <div key={`${rate.minutes}-${idx}`} className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-24 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                                value={rate.minutes}
                                                onChange={e => {
                                                    const next = [...durationRates];
                                                    next[idx] = { ...next[idx], minutes: Number(e.target.value) };
                                                    setDurationRates(next);
                                                }}
                                            />
                                            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold">min</span>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-28 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                                value={rate.price}
                                                onChange={e => {
                                                    const next = [...durationRates];
                                                    next[idx] = { ...next[idx], price: Number(e.target.value) };
                                                    setDurationRates(next);
                                                }}
                                            />
                                            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold">€</span>
                                            <button
                                                onClick={() => setDurationRates(durationRates.filter((_, i) => i !== idx))}
                                                className="ml-auto text-xs font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={saveDurationRates}
                                            className="text-xs font-bold bg-green-500/20 text-green-400 px-4 py-2 rounded-lg border border-green-500/30 hover:bg-green-500 hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            Guardar tarifas
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-[var(--bg-card)]/40 border border-[var(--border-default)] rounded-2xl p-5 space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)]">Descuentos por Duración</h3>
                                        <button
                                            onClick={() => setDiscountRules([...discountRules, { minutes: 30, type: 'flat', value: 0 }])}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-3 py-1.5 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            Añadir descuento
                                        </button>
                                    </div>
                                    {discountRules.length === 0 && (
                                        <p className="text-xs text-[var(--text-tertiary)]">Sin descuentos definidos.</p>
                                    )}
                                    {discountRules.map((rule, idx) => (
                                        <div key={`${rule.minutes}-${idx}`} className="flex items-center gap-3">
                                            <input
                                                type="number"
                                                min={1}
                                                className="w-24 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                                value={rule.minutes}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], minutes: Number(e.target.value) };
                                                    setDiscountRules(next);
                                                }}
                                            />
                                            <span className="text-xs text-[var(--text-tertiary)] uppercase font-bold">min</span>
                                            <select
                                                className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                                value={rule.type}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], type: e.target.value === 'percent' ? 'percent' : 'flat' };
                                                    setDiscountRules(next);
                                                }}
                                            >
                                                <option value="flat">€ fijo</option>
                                                <option value="percent">%</option>
                                            </select>
                                            <input
                                                type="number"
                                                step="0.01"
                                                className="w-24 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                                value={rule.value}
                                                onChange={e => {
                                                    const next = [...discountRules];
                                                    next[idx] = { ...next[idx], value: Number(e.target.value) };
                                                    setDiscountRules(next);
                                                }}
                                            />
                                            <button
                                                onClick={() => setDiscountRules(discountRules.filter((_, i) => i !== idx))}
                                                className="ml-auto text-xs font-bold bg-red-500/10 text-red-400 px-3 py-1.5 rounded-lg border border-red-500/30 hover:bg-red-500 hover:text-[var(--text-primary)] transition-colors"
                                            >
                                                Eliminar
                                            </button>
                                        </div>
                                    ))}
                                    <div className="flex justify-end">
                                        <button
                                            onClick={saveDiscountRules}
                                            className="text-xs font-bold bg-green-500/20 text-green-400 px-4 py-2 rounded-lg border border-green-500/30 hover:bg-green-500 hover:text-[var(--text-primary)] transition-colors"
                                        >
                                            Guardar descuentos
                                        </button>
                                    </div>
                                </div>

                                <div className="bg-[var(--bg-card)]/40 border border-[var(--border-default)] rounded-2xl p-5">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)] mb-3">Vista previa rápida</h3>
                                    <div className="grid grid-cols-2 gap-3 text-sm text-[var(--text-tertiary)]">
                                        {[10, 15, 30, 60].map((mins) => (
                                            <div key={mins} className="flex justify-between bg-[var(--bg-elevated)]/40 px-3 py-2 rounded-lg border border-[var(--border-default)]">
                                                <span>{mins} min</span>
                                                <span className="text-[var(--text-primary)] font-bold">€{calculatePrice(mins, false, previewConfig)}</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>

                                <div className="bg-[var(--bg-card)]/40 border border-[var(--border-default)] rounded-2xl p-5 space-y-4">
                                    <h3 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)]">Configuración de Pagos</h3>
                                    <div className="flex items-center justify-between bg-[var(--bg-card)]/50 border border-[var(--border-default)]/60 rounded-2xl p-4">
                                        <div>
                                            <p className="text-sm font-bold text-[var(--text-secondary)]">Pagos en kiosko</p>
                                            <p className="text-xs text-[var(--text-tertiary)]">Activa o desactiva el flujo de pago en el kiosko</p>
                                        </div>
                                        <button
                                            onClick={handlePaymentToggle}
                                            disabled={savingPaymentToggle}
                                            className={cn(
                                                "relative w-14 h-7 rounded-full transition-colors",
                                                paymentEnabled ? "bg-green-500" : "bg-gray-600",
                                                savingPaymentToggle && "opacity-60 cursor-not-allowed"
                                            )}
                                            aria-busy={savingPaymentToggle}
                                        >
                                            <div className={cn(
                                                "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                                paymentEnabled && "translate-x-7"
                                            )} />
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-1 gap-4">
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Moneda</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={paymentCurrency}
                                                onChange={e => setPaymentCurrency(e.target.value)}
                                                placeholder="EUR"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">URL Kiosk Público</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={paymentPublicKioskUrl}
                                                onChange={e => setPaymentPublicKioskUrl(e.target.value)}
                                                placeholder="http://localhost:3010/kiosk"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Stripe Secret Key</label>
                                            <input
                                                type="password"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeSecretKey}
                                                onChange={e => setStripeSecretKey(e.target.value)}
                                                placeholder="sk_live_..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Stripe Webhook Secret</label>
                                            <input
                                                type="password"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeWebhookSecret}
                                                onChange={e => setStripeWebhookSecret(e.target.value)}
                                                placeholder="whsec_..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Stripe Success URL</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeSuccessUrl}
                                                onChange={e => setStripeSuccessUrl(e.target.value)}
                                                placeholder="http://localhost:3010/kiosk?payment=success"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Stripe Cancel URL</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={stripeCancelUrl}
                                                onChange={e => setStripeCancelUrl(e.target.value)}
                                                placeholder="http://localhost:3010/kiosk?payment=cancel"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Bizum Receptor</label>
                                            <input
                                                type="text"
                                                className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500 transition-all"
                                                value={bizumReceiver}
                                                onChange={e => setBizumReceiver(e.target.value)}
                                                placeholder="600000000"
                                            />
                                        </div>
                                    </div>
                                    <div className="flex justify-end">
                                        <button
                                            onClick={savePaymentConfig}
                                            disabled={savingPaymentConfig}
                                            className="text-xs font-bold bg-blue-600/20 text-blue-400 px-4 py-2 rounded-lg border border-blue-500/30 hover:bg-blue-600 hover:text-[var(--text-primary)] transition-colors disabled:opacity-60"
                                        >
                                            {savingPaymentConfig ? 'Guardando...' : 'Guardar configuración'}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: SIM CONFIG --- */}
                {activeTab === 'sim' && (
                    <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                                <Zap className="mr-2 text-yellow-400" /> Configuración Global de Carrera
                            </h2>
                            <p className="text-[var(--text-tertiary)] mb-8 text-sm">Estos ajustes se aplicarán a todas las sesiones iniciadas desde el Kiosko o Dashboard.</p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                {/* Gameplay Aids */}
                                <div className="space-y-6">
                                    <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-[0.2em] border-b border-[var(--border-default)] pb-2">Ayudas y Gameplay</h3>

                                    <div className="space-y-4">
                                        <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-4 rounded-2xl border border-[var(--border-default)]/50">
                                            <div>
                                                <p className="font-bold text-[var(--text-primary)]">Modo Drift (Puntos)</p>
                                                <p className="text-xs text-[var(--text-tertiary)]">Activa el sistema de puntuación para drift</p>
                                            </div>
                                            <button
                                                onClick={() => updateBranding.mutate({ key: 'sim_drift_mode', value: safeBranding.find(s => s.key === 'sim_drift_mode')?.value === 'true' ? 'false' : 'true' })}
                                                className={cn("w-14 h-7 rounded-full transition-all relative", safeBranding.find(s => s.key === 'sim_drift_mode')?.value === 'true' ? "bg-purple-500" : "bg-gray-600")}
                                            >
                                                <div className={cn("absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform", safeBranding.find(s => s.key === 'sim_drift_mode')?.value === 'true' && "translate-x-7")} />
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div>
                                                <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-2">ABS</label>
                                                <select
                                                    className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm outline-none focus:border-blue-500"
                                                    value={safeBranding.find(s => s.key === 'sim_abs_mode')?.value || '1'}
                                                    onChange={e => updateBranding.mutate({ key: 'sim_abs_mode', value: e.target.value })}
                                                >
                                                    <option value="1">Activado (Default)</option>
                                                    <option value="0">Desactivado (Hardcore)</option>
                                                    <option value="factory">Factory (Coche)</option>
                                                </select>
                                            </div>
                                            <div>
                                                <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-2">Traction Control</label>
                                                <select
                                                    className="w-full p-3 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] text-sm outline-none focus:border-blue-500"
                                                    value={safeBranding.find(s => s.key === 'sim_tc_mode')?.value || '1'}
                                                    onChange={e => updateBranding.mutate({ key: 'sim_tc_mode', value: e.target.value })}
                                                >
                                                    <option value="1">Activado (Default)</option>
                                                    <option value="0">Desactivado (Hardcore)</option>
                                                    <option value="factory">Factory (Coche)</option>
                                                </select>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-2 gap-4">
                                            <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-3 rounded-xl border border-[var(--border-default)]/50">
                                                <div>
                                                    <p className="font-bold text-[var(--text-primary)] text-sm">Auto Clutch</p>
                                                </div>
                                                <button
                                                    onClick={() => updateBranding.mutate({ key: 'sim_autoclutch', value: safeBranding.find(s => s.key === 'sim_autoclutch')?.value === 'true' ? 'false' : 'true' })}
                                                    className={cn("w-10 h-5 rounded-full transition-all relative", safeBranding.find(s => s.key === 'sim_autoclutch')?.value === 'true' ? "bg-blue-500" : "bg-gray-600")}
                                                >
                                                    <div className={cn("absolute top-1 left-1 w-3 h-3 rounded-full bg-[var(--bg-card)] transition-transform", safeBranding.find(s => s.key === 'sim_autoclutch')?.value === 'true' && "translate-x-5")} />
                                                </button>
                                            </div>
                                            <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-3 rounded-xl border border-[var(--border-default)]/50">
                                                <div>
                                                    <p className="font-bold text-[var(--text-primary)] text-sm">Mantas Térmicas</p>
                                                </div>
                                                <button
                                                    onClick={() => updateBranding.mutate({ key: 'sim_tyre_blankets', value: safeBranding.find(s => s.key === 'sim_tyre_blankets')?.value === 'true' ? 'false' : 'true' })}
                                                    className={cn("w-10 h-5 rounded-full transition-all relative", safeBranding.find(s => s.key === 'sim_tyre_blankets')?.value === 'true' ? "bg-green-500" : "bg-gray-600")}
                                                >
                                                    <div className={cn("absolute top-1 left-1 w-3 h-3 rounded-full bg-[var(--bg-card)] transition-transform", safeBranding.find(s => s.key === 'sim_tyre_blankets')?.value === 'true' && "translate-x-5")} />
                                                </button>
                                            </div>
                                        </div>

                                        <div>
                                            <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Estabilidad (Stability Control)</label>
                                            <div className="flex items-center gap-4">
                                                <input
                                                    type="range" min="0" max="100" step="10"
                                                    className="flex-1 h-2 bg-gray-700 rounded-lg cursor-pointer accent-blue-500"
                                                    value={safeBranding.find(s => s.key === 'sim_stability')?.value || 0}
                                                    onChange={e => updateBranding.mutate({ key: 'sim_stability', value: e.target.value })}
                                                />
                                                <span className="font-mono font-bold text-blue-400 w-12 text-right">{safeBranding.find(s => s.key === 'sim_stability')?.value || 0}%</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-sm font-bold text-[var(--text-secondary)]">Consumo de Combustible ({safeBranding.find(s => s.key === 'sim_fuel_rate')?.value || 1}x)</label>
                                            <Activity size={14} className="text-orange-500" />
                                        </div>
                                        <input
                                            type="range" min="0" max="5" step="1"
                                            className="w-full h-2 bg-gray-700 rounded-lg cursor-pointer accent-orange-500"
                                            value={safeBranding.find(s => s.key === 'sim_fuel_rate')?.value || 1}
                                            onChange={e => updateBranding.mutate({ key: 'sim_fuel_rate', value: e.target.value })}
                                        />
                                    </div>

                                    <div className="space-y-2">
                                        <div className="flex justify-between items-center">
                                            <label className="text-sm font-bold text-[var(--text-secondary)]">Desgaste Neumáticos ({safeBranding.find(s => s.key === 'sim_tyre_wear')?.value || 1}x)</label>
                                            <Truck size={14} className="text-blue-500" />
                                        </div>
                                        <input
                                            type="range" min="0" max="5" step="1"
                                            className="w-full h-2 bg-gray-700 rounded-lg cursor-pointer accent-blue-500"
                                            value={safeBranding.find(s => s.key === 'sim_tyre_wear')?.value || 1}
                                            onChange={e => updateBranding.mutate({ key: 'sim_tyre_wear', value: e.target.value })}
                                        />
                                    </div>

                                    <div className="flex items-center justify-between bg-[var(--bg-card)]/40 p-4 rounded-2xl border border-[var(--border-default)]/50">
                                        <div>
                                            <p className="font-bold text-[var(--text-primary)]">Fallo Mecánico</p>
                                            <p className="text-xs text-[var(--text-tertiary)]">Daño al motor por sobrerrégimen</p>
                                        </div>
                                        <button
                                            onClick={() => updateBranding.mutate({ key: 'sim_mech_damage', value: safeBranding.find(s => s.key === 'sim_mech_damage')?.value === 'true' ? 'false' : 'true' })}
                                            className={cn("w-14 h-7 rounded-full transition-all relative", safeBranding.find(s => s.key === 'sim_mech_damage')?.value === 'true' ? "bg-red-500" : "bg-gray-600")}
                                        >
                                            <div className={cn("absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform", safeBranding.find(s => s.key === 'sim_mech_damage')?.value === 'true' && "translate-x-7")} />
                                        </button>
                                    </div>

                                    <div>
                                        <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Sanción Salida en Falso</label>
                                        <select
                                            className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-red-500"
                                            value={safeBranding.find(s => s.key === 'sim_jump_start')?.value || '1'}
                                            onChange={e => updateBranding.mutate({ key: 'sim_jump_start', value: e.target.value })}
                                        >
                                            <option value="0">Ninguna (Teletransporte a Sit)</option>
                                            <option value="1">Drive-through</option>
                                            <option value="2">Stop & Go</option>
                                        </select>
                                    </div>
                                </div>
                            </div>

                            {/* IA Configuration */}
                            <div className="mt-8 border-t border-[var(--border-default)] pt-8">
                                <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                                    <Bot size={16} className="text-purple-500" /> Configuración de IA (Rivales)
                                </h3>
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                    <div>
                                        <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Cantidad de IA</label>
                                        <input
                                            type="number"
                                            min="0" max="30"
                                            className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-purple-500"
                                            placeholder="0 (Solo hotlap)"
                                            value={safeBranding.find(s => s.key === 'sim_ai_count')?.value || '0'}
                                            onChange={e => updateBranding.mutate({ key: 'sim_ai_count', value: e.target.value })}
                                        />
                                        <p className="text-xs text-[var(--text-tertiary)] mt-2">0 = Sin rivales. Máx depende de los pits de la pista.</p>
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Nivel de Habilidad ({safeBranding.find(s => s.key === 'sim_ai_level')?.value || 90}%)</label>
                                        <input
                                            type="range" min="70" max="100" step="1"
                                            className="w-full h-2 bg-gray-700 rounded-lg cursor-pointer accent-purple-500"
                                            value={safeBranding.find(s => s.key === 'sim_ai_level')?.value || 90}
                                            onChange={e => updateBranding.mutate({ key: 'sim_ai_level', value: e.target.value })}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Agresividad ({safeBranding.find(s => s.key === 'sim_ai_aggression')?.value || 50}%)</label>
                                        <input
                                            type="range" min="0" max="100" step="5"
                                            className="w-full h-2 bg-gray-700 rounded-lg cursor-pointer accent-red-500"
                                            value={safeBranding.find(s => s.key === 'sim_ai_aggression')?.value || 50}
                                            onChange={e => updateBranding.mutate({ key: 'sim_ai_aggression', value: e.target.value })}
                                        />
                                    </div>
                                </div>
                            </div>

                            <div className="mt-8 border-t border-[var(--border-default)] pt-8">
                                <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-[0.2em] mb-6">Configuración de Neumáticos</h3>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div>
                                        <label className="block text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Compuesto por Defecto (Index o Nombre)</label>
                                        <input
                                            type="text"
                                            className="w-full p-4 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-[var(--text-primary)] font-bold outline-none focus:border-blue-500"
                                            placeholder="Semislicks, slicks, 0, 1..."
                                            defaultValue={safeBranding.find(s => s.key === 'sim_tyre_compound')?.value || 'Semislicks'}
                                            onBlur={e => updateBranding.mutate({ key: 'sim_tyre_compound', value: e.target.value })}
                                        />
                                        <p className="text-xs text-[var(--text-tertiary)] mt-2">Semislicks suele ser el neumático de calle con más agarre. '0' suele ser el primero de la lista.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: STATIONS --- */}
                {activeTab === 'stations' && (
                    <div className="space-y-4 max-w-5xl animate-in fade-in duration-300">
                        <div className="flex flex-col gap-3">
                            <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-3">
                                <h2 className="text-lg font-black text-[var(--text-primary)] uppercase tracking-wide">Simuladores</h2>
                                <div className="flex flex-wrap items-center gap-2 xl:justify-end">
                                    <button
                                        onClick={() => queryClient.invalidateQueries({ queryKey: ['stations'] })}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                                        title="Actualizar lista"
                                    >
                                        <RefreshCw size={14} /> Actualizar
                                    </button>
                                    <button
                                        onClick={() => window.location.href = '/hardware'}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2"
                                        title="Monitor de salud"
                                    >
                                        <AlertTriangle size={14} /> Salud
                                    </button>
                                    <button
                                        onClick={() => setShowInactiveStations(!showInactiveStations)}
                                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${showInactiveStations ? 'bg-blue-600 text-[var(--text-primary)]' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}
                                        title="Mostrar estaciones inactivas"
                                    >
                                        {showInactiveStations ? 'Ocultar inactivas' : 'Mostrar inactivas'}
                                    </button>
                                    <button
                                        onClick={() => setShowGhostStations(!showGhostStations)}
                                        className={`px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all ${showGhostStations ? 'bg-yellow-500 text-black' : 'bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'}`}
                                        title="Mostrar estaciones fantasma"
                                    >
                                        {showGhostStations ? 'Ocultar fantasmas' : 'Mostrar fantasmas'}
                                    </button>
                                    <select
                                        value={ghostThresholdHours}
                                        onChange={(e) => setGhostThresholdHours(Number(e.target.value))}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)] transition-all text-xs font-bold uppercase tracking-widest"
                                        title="Umbral de fantasma"
                                    >
                                        <option value={6}>Fantasma 6h</option>
                                        <option value={24}>Fantasma 24h</option>
                                        <option value={168}>Fantasma 7d</option>
                                        <option value={720}>Fantasma 30d</option>
                                    </select>
                                    <button
                                        onClick={() => {
                                            if (confirm("Archivar estaciones fantasma? Se ocultaran y no contaran en reservas.")) {
                                                archiveGhostsMutation.mutate();
                                            }
                                        }}
                                        disabled={ghostStations.length === 0 || archiveGhostsMutation.isPending}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-red-600 transition-all text-xs font-bold uppercase tracking-widest flex items-center gap-2 disabled:opacity-50"
                                        title="Archivar estaciones fantasma"
                                    >
                                        <Trash2 size={14} /> Archivar fantasmas
                                    </button>
                                </div>
                            </div>
                            <div className="flex flex-wrap items-center gap-2 text-[11px] font-bold uppercase tracking-widest">
                                <span className="px-3 py-1 rounded-full bg-[var(--bg-elevated)] text-[var(--text-secondary)]">Total: {healthSummary.total}</span>
                                <span className="px-3 py-1 rounded-full bg-green-500/20 text-green-400">Online: {healthSummary.online}</span>
                                <span className="px-3 py-1 rounded-full bg-red-500/20 text-red-400">Offline: {healthSummary.offline}</span>
                                <span className="px-3 py-1 rounded-full bg-yellow-500/20 text-yellow-400">Alertas: {healthSummary.withAlerts}</span>
                                <span className="px-3 py-1 rounded-full bg-yellow-500/10 text-yellow-300">Fantasma: {ghostStations.length}</span>
                            </div>
                            <div className="bg-[var(--bg-card)]/60 border border-[var(--border-default)] rounded-2xl p-4 flex flex-col gap-4">
                                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                    <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-widest">Auto-archivado de fantasmas</h3>
                                    <button
                                        onClick={saveGhostArchiveConfig}
                                        disabled={savingGhostArchive}
                                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest"
                                    >
                                        {savingGhostArchive ? 'Guardando...' : 'Guardar'}
                                    </button>
                                </div>
                                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 text-xs">
                                    <label className="flex flex-col gap-2 text-[var(--text-tertiary)] font-bold uppercase tracking-widest">
                                        Horas sin ver
                                        <input
                                            type="number"
                                            min={1}
                                            value={ghostArchiveHours}
                                            onChange={(e) => setGhostArchiveHours(Number(e.target.value))}
                                            className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2 text-[var(--text-tertiary)] font-bold uppercase tracking-widest">
                                        Hora (0-23)
                                        <input
                                            type="number"
                                            min={0}
                                            max={23}
                                            value={ghostArchiveHour}
                                            onChange={(e) => setGhostArchiveHour(Number(e.target.value))}
                                            className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                        />
                                    </label>
                                    <label className="flex flex-col gap-2 text-[var(--text-tertiary)] font-bold uppercase tracking-widest">
                                        Minuto
                                        <input
                                            type="number"
                                            min={0}
                                            max={59}
                                            value={ghostArchiveMinute}
                                            onChange={(e) => setGhostArchiveMinute(Number(e.target.value))}
                                            className="bg-[var(--bg-card)] border border-[var(--border-default)] rounded-lg px-3 py-2 text-[var(--text-primary)] font-bold"
                                        />
                                    </label>
                                    <label className="flex items-center gap-2 text-[var(--text-tertiary)] font-bold uppercase tracking-widest sm:col-span-2 xl:col-span-1">
                                        <input
                                            type="checkbox"
                                            checked={ghostArchiveIncludeNeverSeen}
                                            onChange={(e) => setGhostArchiveIncludeNeverSeen(e.target.checked)}
                                            className="accent-blue-500"
                                        />
                                        Incluir nunca vistas
                                    </label>
                                </div>
                                <p className="text-[10px] text-[var(--text-tertiary)]">
                                    El horario se lee al iniciar el backend. Reinicia el servidor si cambias la hora.
                                </p>
                            </div>
                        </div>

                        <div className="grid gap-4">
                            {(!stations || stations.length === 0) && (
                                <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/50 rounded-2xl p-12 text-center">
                                    <MonitorPlay className="w-16 h-16 text-gray-700 mx-auto mb-4" />
                                    <h3 className="text-xl font-bold text-[var(--text-tertiary)] mb-2">No se detectan estaciones</h3>
                                    <p className="text-gray-600">Asegúrate de que el agente (client.py) esté ejecutándose en los simuladores.</p>
                                </div>
                            )}
                            {Array.isArray(stations) && stations.length > 0 && filteredStations.length === 0 && (
                                <div className="bg-[var(--bg-elevated)]/50 border border-[var(--border-default)]/50 rounded-2xl p-8 text-center">
                                    <h3 className="text-lg font-bold text-[var(--text-tertiary)] mb-2">No hay estaciones activas</h3>
                                    <p className="text-gray-600">Activa "Mostrar inactivas" o "Mostrar fantasmas" para verlas.</p>
                                </div>
                            )}
                            {filteredStations.map((station) => {
                                const health = healthById.get(station.id);
                                const alertCount = Array.isArray(health?.alerts) ? health.alerts.length : 0;
                                const alertPreview = Array.isArray(health?.alerts) ? health.alerts.slice(0, 2) : [];
                                const isHealthOnline = typeof health?.is_online === 'boolean' ? health.is_online : station.is_online;
                                const isGhost = isGhostStation(station);
                                const statusLabel = isHealthOnline
                                    ? 'online'
                                    : (isGhost ? 'fantasma' : (station.status || 'offline'));
                                const statusClass = cn(
                                    "px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest",
                                    isHealthOnline
                                        ? 'bg-green-500/20 text-green-400'
                                        : (isGhost ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-700 text-[var(--text-tertiary)]')
                                );
                                return (
                                    <div key={station.id} className="bg-[var(--bg-elevated)] p-6 rounded-2xl border border-[var(--border-default)] flex flex-col xl:flex-row gap-4 xl:justify-between xl:items-center">
                                        <div className="flex items-start gap-4 md:gap-6 min-w-0">
                                            <div className={cn("p-4 rounded-xl", isHealthOnline ? "bg-green-500/10 text-green-400" : "bg-gray-700/50 text-[var(--text-tertiary)]")}>
                                                {isHealthOnline ? <Wifi size={24} /> : <WifiOff size={24} />}
                                            </div>
                                            <div>
                                                {editingId === station.id ? (
                                                    <div className="space-y-2">
                                                        <input
                                                            value={editForm.name}
                                                            onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                                            className="bg-[var(--bg-card)] text-[var(--text-primary)] font-bold p-2 rounded-lg border border-blue-500 outline-none w-full"
                                                            placeholder="Nombre estación"
                                                            autoFocus
                                                        />
                                                        <input
                                                            value={editForm.ip}
                                                            onChange={e => setEditForm({ ...editForm, ip: e.target.value })}
                                                            className="bg-[var(--bg-card)] text-[var(--text-primary)] p-2 rounded-lg border border-blue-500 outline-none w-full text-xs font-mono"
                                                            placeholder="IP Address (ej. 192.168.1.50)"
                                                        />
                                                        <input
                                                            value={editForm.ac_path}
                                                            onChange={e => setEditForm({ ...editForm, ac_path: e.target.value })}
                                                            className="bg-[var(--bg-card)] text-[var(--text-primary)] p-2 rounded-lg border border-blue-500 outline-none w-full text-[10px] font-mono"
                                                            placeholder="Ruta Assetto Corsa (ej. C:\AC)"
                                                        />
                                                        <label className="flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-[var(--text-tertiary)]">
                                                            <input
                                                                type="checkbox"
                                                                checked={editForm.is_vr}
                                                                onChange={(e) => setEditForm({ ...editForm, is_vr: e.target.checked })}
                                                                className="accent-blue-500"
                                                            />
                                                            VR activado
                                                        </label>
                                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-[10px]">
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Perfil de volante</span>
                                                                <select
                                                                    value={stationWheelDrafts[station.id] || ''}
                                                                    onChange={(e) => setStationWheelDrafts(prev => ({ ...prev, [station.id]: e.target.value }))}
                                                                    className="bg-[var(--bg-card)] text-[var(--text-primary)] p-2 rounded-lg border border-blue-500/40 outline-none text-[10px]"
                                                                >
                                                                    <option value="">Sin cambio</option>
                                                                    {wheelProfiles.map((profile: any) => (
                                                                        <option key={profile.id} value={String(profile.id)}>{profile.name}</option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const profileId = stationWheelDrafts[station.id];
                                                                        if (!profileId) {
                                                                            alert("Selecciona un perfil de volante.");
                                                                            return;
                                                                        }
                                                                        applyWheelProfileMutation.mutate({ stationId: station.id, profileId });
                                                                    }}
                                                                    className="bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                                                                >
                                                                    Aplicar perfil
                                                                </button>
                                                            </div>
                                                            <div className="flex flex-col gap-1">
                                                                <span className="font-bold uppercase tracking-widest text-[var(--text-tertiary)]">Presets (Gráficos / IA)</span>
                                                                <select
                                                                    value={stationPresetDrafts[station.id]?.video || ''}
                                                                    onChange={(e) => setStationPresetDrafts(prev => ({
                                                                        ...prev,
                                                                        [station.id]: { ...prev[station.id], video: e.target.value }
                                                                    }))}
                                                                    className="bg-[var(--bg-card)] text-[var(--text-primary)] p-2 rounded-lg border border-blue-500/40 outline-none text-[10px]"
                                                                >
                                                                    <option value="">Gráficos (sin cambio)</option>
                                                                    {(profiles?.video || []).map((profile: string) => (
                                                                        <option key={profile} value={profile}>{profile}</option>
                                                                    ))}
                                                                </select>
                                                                <select
                                                                    value={stationPresetDrafts[station.id]?.race || ''}
                                                                    onChange={(e) => setStationPresetDrafts(prev => ({
                                                                        ...prev,
                                                                        [station.id]: { ...prev[station.id], race: e.target.value }
                                                                    }))}
                                                                    className="bg-[var(--bg-card)] text-[var(--text-primary)] p-2 rounded-lg border border-blue-500/40 outline-none text-[10px]"
                                                                >
                                                                    <option value="">IA / Carrera (sin cambio)</option>
                                                                    {(profiles?.race || []).map((profile: string) => (
                                                                        <option key={profile} value={profile}>{profile}</option>
                                                                    ))}
                                                                </select>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => {
                                                                        const draft = stationPresetDrafts[station.id];
                                                                        const deployMap: Record<string, string> = {};
                                                                        if (draft?.video) deployMap.video = draft.video;
                                                                        if (draft?.race) deployMap.race = draft.race;
                                                                        if (Object.keys(deployMap).length === 0) {
                                                                            alert("Selecciona al menos un preset.");
                                                                            return;
                                                                        }
                                                                        applyStationPresetsMutation.mutate({ stationId: station.id, deployMap });
                                                                    }}
                                                                    className="bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest"
                                                                >
                                                                    Aplicar presets
                                                                </button>
                                                            </div>
                                                        </div>
                                                    </div>
                                                ) : (
                                                    <div className="flex flex-col">
                                                        <div className="flex items-center space-x-2">
                                                            <h3 className="text-lg font-black text-[var(--text-primary)] uppercase">{station.name}</h3>
                                                            <button
                                                                onClick={() => {
                                                                    setEditingId(station.id);
                                                                    setEditForm({
                                                                        name: station.name,
                                                                        ip: station.ip_address,
                                                                        ac_path: station.ac_path || '',
                                                                        is_vr: !!station.is_vr
                                                                    });
                                                                }}
                                                                className="text-gray-600 hover:text-[var(--text-primary)]"
                                                            >
                                                                <Edit2 size={14} />
                                                            </button>
                                                        </div>
                                                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[10px] font-mono text-[var(--text-tertiary)] uppercase font-black tracking-widest">
                                                            <span>{station.hostname}</span>
                                                            <span>•</span>
                                                            <span>{station.ip_address}</span>
                                                        </div>
                                                        {station.ac_path && (
                                                            <div className="text-[9px] text-gray-600 font-mono mt-1 opacity-60">📁 {station.ac_path}</div>
                                                        )}
                                                        <div className="text-[9px] text-gray-600 font-mono mt-1 opacity-60">
                                                            Visto: {formatLastSeen(station.last_seen)}
                                                        </div>
                                                        <div className="text-[9px] text-[var(--text-tertiary)] font-mono mt-2 flex flex-wrap items-center gap-2 bg-[var(--bg-card)]/50 p-1.5 rounded w-full sm:w-fit border border-[var(--border-default)]/50">
                                                            <span className="font-bold text-[var(--text-tertiary)]">KIOSK CODE:</span>
                                                            <span className="text-[var(--text-primary)] font-black tracking-widest text-xs select-all cursor-text break-all">{station.kiosk_code || '---'}</span>
                                                            <div className="h-3 w-[1px] bg-gray-700 mx-1"></div>
                                                            <button
                                                                onClick={() => copyToClipboard(buildKioskLink(station.kiosk_code))}
                                                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                                                title="Copiar link"
                                                            >
                                                                <Copy size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => window.open(buildKioskLink(station.kiosk_code), '_blank')}
                                                                className="text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                                                title="Abrir kiosko"
                                                            >
                                                                <Link2 size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => setQrStationId(qrStationId === station.id ? null : station.id)}
                                                                className={cn("hover:text-[var(--text-primary)]", qrStationId === station.id ? "text-blue-400" : "text-[var(--text-tertiary)]")}
                                                                title="Ver QR"
                                                            >
                                                                <QrCode size={12} />
                                                            </button>
                                                            <button
                                                                onClick={() => {
                                                                    if (confirm("¿Regenerar código de Kiosko? El código actual dejará de funcionar.")) {
                                                                        kioskCodeMutation.mutate(station.id);
                                                                    }
                                                                }}
                                                                className="text-[var(--text-tertiary)] hover:text-yellow-400 ml-1"
                                                                title="Regenerar código"
                                                            >
                                                                <RefreshCw size={10} />
                                                            </button>
                                                        </div>

                                                        {station.kiosk_code && qrStationId === station.id && (
                                                            <div className="mt-3 inline-flex items-center gap-3 bg-[var(--bg-card)]/60 border border-[var(--border-default)] rounded-xl px-3 py-2">
                                                                <QRCodeCanvas value={buildKioskLink(station.kiosk_code)} size={72} bgColor="#0f172a" fgColor="#e5e7eb" />
                                                                <div className="text-[9px] text-[var(--text-tertiary)]">
                                                                    <div className="font-bold uppercase tracking-widest">QR Kiosko</div>
                                                                    <div className="mt-1">Escanea para abrir</div>
                                                                </div>
                                                            </div>
                                                        )}
                                                        {alertCount > 0 && (
                                                            <div className="text-[10px] text-yellow-300 font-bold mt-2 flex items-center gap-2">
                                                                <AlertTriangle size={12} />
                                                                <span>{alertCount} alertas</span>
                                                                <span className="text-[var(--text-tertiary)] font-normal">
                                                                    {alertPreview.join(', ')}
                                                                </span>
                                                            </div>
                                                        )}
                                                        {alertCount === 0 && health && !isHealthOnline && (
                                                            <div className="text-[10px] text-red-400 font-bold mt-2 flex items-center gap-2">
                                                                <AlertTriangle size={12} />
                                                                <span>Sin respuesta</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 self-start xl:self-auto">
                                            <div className="flex flex-col items-start xl:items-end gap-2">
                                                <span className={statusClass}>
                                                    {statusLabel}
                                                </span>
                                                <div className="flex flex-wrap items-center justify-start xl:justify-end gap-2 max-w-full xl:max-w-[260px]">
                                                    <button
                                                        onClick={() => testConnectionMutation.mutate(station.id)}
                                                        className="p-2 bg-gray-700/60 text-[var(--text-secondary)] rounded-lg hover:bg-gray-600 hover:text-[var(--text-primary)] transition-all"
                                                        title="Test de conexion"
                                                    >
                                                        <CheckCircle size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => setSearchParams({ tab: 'logs', source: station.hostname || station.name })}
                                                        className="p-2 bg-gray-700/60 text-[var(--text-secondary)] rounded-lg hover:bg-gray-600 hover:text-[var(--text-primary)] transition-all"
                                                        title="Ver logs del agente"
                                                    >
                                                        <Terminal size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => kioskToggleMutation.mutate({ id: station.id, enabled: !station.is_kiosk_mode })}
                                                        className={`p-2 rounded-lg transition-all ${station.is_kiosk_mode ? 'bg-blue-600 text-[var(--text-primary)]' : 'bg-gray-700/60 text-[var(--text-secondary)] hover:bg-gray-600 hover:text-[var(--text-primary)]'}`}
                                                        title="Toggle kiosko"
                                                    >
                                                        <MonitorPlay size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => station.is_locked ? unlockMutation.mutate(station.id) : lockMutation.mutate(station.id)}
                                                        className={`p-2 rounded-lg transition-all ${station.is_locked ? 'bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500 hover:text-black' : 'bg-gray-700/60 text-[var(--text-secondary)] hover:bg-gray-600 hover:text-[var(--text-primary)]'}`}
                                                        title={station.is_locked ? "Desbloquear estacion" : "Bloquear estacion"}
                                                    >
                                                        {station.is_locked ? <Unlock size={14} /> : <Lock size={14} />}
                                                    </button>
                                                    <button
                                                        onClick={() => powerMutation.mutate({ id: station.id, action: 'power-on' })}
                                                        className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-[var(--text-primary)] transition-all"
                                                        title="Encender (Wake-on-LAN)"
                                                    >
                                                        <Zap size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => scanContentMutation.mutate(station.id)}
                                                        disabled={!isHealthOnline || scanContentMutation.isPending}
                                                        className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
                                                        title="Escanear contenido AC"
                                                    >
                                                        <Monitor size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { setContentStationId(station.id); setContentTab('cars'); }}
                                                        className="p-2 bg-gray-700/60 text-[var(--text-secondary)] rounded-lg hover:bg-gray-600 hover:text-[var(--text-primary)] transition-all"
                                                        title="Ver contenido escaneado"
                                                    >
                                                        <Layout size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => syncContentMutation.mutate(station.id)}
                                                        disabled={!isHealthOnline || syncContentMutation.isPending}
                                                        className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
                                                        title="Forzar sync de contenido"
                                                    >
                                                        <RefreshCw size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => restartAgentMutation.mutate(station.id)}
                                                        disabled={!isHealthOnline || restartAgentMutation.isPending}
                                                        className="p-2 bg-purple-500/10 text-purple-400 rounded-lg hover:bg-purple-500 hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
                                                        title="Reiniciar agente"
                                                    >
                                                        <RotateCw size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { if (confirm("¿Reiniciar estacion?")) powerMutation.mutate({ id: station.id, action: 'restart' }) }}
                                                        disabled={!isHealthOnline}
                                                        className="p-2 bg-blue-500/10 text-blue-500 rounded-lg hover:bg-blue-500 hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
                                                        title="Reiniciar PC"
                                                    >
                                                        <Activity size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { if (confirm("¡EMERGENCIA! ¿Forzar cierre del juego?")) powerMutation.mutate({ id: station.id, action: 'panic' }) }}
                                                        disabled={!isHealthOnline}
                                                        className="p-2 bg-yellow-500/10 text-yellow-500 rounded-lg hover:bg-yellow-500 hover:text-black transition-all disabled:opacity-50"
                                                        title="Boton panico (cerrar AC)"
                                                    >
                                                        <AlertTriangle size={14} />
                                                    </button>
                                                    <button
                                                        onClick={() => { if (confirm("¿Apagar estacion?")) powerMutation.mutate({ id: station.id, action: 'shutdown' }) }}
                                                        className="p-2 bg-red-500/10 text-red-500 rounded-lg hover:bg-red-500 hover:text-[var(--text-primary)] transition-all"
                                                        title="Apagar PC"
                                                    >
                                                        <Power size={14} />
                                                    </button>
                                                    {(station.is_active === false || station.status === 'archived') && (
                                                        <button
                                                            onClick={() => reactivateStationMutation.mutate(station.id)}
                                                            className="p-2 bg-green-500/10 text-green-500 rounded-lg hover:bg-green-500 hover:text-[var(--text-primary)] transition-all"
                                                            title="Reactivar estacion"
                                                        >
                                                            <RefreshCw size={14} />
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => {
                                                            if (confirm("¿Eliminar estacion? Solo se permite si esta offline.")) {
                                                                deleteStationMutation.mutate(station.id);
                                                            }
                                                        }}
                                                        disabled={isHealthOnline}
                                                        className="p-2 bg-gray-700/60 text-[var(--text-secondary)] rounded-lg hover:bg-red-600 hover:text-[var(--text-primary)] transition-all disabled:opacity-50"
                                                        title="Eliminar estacion"
                                                    >
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                            {editingId === station.id && (
                                                <button
                                                    onClick={() => stationMutation.mutate({
                                                        id: station.id,
                                                        data: {
                                                            name: editForm.name,
                                                            ip_address: editForm.ip,
                                                            ac_path: editForm.ac_path,
                                                            is_vr: editForm.is_vr
                                                        }
                                                    })}
                                                    className="bg-blue-600 p-2 rounded-lg text-[var(--text-primary)] hover:bg-blue-500"
                                                >
                                                    <CheckCircle size={20} />
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )
                }

                {/* --- TAB: GAME (AC EDITOR) --- */}
                {
                    activeTab === 'game' && (
                        <div className="max-w-6xl space-y-8 animate-in fade-in duration-300">
                            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
                                {/* Categories Selector */}
                                <div className="space-y-2">
                                    <h3 className="text-xs font-black text-[var(--text-tertiary)] uppercase tracking-widest pl-2 mb-4">Categorías .ini</h3>
                                    {AC_CATEGORIES.map(cat => (
                                        <button
                                            key={cat.id}
                                            onClick={() => {
                                                if (!confirmDiscardEditorChanges()) return;
                                                setSelectedCategory(cat.id);
                                            }}
                                            className={cn(
                                                "w-full flex items-center justify-between p-4 rounded-2xl border transition-all font-bold",
                                                selectedCategory === cat.id
                                                    ? "bg-[var(--bg-elevated)] border-blue-500/50 text-[var(--text-primary)] shadow-lg"
                                                    : "bg-[var(--bg-card)]/50 border-transparent text-[var(--text-tertiary)] hover:bg-[var(--bg-card-hover)]"
                                            )}
                                        >
                                            <div className="flex items-center gap-3">
                                                <cat.icon size={18} className={cat.color} />
                                                <span>{cat.name}</span>
                                            </div>
                                        </button>
                                    ))}
                                </div>

                                {/* Profiles and Deployment */}
                                <div className="lg:col-span-3 space-y-6">
                                    <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                                        <div className="flex justify-between items-center mb-8">
                                            <h3 className="text-xl font-black text-[var(--text-primary)] uppercase flex items-center gap-3">
                                                <FileText className="text-blue-400" /> Perfiles Disponibles
                                            </h3>
                                            <button
                                                onClick={() => {
                                                    if (!confirmDiscardEditorChanges()) return;
                                                    setNewProfileName('');
                                                    setIsEditorOpen(true);
                                                }}
                                                className="bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] px-4 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all shadow-lg"
                                            >
                                                <Plus size={16} /> Crear Nuevo
                                            </button>
                                        </div>

                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {profiles?.[selectedCategory]?.map((profile: string) => (
                                                <div key={profile} className="bg-[var(--bg-card)]/50 p-4 rounded-2xl border border-[var(--border-default)] flex flex-col gap-4">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="text-[var(--text-primary)] font-black uppercase text-sm">{profile.replace('.ini', '')}</p>
                                                            <p className="text-[10px] text-[var(--text-tertiary)] font-mono mt-0.5">{profile}</p>
                                                        </div>
                                                        <button onClick={() => handleEditProfile(profile)} className="text-[var(--text-tertiary)] hover:text-blue-400"><Edit2 size={16} /></button>
                                                    </div>
                                                    <button
                                                        onClick={() => setSelectedProfiles(prev => ({
                                                            ...prev,
                                                            [selectedCategory]: profile
                                                        }))}
                                                        className={cn(
                                                            "w-full py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border",
                                                            selectedProfiles[selectedCategory] === profile
                                                                ? "bg-blue-500/20 text-blue-400 border-blue-500/50"
                                                                : "bg-[var(--bg-elevated)] text-[var(--text-tertiary)] border-transparent hover:border-[var(--border-strong)]"
                                                        )}
                                                    >
                                                        {selectedProfiles[selectedCategory] === profile ? 'SELECCIONADO PARA DESPLIEGUE' : 'SELECCIONAR'}
                                                    </button>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Deployment & Reliability */}
                                    <div className="space-y-6">
                                        <div className="bg-blue-900/10 border border-blue-500/20 p-8 rounded-3xl flex flex-col gap-6">
                                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                                <div>
                                                    <h4 className="text-lg font-black text-[var(--text-primary)] uppercase">Lanzar Configuración</h4>
                                                    <p className="text-sm text-[var(--text-tertiary)]">
                                                        Se enviarán {Object.keys(selectedProfiles).length} perfiles a
                                                        {selectedStationIds.length > 0 ? ` ${selectedStationIds.length} estación(es)` : ' TODAS las estaciones activas'}.
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-3">
                                                    <span className="text-xs font-bold text-[var(--text-tertiary)]">Preflight estricto</span>
                                                    <button
                                                        onClick={() => setStrictDeploy((prev) => !prev)}
                                                        className={cn(
                                                            "relative w-14 h-7 rounded-full transition-colors",
                                                            strictDeploy ? "bg-blue-500" : "bg-gray-600"
                                                        )}
                                                    >
                                                        <div className={cn(
                                                            "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                                            strictDeploy && "translate-x-7"
                                                        )} />
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="flex flex-wrap gap-2">
                                                {Array.isArray(stations) && stations.filter((s: any) => s.is_active !== false).map((s: any) => (
                                                    <button
                                                        key={s.id}
                                                        onClick={() => setSelectedStationIds(prev => prev.includes(s.id) ? prev.filter(id => id !== s.id) : [...prev, s.id])}
                                                        className={cn(
                                                            "px-3 py-1.5 rounded-lg text-[10px] font-black transition-all border",
                                                            selectedStationIds.includes(s.id)
                                                                ? "bg-blue-600 border-blue-400 text-[var(--text-primary)]"
                                                                : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-tertiary)]"
                                                        )}
                                                    >
                                                        {s.name}{s.is_online ? '' : ' (offline)'}
                                                    </button>
                                                ))}
                                            </div>

                                            <div className="flex flex-wrap items-center gap-3">
                                                <button
                                                    onClick={() => {
                                                        const ids = (stations || [])
                                                            .filter((s: any) => s.is_active !== false)
                                                            .map((s: any) => s.id);
                                                        setSelectedStationIds(ids);
                                                    }}
                                                    className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)]"
                                                >
                                                    Seleccionar todas
                                                </button>
                                                <button
                                                    onClick={() => setSelectedStationIds([])}
                                                    className="px-3 py-2 rounded-lg bg-[var(--bg-card)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
                                                >
                                                    Limpiar selección
                                                </button>
                                                <button
                                                    disabled={deployMutation.isPending || Object.keys(selectedProfiles).length === 0}
                                                    onClick={() => deployMutation.mutate()}
                                                    className="ml-auto bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-[var(--text-primary)] px-8 py-4 rounded-2xl font-black uppercase tracking-widest transition-all shadow-[0_0_30px_rgba(37,99,235,0.3)] flex items-center gap-3"
                                                >
                                                    <Upload size={20} />
                                                    {deployMutation.isPending ? 'DESPLEGANDO...' : 'DESPLEGAR AHORA'}
                                                </button>
                                            </div>
                                        </div>

                                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                                            <div className="bg-[var(--bg-elevated)] p-6 rounded-3xl border border-[var(--border-default)] space-y-4">
                                                <h4 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                                                    <Layout size={16} className="text-blue-400" /> Grupos De Estaciones
                                                </h4>
                                                <div className="flex gap-2">
                                                    <input
                                                        value={newGroupName}
                                                        onChange={(e) => setNewGroupName(e.target.value)}
                                                        placeholder="Nombre del grupo"
                                                        className="flex-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]"
                                                    />
                                                    <button
                                                        onClick={() => {
                                                            const name = newGroupName.trim();
                                                            if (!name) return;
                                                            if (selectedStationIds.length === 0) {
                                                                alert("Selecciona estaciones para guardar el grupo.");
                                                                return;
                                                            }
                                                            saveGroupMutation.mutate({ name, station_ids: selectedStationIds });
                                                        }}
                                                        className="px-3 py-2 rounded-xl bg-blue-600 text-[var(--text-primary)] text-xs font-bold hover:bg-blue-500"
                                                    >
                                                        Guardar
                                                    </button>
                                                </div>

                                                <div className="flex gap-2">
                                                    <select
                                                        value={selectedGroupName}
                                                        onChange={(e) => setSelectedGroupName(e.target.value)}
                                                        className="flex-1 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-xl px-3 py-2 text-sm text-[var(--text-primary)]"
                                                    >
                                                        <option value="">Selecciona grupo</option>
                                                        {stationGroups.map((group) => (
                                                            <option key={group.name} value={group.name}>
                                                                {group.name} ({group.station_ids.length})
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <button
                                                        onClick={() => {
                                                            if (!selectedGroupName) return;
                                                            applyGroupSelection(selectedGroupName);
                                                        }}
                                                        className="px-3 py-2 rounded-xl bg-gray-700 text-[var(--text-primary)] text-xs font-bold hover:bg-gray-600"
                                                    >
                                                        Cargar
                                                    </button>
                                                    <button
                                                        onClick={() => {
                                                            if (!selectedGroupName) return;
                                                            if (confirm(`¿Eliminar grupo "${selectedGroupName}"?`)) {
                                                                deleteGroupMutation.mutate(selectedGroupName);
                                                            }
                                                        }}
                                                        className="px-3 py-2 rounded-xl bg-red-500/20 border border-red-500/30 text-red-300 text-xs font-bold hover:bg-red-500 hover:text-[var(--text-primary)]"
                                                    >
                                                        Borrar
                                                    </button>
                                                </div>
                                            </div>

                                            <div className="bg-[var(--bg-elevated)] p-6 rounded-3xl border border-[var(--border-default)] space-y-4">
                                                <h4 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                                                    <ShieldCheck size={16} className="text-green-400" /> Presets Hardware y Modo Seguro
                                                </h4>
                                                <div className="grid grid-cols-1 gap-3">
                                                    <div className="flex items-center justify-between">
                                                        <span className="text-xs text-[var(--text-tertiary)]">Modo seguro de validación</span>
                                                        <button
                                                            onClick={() => {
                                                                const next = !safeModeEnabled;
                                                                setSafeModeEnabled(next);
                                                                safeModeMutation.mutate(next);
                                                            }}
                                                            className={cn(
                                                                "relative w-14 h-7 rounded-full transition-colors",
                                                                safeModeEnabled ? "bg-green-500" : "bg-gray-600"
                                                            )}
                                                        >
                                                            <div className={cn(
                                                                "absolute top-1 left-1 w-5 h-5 rounded-full bg-[var(--bg-card)] transition-transform",
                                                                safeModeEnabled && "translate-x-7"
                                                            )} />
                                                        </button>
                                                    </div>

                                                    <div className="grid grid-cols-2 gap-2">
                                                        <button
                                                            onClick={() => setHardwarePresetDrafts((prev) => ({ ...prev, vr: { ...selectedProfiles } }))}
                                                            className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:border-blue-500"
                                                        >
                                                            Guardar desde selección -&gt; VR
                                                        </button>
                                                        <button
                                                            onClick={() => setHardwarePresetDrafts((prev) => ({ ...prev, flat: { ...selectedProfiles } }))}
                                                            className="px-3 py-2 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] text-xs font-bold text-[var(--text-secondary)] hover:border-blue-500"
                                                        >
                                                            Guardar desde selección -&gt; FLAT
                                                        </button>
                                                        <button
                                                            onClick={() => applyHardwarePreset('vr')}
                                                            className="px-3 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-xs font-bold text-blue-300 hover:bg-blue-600 hover:text-[var(--text-primary)]"
                                                        >
                                                            Aplicar preset VR
                                                        </button>
                                                        <button
                                                            onClick={() => applyHardwarePreset('flat')}
                                                            className="px-3 py-2 rounded-xl bg-blue-600/20 border border-blue-500/30 text-xs font-bold text-blue-300 hover:bg-blue-600 hover:text-[var(--text-primary)]"
                                                        >
                                                            Aplicar preset FLAT
                                                        </button>
                                                    </div>
                                                    <button
                                                        onClick={() => saveHardwarePresetsMutation.mutate(hardwarePresetDrafts)}
                                                        className="px-3 py-2 rounded-xl bg-green-600/20 border border-green-500/30 text-xs font-bold text-green-300 hover:bg-green-600 hover:text-[var(--text-primary)]"
                                                    >
                                                        Guardar presets de hardware
                                                    </button>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-[var(--bg-elevated)] p-6 rounded-3xl border border-[var(--border-default)] space-y-4">
                                            <h4 className="text-sm font-black uppercase tracking-wider text-[var(--text-secondary)] flex items-center gap-2">
                                                <History size={16} className="text-cyan-400" /> Historial De Despliegues
                                            </h4>
                                            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                                                <div className="space-y-2 max-h-64 overflow-auto pr-1">
                                                    {deployJobs.length === 0 && (
                                                        <p className="text-xs text-[var(--text-tertiary)]">No hay trabajos de despliegue todavía.</p>
                                                    )}
                                                    {deployJobs.map((job) => (
                                                        <button
                                                            key={job.job_id}
                                                            onClick={() => setActiveDeployJobId(job.job_id)}
                                                            className={cn(
                                                                "w-full text-left p-3 rounded-xl border transition-all",
                                                                activeDeployJobId === job.job_id
                                                                    ? "bg-blue-600/20 border-blue-500/40"
                                                                    : "bg-[var(--bg-card)]/40 border-[var(--border-default)] hover:border-gray-500"
                                                            )}
                                                        >
                                                            <div className="flex items-center justify-between gap-2">
                                                                <span className="text-xs font-bold text-[var(--text-primary)]">{job.job_id.slice(0, 8)}</span>
                                                                <span className="text-[10px] font-bold uppercase text-[var(--text-tertiary)]">{job.status}</span>
                                                            </div>
                                                            <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                                                                ok:{job.summary?.success ?? 0} fail:{job.summary?.failed ?? 0} running:{job.summary?.running ?? 0}
                                                            </p>
                                                            {(job.summary?.failed || 0) > 0 && (
                                                                <div className="mt-2">
                                                                    <button
                                                                        onClick={(e) => {
                                                                            e.stopPropagation();
                                                                            retryDeployMutation.mutate(job.job_id);
                                                                        }}
                                                                        className="px-2 py-1 rounded-md bg-yellow-500/10 border border-yellow-500/30 text-yellow-300 text-[10px] font-bold hover:bg-yellow-500 hover:text-black"
                                                                    >
                                                                        Reintentar fallidas
                                                                    </button>
                                                                </div>
                                                            )}
                                                        </button>
                                                    ))}
                                                </div>
                                                <div className="bg-[var(--bg-card)]/40 border border-[var(--border-default)] rounded-xl p-3 max-h-64 overflow-auto">
                                                    {!deployJobDetail && (
                                                        <p className="text-xs text-[var(--text-tertiary)]">Selecciona un trabajo para ver detalle.</p>
                                                    )}
                                                    {deployJobDetail && (
                                                        <div className="space-y-2">
                                                            {Object.values(deployJobDetail.station_results || {}).map((station) => (
                                                                <div key={station.station_id} className="p-2 rounded-lg border border-[var(--border-default)] bg-[var(--bg-card)]/60">
                                                                    <div className="flex justify-between">
                                                                        <span className="text-xs font-bold text-[var(--text-primary)]">{station.station_name}</span>
                                                                        <span className="text-[10px] uppercase text-[var(--text-tertiary)]">{station.status}</span>
                                                                    </div>
                                                                    {station.error && <p className="text-[11px] text-red-400 mt-1">{station.error}</p>}
                                                                    {(station.preflight?.errors || []).length > 0 &&
                                                                        <p className="text-[11px] text-orange-400 mt-1">
                                                                            Preflight: {(station.preflight?.errors || []).slice(0, 2).join(' | ')}
                                                                        </p>
                                                                    }
                                                                </div>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                            <div className="pt-2 border-t border-[var(--border-default)]">
                                                <p className="text-[11px] text-[var(--text-tertiary)] mb-2">Auditoría reciente</p>
                                                <div className="max-h-32 overflow-auto space-y-1">
                                                    {deployAudit.slice(0, 8).map((entry, idx) => (
                                                        <p key={idx} className="text-[10px] text-[var(--text-tertiary)]">
                                                            [{entry?.event}] {entry?.payload?.job_id || ''} {entry?.payload?.status || ''}
                                                        </p>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }



                {/* --- TAB: LOGS --- */}
                {
                    activeTab === 'logs' && (
                        <div className="max-w-5xl animate-in fade-in duration-300">
                            <LogViewer />
                        </div>
                    )
                }

                {/* --- TAB: DATABASE --- */}
                {
                    activeTab === 'database' && (
                        <div className="max-w-5xl animate-in fade-in duration-300">
                            <SystemUpdatePanel />
                            <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                                <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center"><Database className="mr-2 text-blue-500" /> Copia de Seguridad</h2>
                                <p className="text-[var(--text-tertiary)] mb-8 font-medium">Gestiona la integridad de tus datos. Descarga copias de seguridad regularmente.</p>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                    <div className="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-default)] flex flex-col items-center text-center">
                                        <div className="bg-blue-500/10 p-4 rounded-full mb-4">
                                            <Upload className="text-blue-500" size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Exportar Datos</h3>
                                        <p className="text-[var(--text-tertiary)] text-xs mb-6">Descarga un archivo JSON con todos los eventos, pilotos, resultados y configuraciones.</p>
                                        <button onClick={handleExport} className="w-full bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-bold py-3 rounded-xl transition-colors">
                                            DESCARGAR BACKUP
                                        </button>
                                    </div>

                                    <div className="bg-[var(--bg-card)] p-6 rounded-2xl border border-[var(--border-default)] flex flex-col items-center text-center">
                                        <div className="bg-orange-500/10 p-4 rounded-full mb-4">
                                            <Database className="text-orange-500" size={32} />
                                        </div>
                                        <h3 className="text-lg font-bold text-[var(--text-primary)] mb-2">Restaurar Datos</h3>
                                        <p className="text-[var(--text-tertiary)] text-xs mb-6">Restaura el sistema desde un archivo. <span className="text-red-400 font-bold">ESTO BORRARÁ LOS DATOS ACTUALES.</span></p>
                                        <label className="w-full bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold py-3 rounded-xl transition-colors cursor-pointer border border-[var(--border-default)] hover:border-gray-500">
                                            SELECCIONAR ARCHIVO
                                            <input type="file" hidden onChange={handleImport} accept=".json" />
                                        </label>
                                    </div>
                                </div>
                            </div>
                        </div>
                    )
                }

                {/* --- TAB: STREAMING OPTIMIZATION --- */}
                {activeTab === 'streaming' && (
                    <div className="max-w-4xl space-y-8 animate-in fade-in duration-300">
                        <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)]">
                            <h2 className="text-xl font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                                <Radio className="mr-3 text-red-500 animate-pulse" /> Optimización de Streaming Live
                            </h2>
                            <p className="text-[var(--text-secondary)] mb-8 leading-relaxed">
                                Para reducir el **lag y delay** al mínimo (idealmente menos de 1 segundo), se recomienda el uso de 
                                el protocolo **WHEP (WebRTC-HTTP Egress Protocol)** sobre una red local de baja latencia.
                            </p>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                                <div className="bg-[var(--bg-card)]/40 p-5 rounded-2xl border border-[var(--border-default)]">
                                    <h4 className="text-xs font-black text-[var(--text-tertiary)] uppercase mb-3 text-blue-400">Configuración OBS / Encoder</h4>
                                    <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Encoder: <strong>NVIDIA NVENC H.264</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Profile: <strong>High</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Rate Control: <strong>CBR (4000-6000 Kbps)</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Preset: <strong>P1 to P3 (Ultra Low Latency)</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Tuning: <strong>Ultra Low Latency</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> B-frames: <strong>0</strong></li>
                                    </ul>
                                </div>

                                <div className="bg-[var(--bg-card)]/40 p-5 rounded-2xl border border-[var(--border-default)]">
                                    <h4 className="text-xs font-black text-[var(--text-tertiary)] uppercase mb-3">Infraestructura (Servidor)</h4>
                                    <ul className="space-y-2 text-xs text-[var(--text-secondary)]">
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Software: <strong>MediaMTX (rtsp-simple-server)</strong></li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Soporte WHEP Nativo activado</li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Red Local Gigabit (Cable Ethernet)</li>
                                        <li className="flex items-center gap-2"><CheckCircle size={14} className="text-green-500" /> Desactivar Firewall en puerto UDP WebRTC</li>
                                    </ul>
                                </div>
                            </div>

                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-4 rounded-xl flex items-start gap-3 mt-8">
                                <AlertTriangle className="text-yellow-500 shrink-0" size={20} />
                                <div>
                                    <p className="text-xs font-bold text-yellow-400 uppercase">Nota sobre navegadores</p>
                                    <p className="text-[11px] text-[var(--text-tertiary)] mt-1">
                                        WHEP/WebRTC requiere HTTPS para funcionar en la mayoría de navegadores modernos si no se accede via localhost.
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                {/* --- TAB: MAINTENANCE & HARDWARE --- */}
                {activeTab === 'maintenance' && (
                    <div className="max-w-6xl space-y-8 animate-in fade-in duration-300">
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-1 space-y-6">
                                <div className="bg-[var(--bg-elevated)] p-6 rounded-3xl border border-[var(--border-default)]">
                                    <h2 className="text-lg font-black text-[var(--text-primary)] uppercase mb-6 flex items-center">
                                        <Cpu className="mr-3 text-blue-500" /> <HardDrive className="mr-2" size={18} /> Resumen Hardware
                                    </h2>
                                    <div className="space-y-4">
                                        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]">
                                            <p className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Total Horas PC (todos los puestos)</p>
                                            <p className="text-2xl font-black text-blue-400">
                                                {usageSummary ? `${usageSummary.total_hours_pc.toLocaleString()}h` : '—'}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]">
                                            <p className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Horas Base (volante/pedales)</p>
                                            <p className="text-2xl font-black text-emerald-400">
                                                {usageSummary ? `${usageSummary.total_hours_base.toLocaleString()}h` : '—'}
                                            </p>
                                        </div>
                                        <div className="p-4 rounded-2xl bg-[var(--bg-card)] border border-[var(--border-default)]">
                                            <p className="text-[10px] font-black text-[var(--text-tertiary)] uppercase tracking-widest mb-1">Puestos con datos de uso</p>
                                            <p className="text-2xl font-black text-gray-300">
                                                {usageSummary ? usageSummary.station_count : '—'}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="lg:col-span-2">
                                <div className="bg-[var(--bg-elevated)] p-8 rounded-3xl border border-[var(--border-default)] h-full">
                                    <div className="flex items-center justify-between mb-8">
                                        <h2 className="text-xl font-black text-[var(--text-primary)] uppercase flex items-center">
                                            <Wrench className="mr-3 text-[var(--text-tertiary)]" /> Historial Técnico
                                        </h2>
                                    </div>

                                    <div className="space-y-3">
                                        {maintenanceLogs.length === 0 ? (
                                            <div className="py-12 text-center">
                                                <Info size={32} className="mx-auto mb-3 text-[var(--text-tertiary)] opacity-40" />
                                                <p className="text-sm text-[var(--text-tertiary)]">Sin registros de mantenimiento aún.</p>
                                                <p className="text-xs text-[var(--text-tertiary)] mt-1 opacity-60">Usa el endpoint <code>POST /maintenance/logs</code> para registrar intervenciones.</p>
                                            </div>
                                        ) : maintenanceLogs.slice(0, 10).map((log: any) => (
                                            <div key={log.id} className="p-5 rounded-2xl bg-[var(--bg-card)]/40 border border-[var(--border-default)] hover:border-blue-500/30 transition-all">
                                                <div className="flex justify-between items-start mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-blue-500/20 text-blue-400 uppercase tracking-tighter">
                                                            #{log.station_id}
                                                        </span>
                                                        <span className="text-sm font-bold text-[var(--text-primary)]">{log.action}</span>
                                                        {log.component_type && (
                                                            <span className="text-[10px] text-[var(--text-tertiary)] bg-[var(--bg-card)] px-2 py-0.5 rounded-full">{log.component_type}</span>
                                                        )}
                                                    </div>
                                                    <span className="text-[10px] font-bold text-[var(--text-tertiary)] whitespace-nowrap">
                                                        {new Date(log.date).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </span>
                                                </div>
                                                {log.detail && <p className="text-xs text-[var(--text-secondary)] mb-2">{log.detail}</p>}
                                                {log.performed_by && (
                                                    <div className="flex items-center gap-2">
                                                        <ShieldCheck size={12} className="text-emerald-400" />
                                                        <span className="text-[10px] font-bold text-[var(--text-tertiary)] uppercase">Por: {log.performed_by}</span>
                                                        {log.cost > 0 && <span className="text-[10px] text-yellow-400 ml-auto">{log.cost.toFixed(2)}€</span>}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div >

            {/* Config Editor Modal */}
            {
                isEditorOpen && (
                    <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-8 backdrop-blur-sm">
                        <div className="bg-[var(--bg-card)] w-full max-w-4xl h-full max-h-[90vh] rounded-3xl border border-[var(--border-default)] flex flex-col shadow-2xl overflow-hidden">
                            <div className="p-6 border-b border-[var(--border-default)] flex justify-between items-center">
                                <h3 className="text-xl font-black text-[var(--text-primary)] uppercase">
                                    Editor de {AC_CATEGORIES.find(c => c.id === selectedCategory)?.name}
                                </h3>
                                <button
                                    onClick={() => {
                                        if (!confirmDiscardEditorChanges()) return;
                                        setIsEditorOpen(false);
                                    }}
                                >
                                    <Plus className="rotate-45 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]" size={28} />
                                </button>
                            </div>
                            <div className="p-8 overflow-y-auto flex-1 bg-[var(--bg-app)]">
                                <label className="block text-xs font-bold text-[var(--text-tertiary)] uppercase mb-2">Nombre del perfil</label>
                                <input value={newProfileName} onChange={e => setNewProfileName(e.target.value)} className="w-full text-xl font-bold bg-transparent border-b border-[var(--border-default)] focus:border-blue-500 outline-none text-[var(--text-primary)] mb-8 pb-2" placeholder="Nombre del perfil..." />

                                {newProfileName && (
                                    <ACSettingsEditor
                                        category={selectedCategory as 'controls' | 'gameplay' | 'video' | 'audio' | 'camera' | 'race' | 'weather'}
                                        profileName={`${newProfileName}.ini`}
                                        onDirtyChange={setEditorDirty}
                                    />
                                )}
                            </div>
                        </div>
                    </div>
                )
            }

            {
                contentStationId && (
                    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-6 backdrop-blur-sm">
                        <div className="bg-[var(--bg-card)] w-full max-w-5xl max-h-[90vh] rounded-3xl border border-[var(--border-default)] flex flex-col shadow-2xl overflow-hidden">
                            <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
                                <div>
                                    <h3 className="text-xl font-black text-[var(--text-primary)] uppercase">Contenido escaneado</h3>
                                    <p className="text-xs text-[var(--text-tertiary)]">
                                        {contentStation ? contentStation.name : 'Estación'} {stationContent?.updated ? `· Actualizado ${new Date(stationContent.updated).toLocaleString('es-ES')}` : ''}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={() => {
                                            if (!contentStationId) return;
                                            scanContentMutation.mutate(contentStationId);
                                        }}
                                        className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] text-xs font-bold uppercase tracking-widest"
                                    >
                                        Reescanear
                                    </button>
                                    <button
                                        onClick={() => setContentStationId(null)}
                                        className="px-3 py-2 rounded-lg bg-[var(--bg-elevated)] hover:bg-[var(--bg-elevated)] text-[var(--text-secondary)] text-xs font-bold uppercase tracking-widest"
                                    >
                                        Cerrar
                                    </button>
                                </div>
                            </div>

                            <div className="px-6 pt-4 flex gap-2">
                                <button
                                    onClick={() => setContentTab('cars')}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border",
                                        contentTab === 'cars'
                                            ? "bg-blue-600 border-blue-400 text-[var(--text-primary)]"
                                            : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-tertiary)]"
                                    )}
                                >
                                    Coches ({stationContent?.cars?.length || 0})
                                </button>
                                <button
                                    onClick={() => setContentTab('tracks')}
                                    className={cn(
                                        "px-4 py-2 rounded-lg text-xs font-black uppercase tracking-widest border",
                                        contentTab === 'tracks'
                                            ? "bg-blue-600 border-blue-400 text-[var(--text-primary)]"
                                            : "bg-[var(--bg-elevated)] border-[var(--border-default)] text-[var(--text-tertiary)]"
                                    )}
                                >
                                    Circuitos ({stationContent?.tracks?.length || 0})
                                </button>
                            </div>

                            <div className="p-6 overflow-y-auto">
                                {stationContentLoading && (
                                    <div className="text-center text-[var(--text-tertiary)]">Cargando contenido...</div>
                                )}
                                {!stationContentLoading && contentTab === 'cars' && (
                                    <>
                                        {stationContent?.cars?.length ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {stationContent.cars.map((car: any) => {
                                                    const imageUrl = resolveContentUrl(car.image_url);
                                                    return (
                                                        <div key={car.id} className="bg-[var(--bg-elevated)]/60 border border-[var(--border-default)] rounded-2xl p-4 flex gap-3">
                                                            {imageUrl && (
                                                                <img
                                                                    src={imageUrl}
                                                                    alt={car.name}
                                                                    className="w-20 h-14 object-cover rounded-lg bg-black/40"
                                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            )}
                                                            <div>
                                                                <div className="text-[var(--text-primary)] font-bold text-sm">{car.name}</div>
                                                                <div className="text-[10px] text-[var(--text-tertiary)]">{car.brand || 'Sin marca'}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-[var(--text-tertiary)] text-sm">No hay coches escaneados.</div>
                                        )}
                                    </>
                                )}

                                {!stationContentLoading && contentTab === 'tracks' && (
                                    <>
                                        {stationContent?.tracks?.length ? (
                                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                                {stationContent.tracks.map((track: any) => {
                                                    const imageUrl = resolveContentUrl(track.image_url);
                                                    const mapUrl = resolveContentUrl(track.map_url);
                                                    return (
                                                        <div key={track.id} className="bg-[var(--bg-elevated)]/60 border border-[var(--border-default)] rounded-2xl p-4 flex gap-3">
                                                            {(imageUrl || mapUrl) && (
                                                                <img
                                                                    src={imageUrl || mapUrl}
                                                                    alt={track.name}
                                                                    className="w-20 h-14 object-cover rounded-lg bg-black/40"
                                                                    onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                                                />
                                                            )}
                                                            <div>
                                                                <div className="text-[var(--text-primary)] font-bold text-sm">{track.name}</div>
                                                                <div className="text-[10px] text-[var(--text-tertiary)]">{track.layout || 'Sin layout'}</div>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ) : (
                                            <div className="text-[var(--text-tertiary)] text-sm">No hay circuitos escaneados.</div>
                                        )}
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

        </div>
    );
}
