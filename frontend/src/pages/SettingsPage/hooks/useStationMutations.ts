/**
 * Custom hook for station-related mutations (power, content, kiosk, etc.)
 * Extracted from SettingsPage.tsx to reduce component complexity.
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'sonner';
import { API_URL } from '../../../config';
import { updateStation, type Station } from '../../../api/stations';
import { parseApiError } from '../../../lib/apiError';

export function useStationMutations(queryClient: ReturnType<typeof useQueryClient>) {
    const powerMutation = useMutation({
        mutationFn: async ({ id, action }: { id: number; action: 'shutdown' | 'power-on' | 'panic' | 'restart' }) => {
            await axios.post(`${API_URL}/stations/${id}/${action}`);
            return action;
        },
        onSuccess: (action) => {
            const labels: Record<string, string> = {
                shutdown: 'Apagado solicitado.',
                'power-on': 'Encendido solicitado.',
                panic: 'Cierre de emergencia solicitado.',
                restart: 'Reinicio solicitado.',
            };
            toast.success(labels[action] || 'Comando enviado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'No se pudo enviar el comando.')),
    });

    const scanContentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.get(`${API_URL}/control/station/${stationId}/content`);
        },
        onSuccess: (_data, stationId) => {
            toast.success('Escaneo de contenido iniciado.');
            queryClient.invalidateQueries({ queryKey: ['stations'] });
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al escanear contenido.'))
    });

    const syncContentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/control/station/${stationId}/sync`);
        },
        onSuccess: () => toast.success('Sincronización solicitada al agente.'),
        onError: (error) => toast.error(parseApiError(error, 'Error al sincronizar contenido.'))
    });

    const restartAgentMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/control/station/${stationId}/restart-agent`);
        },
        onSuccess: () => toast.success('Reinicio del agente solicitado.'),
        onError: (error) => toast.error(parseApiError(error, 'Error al reiniciar el agente.'))
    });

    const kioskToggleMutation = useMutation({
        mutationFn: async ({ id, enabled }: { id: number; enabled: boolean }) => {
            await axios.post(`${API_URL}/control/station/${id}/kiosk`, { enabled });
            return enabled;
        },
        onSuccess: (enabled) => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success(enabled ? 'Modo kiosko activado.' : 'Modo kiosko desactivado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al cambiar modo kiosko.'))
    });

    const kioskCodeMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/kiosk-code`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success('Código de kiosko regenerado.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al regenerar código de kiosko.'))
    });

    const lockMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/lock`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success('Estación bloqueada.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al bloquear la estación.'))
    });

    const unlockMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.post(`${API_URL}/stations/${stationId}/unlock`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success('Estación desbloqueada.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al desbloquear la estación.'))
    });

    const testConnectionMutation = useMutation({
        mutationFn: async (stationId: number) => {
            const res = await axios.get(`${API_URL}/hardware/status/${stationId}`);
            return res.data;
        },
        onSuccess: (data: any) => {
            const online = data?.is_online ? "online" : "offline";
            toast.success(`Estado: ${online}`);
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al comprobar conexión.'))
    });

    const deleteStationMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await axios.delete(`${API_URL}/stations/${stationId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success('Estación eliminada.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al eliminar estación.'))
    });

    const reactivateStationMutation = useMutation({
        mutationFn: async (stationId: number) => {
            await updateStation(stationId, { is_active: true, status: 'offline' });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['stations'] });
            toast.success('Estación reactivada.');
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al reactivar estación.'))
    });

    const archiveGhostsMutation = useMutation({
        mutationFn: async ({ older_than_hours, include_never_seen }: { older_than_hours: number; include_never_seen: boolean }) => {
            const res = await axios.post(`${API_URL}/stations/archive-ghosts`, {
                older_than_hours,
                include_never_seen,
                dry_run: false
            });
            return res.data;
        },
        onSuccess: (data: any) => {
            const count = typeof data?.archived_count === 'number' ? data.archived_count : 0;
            toast.success(count > 0 ? `Archivadas ${count} estaciones fantasma.` : 'No hay estaciones fantasma.');
            queryClient.invalidateQueries({ queryKey: ['stations'] });
        },
        onError: (error) => toast.error(parseApiError(error, 'Error al archivar estaciones fantasma.'))
    });

    return {
        powerMutation,
        scanContentMutation,
        syncContentMutation,
        restartAgentMutation,
        kioskToggleMutation,
        kioskCodeMutation,
        lockMutation,
        unlockMutation,
        testConnectionMutation,
        deleteStationMutation,
        reactivateStationMutation,
        archiveGhostsMutation,
    };
}
