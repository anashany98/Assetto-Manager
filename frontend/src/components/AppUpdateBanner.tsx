import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, DownloadCloud, Power, RefreshCw, X } from 'lucide-react';
import { getAppUpdateStatus, restartAppService, runAppUpdate } from '../api/system';
import { useAuth } from '../context/useAuth';

const DISMISS_KEY = 'ac_manager_update_banner_dismissed_commit';

const shortCommit = (value?: string | null) => {
    if (!value) return '---';
    return value.slice(0, 8);
};

export function AppUpdateBanner() {
    const { user, isAuthenticated } = useAuth();
    const queryClient = useQueryClient();
    const [dismissedCommit, setDismissedCommit] = useState<string>(() => localStorage.getItem(DISMISS_KEY) || '');

    const statusQuery = useQuery({
        queryKey: ['app-update-status'],
        queryFn: () => getAppUpdateStatus(true),
        enabled: isAuthenticated && user?.role === 'admin',
        refetchInterval: 60000,
        retry: 1,
    });

    const runMutation = useMutation({
        mutationFn: () => runAppUpdate(false),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['app-update-status'] });
        },
    });

    const restartMutation = useMutation({
        mutationFn: () => restartAppService(),
        onSuccess: () => {
            alert('Reinicio programado. La web puede desconectarse en unos segundos.');
            queryClient.invalidateQueries({ queryKey: ['app-update-status'] });
        },
        onError: (error: any) => {
            const detail = error?.response?.data?.detail || 'No se pudo programar el reinicio del servicio.';
            alert(detail);
        },
    });

    const status = statusQuery.data;

    useEffect(() => {
        if (!status?.latest_commit || !dismissedCommit) return;
        if (status.latest_commit !== dismissedCommit) {
            setDismissedCommit('');
            localStorage.removeItem(DISMISS_KEY);
        }
    }, [status?.latest_commit, dismissedCommit]);

    if (!isAuthenticated || user?.role !== 'admin' || !status) return null;

    const hasUpdate = status.supported && status.has_update;
    const needsRestart = !!(status.last_run?.status === 'success' && status.last_run?.restart_required);
    const updateDismissed = hasUpdate && !!status.latest_commit && dismissedCommit === status.latest_commit;
    const hasFailedRun = status.last_run?.status === 'failed';
    const canRunUpdate = !status.is_updating && (hasUpdate || hasFailedRun);
    const showBanner = status.is_updating || hasFailedRun || needsRestart || (hasUpdate && !updateDismissed);

    if (!showBanner) return null;

    const dismissCurrentUpdate = () => {
        if (!status.latest_commit) return;
        setDismissedCommit(status.latest_commit);
        localStorage.setItem(DISMISS_KEY, status.latest_commit);
    };

    const handleRunUpdate = () => {
        const confirmed = window.confirm(
            'Se actualizara backend y frontend en este servidor. Durante el proceso puede haber inestabilidad temporal. Continuar?'
        );
        if (!confirmed) return;
        runMutation.mutate();
    };

    const handleRestart = () => {
        const confirmed = window.confirm(
            'Se reiniciara el servicio del backend ahora. La web se desconectara durante unos segundos. Continuar?'
        );
        if (!confirmed) return;
        restartMutation.mutate();
    };

    const title = status.is_updating
        ? 'Actualizacion en progreso'
        : hasFailedRun
            ? 'Fallo en la actualizacion automatica'
            : needsRestart
                ? 'Reinicio requerido'
                : 'Nueva actualizacion disponible';

    const description = status.is_updating
        ? 'El servidor esta descargando e instalando la nueva version.'
        : hasFailedRun
            ? (status.last_run?.error || 'Revisa los detalles en Configuracion > Base de datos.')
            : needsRestart
                ? 'La actualizacion se completo. Reinicia el backend para aplicar los cambios.'
                : `Actual ${shortCommit(status.current_commit)} | Nueva ${shortCommit(status.latest_commit)} (${status.behind_count} commits).`;

    return (
        <div className="mx-8 mt-6 mb-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4 text-amber-100">
            <div className="flex items-start gap-3">
                <AlertTriangle size={18} className="text-amber-300 mt-0.5 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                    <p className="text-sm font-black uppercase tracking-wide text-amber-200">{title}</p>
                    <p className="text-xs text-amber-100/90 mt-1">{description}</p>
                    {needsRestart && !status.restart_supported && (
                        <p className="text-xs text-red-200 mt-1">
                            Reinicio automatico no disponible: {status.restart_error || 'servicio no detectado.'}
                        </p>
                    )}
                </div>
                {hasUpdate && !status.is_updating && (
                    <button
                        type="button"
                        onClick={dismissCurrentUpdate}
                        className="p-1.5 rounded-md bg-amber-900/30 border border-amber-400/30 hover:bg-amber-900/50"
                        title="Ocultar aviso"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-2">
                {canRunUpdate && (
                    <button
                        type="button"
                        onClick={handleRunUpdate}
                        disabled={runMutation.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-400 text-black font-bold text-xs uppercase tracking-wider disabled:opacity-60"
                    >
                        {runMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                        Actualizar todo
                    </button>
                )}
                {status.is_updating && (
                    <span className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-amber-900/30 border border-amber-400/30 text-xs font-bold uppercase tracking-wider">
                        <RefreshCw size={14} className="animate-spin" />
                        Actualizando...
                    </span>
                )}
                {needsRestart && (
                    <button
                        type="button"
                        onClick={handleRestart}
                        disabled={!status.restart_supported || restartMutation.isPending}
                        className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-[var(--text-primary)] font-bold text-xs uppercase tracking-wider disabled:opacity-60"
                    >
                        {restartMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Power size={14} />}
                        Reiniciar servicio
                    </button>
                )}
                <button
                    type="button"
                    onClick={() => statusQuery.refetch()}
                    className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-transparent border border-amber-300/40 hover:bg-amber-900/20 text-xs font-bold uppercase tracking-wider"
                >
                    <RefreshCw size={14} />
                    Comprobar
                </button>
            </div>
        </div>
    );
}

export default AppUpdateBanner;
