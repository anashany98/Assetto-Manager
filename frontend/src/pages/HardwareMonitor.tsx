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
            // Success notification implied by UI update soon
        } catch (err) {
            console.error("Power action failed", err);
            alert("Error al ejecutar acción de energía");
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

            {/* Power Controls overlay-like strip */}
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

            {/* Current Activity */}
            {station.is_online && station.ac_running && (
                <div className="mb-4 p-2 bg-blue-500/10 rounded-lg border border-blue-500/30">
                    <div className="flex items-center gap-2 text-sm">
                        <Gamepad2 className="w-4 h-4 text-blue-400" />
                        <span className="text-blue-300">AC en ejecución</span>
                    </div>
                    {station.current_driver && (
                        <div className="flex items-center gap-2 text-xs mt-1 text-gray-300">
                            <User className="w-3 h-3" />
                            <span>{station.current_driver}</span>
                        </div>
                    )}
                    {station.current_track && (
                        <div className="flex items-center gap-2 text-xs mt-1 text-gray-300">
                            <MapPin className="w-3 h-3" />
                            <span>{station.current_track}</span>
                        </div>
                    )}
                    {station.current_car && (
                        <div className="flex items-center gap-2 text-xs mt-1 text-gray-300">
                            <Car className="w-3 h-3" />
                            <span>{station.current_car}</span>
                        </div>
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
                    <ProgressBar
                        value={station.disk_percent}
                        color={station.disk_percent > 90 ? "bg-red-500" : station.disk_percent > 80 ? "bg-yellow-500" : "bg-cyan-500"}
                        label="Disco"
                    />

                    {/* Temperature */}
                    {station.gpu_temp > 0 && (
                        <div className="flex items-center gap-2 text-sm mt-2">
                            <Thermometer className={cn(
                                "w-4 h-4",
                                station.gpu_temp > 85 ? "text-red-400" :
                                    station.gpu_temp > 75 ? "text-yellow-400" : "text-green-400"
                            )} />
                            <span className="text-gray-400">GPU Temp:</span>
                            <span className={cn(
                                station.gpu_temp > 85 ? "text-red-400" :
                                    station.gpu_temp > 75 ? "text-yellow-400" : "text-green-400"
                            )}>{station.gpu_temp}°C</span>
                        </div>
                    )}
                </div>
            )}

            {/* Peripherals */}
            {station.is_online && (
                <div className="flex gap-2 mb-4">
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
                    {station.shifter_connected && (
                        <div className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-green-500/20 text-green-400">
                            <CheckCircle className="w-3 h-3" />
                            Shifter
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

            {/* Last seen */}
            {!station.is_online && station.last_seen && (
                <div className="text-xs text-gray-500 mt-2">
                    Última conexión: {new Date(station.last_seen).toLocaleString('es-ES')}
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
            {/* Header */}
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
                        onClick={async () => {
                            if (window.confirm("¿Apagar TODAS las estaciones online?")) {
                                try {
                                    await Promise.all(
                                        stations?.filter(s => s.is_online).map(s =>
                                            axios.post(`${API_URL}/stations/${s.station_id}/shutdown`)
                                        ) || []
                                    );
                                    refetch();
                                } catch (e) {
                                    alert("Error al apagar algunas estaciones");
                                }
                            }
                        }}
                        className="px-3 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-sm flex items-center gap-2 transition shadow-lg"
                    >
                        <PowerOff className="w-4 h-4" />
                        Apagar TODO
                    </button>
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


            {/* Critical Alert Banner */}
            {summary && (summary.with_alerts > 0 || summary.offline > 0) && (
                <div className="bg-red-500/10 border-l-4 border-red-500 p-4 rounded-r flex items-center justify-between animate-pulse shadow-[0_0_15px_rgba(239,68,68,0.2)]">
                    <div className="flex items-center gap-3">
                        <AlertTriangle className="text-red-500 w-6 h-6 animate-bounce" />
                        <div>
                            <h3 className="font-bold text-red-500 uppercase tracking-wider text-sm">Atención Requerida</h3>
                            <p className="text-sm text-red-300 font-medium">
                                {summary.with_alerts > 0 && `⚠️ ${summary.with_alerts} estaciones con alertas de hardware. `}
                                {summary.offline > 0 && `❌ ${summary.offline} estaciones desconectadas.`}
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={() => window.scrollTo({ top: 500, behavior: 'smooth' })}
                        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-xs font-bold uppercase tracking-widest rounded transition-colors"
                    >
                        Ver Detalles
                    </button>
                </div>
            )}

            {/* Summary Cards */}
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
                    <div className="bg-gray-800 rounded-xl p-4 text-center border border-red-500/30">
                        <div className="text-3xl font-bold text-red-400">{summary.offline}</div>
                        <div className="text-sm text-gray-400">Offline</div>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 text-center border border-yellow-500/30">
                        <div className="text-3xl font-bold text-yellow-400">{summary.with_alerts}</div>
                        <div className="text-sm text-gray-400">Con alertas</div>
                    </div>
                    <div className="bg-gray-800 rounded-xl p-4 text-center border border-blue-500/30">
                        <div className="text-3xl font-bold text-blue-400">{summary.running_ac}</div>
                        <div className="text-sm text-gray-400">Jugando</div>
                    </div>
                </div>
            )}

            {/* Stations Grid */}
            {isLoading ? (
                <div className="text-center py-12 text-gray-400">
                    <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
                    Cargando estado de estaciones...
                </div>
            ) : stations?.length === 0 ? (
                <div className="text-center py-12 text-gray-400">
                    <Monitor className="w-12 h-12 mx-auto mb-2 opacity-50" />
                    No hay estaciones registradas
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {stations?.map(station => (
                        <StationHealthCard key={station.station_id} station={station} />
                    ))}
                </div>
            )}
        </div>
    );
}
