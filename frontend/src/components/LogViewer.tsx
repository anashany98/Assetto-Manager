import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Terminal, RefreshCw, AlertTriangle, Info, AlertCircle } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';

// Log Types
interface LogEntry {
    timestamp: number;
    level: string;
    source: string;
    message: string;
    details?: string;
}

const API_URL = `http://${window.location.hostname}:8000`;

export function LogViewer() {
    const [filterLevel, setFilterLevel] = useState<string>('ALL');
    const [autoRefresh, setAutoRefresh] = useState(true);

    const { data: logs, isRefetching } = useQuery({
        queryKey: ['system_logs'],
        queryFn: async () => {
            const res = await axios.get<LogEntry[]>(`${API_URL}/system/logs/?limit=500`);
            return res.data;
        },
        refetchInterval: autoRefresh ? 3000 : false,
    });

    const filteredLogs = logs?.filter(log => {
        if (filterLevel === 'ALL') return true;
        if (filterLevel === 'ERROR') return log.level === 'ERROR' || log.level === 'CRITICAL';
        if (filterLevel === 'WARNING') return log.level === 'WARNING';
        return true;
    }) || [];

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'ERROR':
            case 'CRITICAL':
                return <AlertCircle className="text-red-500" size={16} />;
            case 'WARNING':
                return <AlertTriangle className="text-yellow-500" size={16} />;
            default:
                return <Info className="text-blue-500" size={16} />;
        }
    };

    const formatTime = (ts: number) => {
        return new Date(ts * 1000).toLocaleTimeString();
    };

    return (
        <div className="bg-gray-900 rounded-3xl border border-gray-700 shadow-xl overflow-hidden flex flex-col h-[600px]">
            {/* Header */}
            <div className="bg-gray-800 p-6 flex items-center justify-between border-b border-gray-700">
                <div className="flex items-center space-x-4">
                    <div className="bg-gray-700 p-3 rounded-xl text-gray-300">
                        <Terminal size={24} />
                    </div>
                    <div>
                        <h2 className="text-xl font-black text-white uppercase tracking-tight">Logs del Sistema</h2>
                        <p className="text-gray-400 text-xs font-bold uppercase tracking-widest">
                            {logs?.length || 0} Eventos Registrados
                        </p>
                    </div>
                </div>

                <div className="flex items-center space-x-4">
                    {/* Level Filter */}
                    <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-700">
                        {['ALL', 'WARNING', 'ERROR'].map((lvl) => (
                            <button
                                key={lvl}
                                onClick={() => setFilterLevel(lvl)}
                                className={cn(
                                    "px-3 py-1.5 rounded-md text-xs font-bold uppercase tracking-wide transition-all",
                                    filterLevel === lvl
                                        ? "bg-gray-700 text-white shadow-sm"
                                        : "text-gray-500 hover:text-gray-300"
                                )}
                            >
                                {lvl === 'ALL' ? 'Todos' : lvl}
                            </button>
                        ))}
                    </div>

                    {/* Auto Refresh Toggle */}
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(
                            "p-2 rounded-lg transition-colors",
                            autoRefresh ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-500"
                        )}
                        title={autoRefresh ? "Auto-refresh ON" : "Auto-refresh PAUSED"}
                    >
                        <RefreshCw size={20} className={cn(autoRefresh && isRefetching && "animate-spin")} />
                    </button>
                </div>
            </div>

            {/* Logs Console */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2 bg-black/50 font-mono text-sm">
                {filteredLogs.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                        <Terminal size={48} className="opacity-20" />
                        <p>No hay logs recientes</p>
                    </div>
                ) : (
                    filteredLogs.map((log, idx) => (
                        <div
                            key={idx}
                            className={cn(
                                "flex items-start space-x-3 p-2 rounded hover:bg-gray-800 transition-colors border-l-2",
                                log.level === 'ERROR' ? "border-red-500 bg-red-900/10" :
                                    log.level === 'WARNING' ? "border-yellow-500 bg-yellow-900/10" :
                                        "border-transparent"
                            )}
                        >
                            <span className="text-gray-500 shrink-0 select-none w-20 text-[11px] pt-0.5">
                                {formatTime(log.timestamp)}
                            </span>

                            <div className="shrink-0 pt-0.5">
                                {getLevelIcon(log.level)}
                            </div>

                            <div className="flex-1 min-w-0">
                                <div className="flex items-center space-x-2 mb-0.5">
                                    <span className={cn(
                                        "text-[10px] font-bold px-1.5 rounded uppercase tracking-wider",
                                        log.source === 'server' ? "bg-purple-900/30 text-purple-400" : "bg-blue-900/30 text-blue-400"
                                    )}>
                                        {log.source}
                                    </span>
                                    {log.details && (
                                        <span className="text-[10px] text-gray-600 truncate max-w-[200px]" title={log.details}>
                                            {log.details}
                                        </span>
                                    )}
                                </div>
                                <p className={cn(
                                    "break-words whitespace-pre-wrap leading-relaxed",
                                    log.level === 'ERROR' ? "text-red-200" :
                                        log.level === 'WARNING' ? "text-yellow-200" :
                                            "text-gray-300"
                                )}>
                                    {log.message}
                                </p>
                            </div>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
}
