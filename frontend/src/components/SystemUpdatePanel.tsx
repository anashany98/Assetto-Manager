import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertTriangle, CheckCircle2, DownloadCloud, Power, RefreshCw, Wrench } from 'lucide-react';
import { getAppUpdateStatus, restartAppService, runAppUpdate } from '../api/system';
import { useAuth } from '../context/useAuth';

const shortCommit = (value?: string | null) => (value ? value.slice(0, 8) : '---');

const formatDate = (value?: string | null) => {
    if (!value) return '---';
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return '---';
    return parsed.toLocaleString('es-ES');
};

export default function SystemUpdatePanel() {
    const { user } = useAuth();
    const queryClient = useQueryClient();
    const isAdmin = user?.role === 'admin';

    const statusQuery = useQuery({
        queryKey: ['app-update-status'],
        queryFn: () => getAppUpdateStatus(true),
        refetchInterval: 60000,
        enabled: isAdmin,
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
    const lastRun = status?.last_run;
    const needsRestart = !!(lastRun?.status === 'success' && lastRun?.restart_required);

    if (!isAdmin) return null;

    const handleUpdate = () => {
        const confirmed = window.confirm(
            'Se actualizara backend y frontend en este servidor. Puede tardar varios minutos. Continuar?'
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

    return (
        <div className="bg-gray-900 p-6 rounded-2xl border border-gray-800 mb-6">
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h3 className="text-lg font-black text-white uppercase flex items-center gap-2">
                        <Wrench size={18} className="text-amber-400" />
                        Actualizacion del sistema
                    </h3>
                    <p className="text-xs text-gray-400 mt-1">
                        Actualiza este servidor desde la web: Git + dependencias + build frontend.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => statusQuery.refetch()}
                        className="px-3 py-2 rounded-lg border border-gray-700 text-gray-300 hover:bg-gray-800 text-xs font-bold uppercase tracking-wider inline-flex items-center gap-2"
                    >
                        <RefreshCw size={14} />
                        Comprobar
                    </button>
                    <button
                        type="button"
                        onClick={handleUpdate}
                        disabled={!status?.supported || status?.is_updating || runMutation.isPending}
                        className="px-3 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-black text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-50"
                    >
                        {status?.is_updating || runMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <DownloadCloud size={14} />}
                        {status?.is_updating ? 'Actualizando...' : 'Actualizar todo'}
                    </button>
                    {needsRestart && (
                        <button
                            type="button"
                            onClick={handleRestart}
                            disabled={!status?.restart_supported || restartMutation.isPending}
                            className="px-3 py-2 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-xs font-black uppercase tracking-wider inline-flex items-center gap-2 disabled:opacity-50"
                        >
                            {restartMutation.isPending ? <RefreshCw size={14} className="animate-spin" /> : <Power size={14} />}
                            Reiniciar servicio
                        </button>
                    )}
                </div>
            </div>

            {!status && (
                <p className="text-xs text-gray-500 mt-4">Cargando estado de actualizaciones...</p>
            )}

            {status && (
                <div className="mt-4 space-y-3">
                    {!status.supported && (
                        <div className="rounded-xl border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-200 flex items-start gap-2">
                            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
                            <span>{status.check_error || 'No se puede comprobar actualizaciones en este servidor.'}</span>
                        </div>
                    )}

                    {status.supported && (
                        <div className="rounded-xl border border-gray-700 bg-gray-950/60 p-3 text-xs text-gray-300">
                            <div className="flex flex-wrap gap-x-6 gap-y-2">
                                <span>Rama: <b className="text-white">{status.current_branch || '---'}</b></span>
                                <span>Actual: <b className="text-white">{shortCommit(status.current_commit)}</b></span>
                                <span>Remoto: <b className="text-white">{shortCommit(status.latest_commit)}</b></span>
                                <span>Commits pendientes: <b className="text-white">{status.behind_count}</b></span>
                                <span>Ultima comprobacion: <b className="text-white">{formatDate(status.checked_at)}</b></span>
                            </div>
                            <div className="mt-2 text-xs">
                                {status.has_update ? (
                                    <span className="text-amber-300 font-bold">Hay una actualizacion disponible.</span>
                                ) : (
                                    <span className="text-emerald-300 font-bold inline-flex items-center gap-1"><CheckCircle2 size={13} /> Sistema al dia.</span>
                                )}
                            </div>
                        </div>
                    )}

                    {lastRun && (
                        <div className="rounded-xl border border-gray-700 bg-gray-950/60 p-3">
                            <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-gray-300">
                                <span>Ultima ejecucion: <b className="text-white uppercase">{lastRun.status}</b></span>
                                <span>Inicio: <b className="text-white">{formatDate(lastRun.started_at)}</b></span>
                                <span>Fin: <b className="text-white">{formatDate(lastRun.finished_at)}</b></span>
                            </div>
                            {lastRun.error && (
                                <p className="text-xs text-red-300 mt-2">{lastRun.error}</p>
                            )}
                            {lastRun.restart_required && (
                                <div className="mt-2 space-y-1">
                                    <p className="text-xs text-amber-300">
                                        Actualizacion aplicada. Es necesario reiniciar el backend para cargar el codigo nuevo.
                                    </p>
                                    {!status.restart_supported && (
                                        <p className="text-xs text-red-300">
                                            Reinicio automatico no disponible: {status.restart_error || 'servicio no detectado.'}
                                        </p>
                                    )}
                                    {status.restart_supported && (
                                        <p className="text-xs text-cyan-300">
                                            Servicio objetivo: {status.restart_service_name || 'ACManagerBackend'}
                                        </p>
                                    )}
                                </div>
                            )}
                            {Array.isArray(lastRun.steps) && lastRun.steps.length > 0 && (
                                <div className="mt-3 max-h-48 overflow-auto space-y-2">
                                    {lastRun.steps.map((step, idx) => (
                                        <div key={`${step.name}-${idx}`} className="rounded-lg border border-gray-800 bg-black/20 p-2">
                                            <div className="flex justify-between items-center gap-3">
                                                <span className="text-xs font-semibold text-white">{step.name}</span>
                                                <span className={`text-[10px] uppercase font-bold ${step.status === 'success' ? 'text-emerald-400' : step.status === 'failed' ? 'text-red-400' : 'text-amber-300'}`}>
                                                    {step.status}
                                                </span>
                                            </div>
                                            {step.error_tail && <p className="text-[11px] text-red-300 mt-1 whitespace-pre-wrap">{step.error_tail}</p>}
                                            {!step.error_tail && step.output_tail && <p className="text-[11px] text-gray-400 mt-1 whitespace-pre-wrap">{step.output_tail}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
