import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { 
    Monitor, 
    Wifi, 
    WifiOff, 
    Activity, 
    Clock, 
    AlertTriangle,
    CheckCircle,
    XCircle,
    Server
} from 'lucide-react';

interface AgentStatus {
    id: number;
    name: string;
    status: 'online' | 'offline' | 'online_disconnected';
    is_online: boolean;
    is_connected: boolean;
}

interface SystemHealth {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    agents: {
        total: number;
        online: number;
        offline: number;
    };
    sessions: {
        active: number;
    };
    stations: AgentStatus[];
    ws_stats: {
        clients: number;
        agents: number;
        instance_id?: string;
    };
}

export default function SystemDashboard() {
    const [currentTime, setCurrentTime] = useState(new Date());

    const { data: health, isLoading, error, refetch } = useQuery<SystemHealth>({
        queryKey: ['system-health'],
        queryFn: () => axios.get(`${API_URL}/health/system`).then(r => r.data),
        refetchInterval: 5000,
    });

    useEffect(() => {
        const timer = setInterval(() => setCurrentTime(new Date()), 1000);
        return () => clearInterval(timer);
    }, []);

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online': return 'text-green-400';
            case 'offline': return 'text-red-400';
            case 'online_disconnected': return 'text-yellow-400';
            default: return 'text-gray-400';
        }
    };

    const getStatusBg = (status: string) => {
        switch (status) {
            case 'online': return 'bg-green-500/20 border-green-500/30';
            case 'offline': return 'bg-red-500/20 border-red-500/30';
            case 'online_disconnected': return 'bg-yellow-500/20 border-yellow-500/30';
            default: return 'bg-gray-500/20 border-gray-500/30';
        }
    };

    if (isLoading) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div className="text-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400 mx-auto mb-4"></div>
                    <p className="text-gray-400">Cargando estado del sistema...</p>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
                <div className="text-center">
                    <AlertTriangle className="h-12 w-12 text-red-400 mx-auto mb-4" />
                    <p className="text-red-400">Error al cargar el estado del sistema</p>
                    <button 
                        onClick={() => refetch()}
                        className="mt-4 px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-black font-bold rounded"
                    >
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-6">
            {/* Header */}
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black uppercase flex items-center gap-3">
                        <Server className="h-8 w-8 text-cyan-400" />
                        Monitor del Sistema
                    </h1>
                    <p className="text-gray-400 mt-1">
                        Estado de los simuladores y sesiones en tiempo real
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-2xl font-mono">
                        {currentTime.toLocaleTimeString()}
                    </div>
                    <div className="text-gray-400 text-sm">
                        {currentTime.toLocaleDateString()}
                    </div>
                </div>
            </div>

            {/* Status Overview */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {/* Health Status */}
                <div className={`bg-gray-800 rounded-xl p-6 border ${
                    health?.status === 'healthy' ? 'border-green-500/30' :
                    health?.status === 'degraded' ? 'border-yellow-500/30' :
                    'border-red-500/30'
                }`}>
                    <div className="flex items-center gap-3 mb-2">
                        {health?.status === 'healthy' ? (
                            <CheckCircle className="h-6 w-6 text-green-400" />
                        ) : health?.status === 'degraded' ? (
                            <AlertTriangle className="h-6 w-6 text-yellow-400" />
                        ) : (
                            <XCircle className="h-6 w-6 text-red-400" />
                        )}
                        <span className="text-gray-400">Estado General</span>
                    </div>
                    <div className={`text-3xl font-black uppercase ${
                        health?.status === 'healthy' ? 'text-green-400' :
                        health?.status === 'degraded' ? 'text-yellow-400' :
                        'text-red-400'
                    }`}>
                        {health?.status || 'unknown'}
                    </div>
                </div>

                {/* Active Sessions */}
                <div className="bg-gray-800 rounded-xl p-6 border border-cyan-500/30">
                    <div className="flex items-center gap-3 mb-2">
                        <Activity className="h-6 w-6 text-cyan-400" />
                        <span className="text-gray-400">Sesiones Activas</span>
                    </div>
                    <div className="text-3xl font-black text-cyan-400">
                        {health?.sessions?.active || 0}
                    </div>
                </div>

                {/* Online Agents */}
                <div className="bg-gray-800 rounded-xl p-6 border border-green-500/30">
                    <div className="flex items-center gap-3 mb-2">
                        <Wifi className="h-6 w-6 text-green-400" />
                        <span className="text-gray-400">Agentes Conectados</span>
                    </div>
                    <div className="text-3xl font-black text-green-400">
                        {health?.agents?.online || 0} / {health?.agents?.total || 0}
                    </div>
                </div>

                {/* Offline Agents */}
                <div className="bg-gray-800 rounded-xl p-6 border border-red-500/30">
                    <div className="flex items-center gap-3 mb-2">
                        <WifiOff className="h-6 w-6 text-red-400" />
                        <span className="text-gray-400">Agentes Desconectados</span>
                    </div>
                    <div className="text-3xl font-black text-red-400">
                        {health?.agents?.offline || 0}
                    </div>
                </div>
            </div>

            {/* Stations Grid */}
            <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                <Monitor className="h-5 w-5 text-cyan-400" />
                Estaciones
            </h2>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                {health?.stations?.map((station) => (
                    <div 
                        key={station.id}
                        className={`rounded-xl p-4 border ${getStatusBg(station.status)}`}
                    >
                        <div className="flex items-center justify-between mb-3">
                            <span className="font-bold text-lg">{station.name}</span>
                            {station.is_connected ? (
                                <Wifi className={`h-5 w-5 ${getStatusColor(station.status)}`} />
                            ) : (
                                <WifiOff className={`h-5 w-5 ${getStatusColor(station.status)}`} />
                            )}
                        </div>
                        <div className={`text-sm font-mono uppercase ${
                            station.status === 'online' ? 'text-green-400' :
                            station.status === 'offline' ? 'text-red-400' :
                            'text-yellow-400'
                        }`}>
                            {station.status === 'online' ? '● Conectado' :
                             station.status === 'offline' ? '○ Desconectado' :
                             '⚠ Reconectando'}
                        </div>
                        <div className="text-xs text-gray-500 mt-2">
                            ID: {station.id}
                        </div>
                    </div>
                ))}
            </div>

            {/* WebSocket Stats */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <Activity className="h-5 w-5 text-cyan-400" />
                    Estadísticas WebSocket
                </h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <div>
                        <div className="text-gray-400 text-sm">Clientes Conectados</div>
                        <div className="text-2xl font-bold text-white">
                            {health?.ws_stats?.clients || 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-400 text-sm">Agentes Registrados</div>
                        <div className="text-2xl font-bold text-white">
                            {health?.ws_stats?.agents || 0}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-400 text-sm">Instancia ID</div>
                        <div className="text-xs font-mono text-gray-500 truncate">
                            {health?.ws_stats?.instance_id?.slice(0, 8) || 'N/A'}
                        </div>
                    </div>
                    <div>
                        <div className="text-gray-400 text-sm">Última Actualización</div>
                        <div className="text-xs font-mono text-gray-500">
                            {health?.timestamp ? new Date(health.timestamp).toLocaleTimeString() : 'N/A'}
                        </div>
                    </div>
                </div>
            </div>

            {/* Auto-refresh indicator */}
            <div className="mt-6 text-center text-gray-500 text-sm flex items-center justify-center gap-2">
                <Clock className="h-4 w-4" />
                Actualizando cada 5 segundos
            </div>
        </div>
    );
}
