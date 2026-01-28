import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import {
    Monitor, Cpu, Thermometer,
    AlertTriangle, CheckCircle, XCircle,
    Gamepad2, RefreshCw, Car, MapPin, User, Power, PowerOff
} from 'lucide-react';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface StationHealth {
    station_id: number;
    station_name: string;
    is_online: boolean;
    last_seen: string | null;
    cpu_percent: number;
    ram_percent: number;
    gpu_percent: number;
    gpu_temp: number;
    disk_percent: number;
    wheel_connected: boolean;
    pedals_connected: boolean;
    shifter_connected: boolean;
    peripherals_list: string[];
    ac_running: boolean;
    current_driver: string | null;
    current_track: string | null;
    current_car: string | null;
    alerts: string[];
}

interface HealthSummary {
    total_stations: number;
    online: number;
    offline: number;
    with_alerts: number;
    running_ac: number;
}

function ProgressBar({ value, color, label }: { value: number; color: string; label: string }) {
    return (
        <div className="space-y-1">
            <div className="flex justify-between text-xs">
                <span className="text-gray-400">{label}</span>
                <span className={cn(
                    value > 90 ? 'text-red-400' :
                        value > 75 ? 'text-yellow-400' : 'text-green-400'
                )}>{value.toFixed(0)}%</span>
            </div>
            <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                <div
                    className={cn("h-full rounded-full transition-all", color)}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
        </div>
    );
}

function StationHealthCard({ station }: { station: StationHealth }) {
    const [isPending, setIsPending] = useState(false);

    const handlePower = async (action: 'shutdown' | 'power-on' | 'restart') => {
        if (!window.confirm(`¿Seguro que quieres ${action === 'power-on' ? 'ENCENDER' : action === 'shutdown' ? 'APAGAR' : 'REINICIAR'} esta estación?`)) return;

        setIsPending(true);
        try {
            await axios.post(`${API_URL}/stations/${station.station_id}/${action}`);
        } catch (err) {
            console.error("Power action failed", err);
            alert("Error al ejecutar acción de energía");
        } finally {
            setIsPending(false);
        }
    };

    const handleQuickAction = async (action: 'restart-agent' | 'stop') => {
        setIsPending(true);
        try {
            await axios.post(`${API_URL}/control/station/${station.station_id}/${action}`);
        } catch (err) {
            console.error("Quick action failed", err);
            alert("Error al ejecutar acción rávida");
        } finally {
            setIsPending(false);
        }
    };

    const hasAlerts = station.alerts.length > 0;
    const statusColor = !station.is_online ? 'border-red-500' :
        hasAlerts ? 'border-yellow-500' : 'border-green-500';

    return (
        <div className={cn(
            "bg-gray-800/80 rounded-xl p-4 border-2 transition-all",
            statusColor
        )}>
            {/* Header */}
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <Monitor className="w-5 h-5 text-blue-400" />
                    <span className="font-bold text-white">{station.station_name}</span>
                </div>
                <div className={cn(
                    "px-2 py-1 rounded-full text-xs font-bold",
                    station.is_online ?
                        (hasAlerts ? "bg-yellow-500/20 text-yellow-400" : "bg-green-500/20 text-green-400") :
                        "bg-red-500/20 text-red-400"
                )}>
                    {station.is_online ? (hasAlerts ? "⚠️ Alerta" : "✅ Online") : "❌ Offline"}
                </div>
            </div>

            {/* Power Controls */}
            <div className="flex gap-2 mb-4">
                {!station.is_online ? (
                    <button
                        disabled={isPending}
                        onClick={() => handlePower('power-on')}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-[0_4px_15px_rgba(22,163,74,0.3)]"
                    >
                        <Power size={12} /> Encender (WoL)
                    </button>
                ) : (
                    <>
                        <button
                            disabled={isPending}
                            onClick={() => handlePower('shutdown')}
                            className="flex-1 bg-red-600/20 hover:bg-red-600 text-red-400 hover:text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-red-500/30"
                        >
                            <PowerOff size={12} /> Apagar
                        </button>
                        <button
                            disabled={isPending}
                            onClick={() => handlePower('restart')}
                            className="p-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all border border-blue-500/30 flex items-center justify-center"
                            title="Reiniciar"
                        >
                            <RefreshCw size={12} className={isPending ? "animate-spin" : ""} />
                        </button>
                    </>
                )}
            </div>

            {station.is_online && (
                <div className="flex gap-2 mb-4">
                    <button
                        disabled={isPending}
                        onClick={() => handleQuickAction('restart-agent')}
                        className="flex-1 bg-purple-600/10 hover:bg-purple-600 text-purple-400 hover:text-white py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-purple-500/30"
                        title="Reiniciar agente"
                    >
                        <RefreshCw size={12} className={isPending ? "animate-spin" : ""} /> Reiniciar agente
                    </button>
                    {station.ac_running && (
                        <button
                            disabled={isPending}
                            onClick={() => handleQuickAction('stop')}
                            className="flex-1 bg-yellow-500/10 hover:bg-yellow-500 text-yellow-400 hover:text-black py-2 rounded-lg text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 transition-all border border-yellow-500/30"
                            title="Detener sesión"
                        >
                            <AlertTriangle size={12} /> Detener AC
                        </button>
                    )}
                </div>
            )}

            {/* Resources */}
            {station.is_online && (
                <div className="space-y-2 mb-4">
                    <ProgressBar
                        value={station.cpu_percent}
                        color={station.cpu_percent > 90 ? "bg-red-500" : station.cpu_percent > 75 ? "bg-yellow-500" : "bg-green-500"}
                        label="CPU"
                    />
                    <ProgressBar
                        value={station.ram_percent}
                        color={station.ram_percent > 90 ? "bg-red-500" : station.ram_percent > 80 ? "bg-yellow-500" : "bg-blue-500"}
                        label="RAM"
                    />
                    <ProgressBar
                        value={station.gpu_percent}
                        color={station.gpu_percent > 90 ? "bg-red-500" : station.gpu_percent > 75 ? "bg-yellow-500" : "bg-purple-500"}
                        label="GPU"
                    />
                </div>
            )}

            {/* Peripherals */}
            {station.is_online && (
                <div className="space-y-2 mb-4">
                    <div className="flex gap-2">
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs",
                            station.wheel_connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                            {station.wheel_connected ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Volante
                        </div>
                        <div className={cn(
                            "flex items-center gap-1 px-2 py-1 rounded text-xs",
                            station.pedals_connected ? "bg-green-500/20 text-green-400" : "bg-red-500/20 text-red-400"
                        )}>
                            {station.pedals_connected ? <CheckCircle className="w-3 h-3" /> : <XCircle className="w-3 h-3" />}
                            Pedales
                        </div>
                    </div>

                    {station.peripherals_list && station.peripherals_list.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                            {station.peripherals_list.map((name, idx) => (
                                <span key={idx} className="text-[10px] bg-blue-500/10 text-blue-300 px-1.5 py-0.5 rounded border border-blue-500/20">
                                    {name}
                                </span>
                            ))}
                        </div>
                    )}
                </div>
            )}

            {/* Alerts */}
            {hasAlerts && (
                <div className="space-y-1">
                    {station.alerts.map((alert, i) => (
                        <div key={i} className="flex items-center gap-2 text-xs text-yellow-400">
                            <AlertTriangle className="w-3 h-3" />
                            {alert}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

export default function HardwareMonitor() {
    const [autoRefresh, setAutoRefresh] = useState(true);

    const { data: stations, isLoading, refetch } = useQuery<StationHealth[]>({
        queryKey: ['hardware-status'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/hardware/status`);
            return res.data;
        },
        refetchInterval: autoRefresh ? 5000 : false,
    });

    const { data: summary } = useQuery<HealthSummary>({
        queryKey: ['hardware-summary'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/hardware/summary`);
            return res.data;
        },
        refetchInterval: autoRefresh ? 5000 : false,
    });

    return (
        <div className="p-6 space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Cpu className="w-6 h-6 text-blue-400" />
                        Monitor de Hardware
                    </h1>
                    <p className="text-gray-400 text-sm mt-1">Estado en tiempo real de los simuladores</p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => setAutoRefresh(!autoRefresh)}
                        className={cn(
                            "px-3 py-2 rounded-lg text-sm flex items-center gap-2 transition",
                            autoRefresh ? "bg-green-500/20 text-green-400" : "bg-gray-700 text-gray-400"
                        )}
                    >
                        <RefreshCw className={cn("w-4 h-4", autoRefresh && "animate-spin")} />
                        {autoRefresh ? "Auto-refresh ON" : "Auto-refresh OFF"}
                    </button>
                    <button
                        onClick={() => refetch()}
                        className="px-3 py-2 rounded-lg bg-blue-500/20 text-blue-400 text-sm flex items-center gap-2 hover:bg-blue-500/30 transition"
                    >
                        <RefreshCw className="w-4 h-4" />
                        Actualizar
                    </button>
                </div>
            </div>

            {/* Summary */}
            {summary && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-gray-800 rounded-xl p-4 text-center">
                        <div className="text-3xl font-bold text-white">{summary.total_stations}</div>
                        <div className="text-sm text-gray-400">Total</div>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 text-center border border-green-500/30">
                        <div className="text-3xl font-bold text-green-400">{summary.online}</div>
                        <div className="text-sm text-gray-400">Online</div>
                    </div>
                </div>
            )}

            {/* Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {stations?.map(station => (
                    <StationHealthCard key={station.station_id} station={station} />
                ))}
            </div>
        </div>
    );
}
