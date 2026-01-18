import { useQuery } from '@tanstack/react-query';
import {
    Activity,
    Users,
    Trophy,
    Monitor,
    Tv,
    ExternalLink,
    HardDrive,
    Zap,
    Flag,
    Cloud,
    Sun,
    CloudRain,
    CloudLightning,
    Wind
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getStations } from '../api/stations';
import { AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import AnalyticsPanel from '../components/AnalyticsPanel';

export default function Dashboard() {
    const { data: stats, isLoading, error } = useQuery<DashboardStats>({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 5000
    });

    const { data: stations } = useQuery({
        queryKey: ['stations'],
        queryFn: getStations,
        refetchInterval: 5000
    });

    const sendPanic = async (id: number, name: string) => {
        if (confirm(`⚠ PRECAUCIÓN: ¿Estás seguro de enviar la señal de EMERGENCIA a ${name}?\n\nEsto cerrará forzosamente todos los juegos.`)) {
            try {
                await axios.post(`${API_URL}/stations/${id}/panic`);
                alert(`Orden ejecutada: Pánico en ${name}`);
            } catch {
                alert("Error al enviar la orden");
            }
        }
    };

    const setWeather = async (type: string, label: string) => {
        if (!confirm(`¿Cambiar clima global a ${label}?`)) return;
        try {
            await axios.post(`${API_URL}/control/global/weather`, { weather_type: type });
            alert("Comando enviado: " + label);
        } catch {
            alert("Error al enviar comando");
        }
    };

    if (isLoading) return (
        <div className="p-8 min-h-screen bg-[#0a0a0c] flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
                <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
                <p className="text-blue-400 font-bold animate-pulse">CARGANDO CENTRO DE MANDO...</p>
            </div>
        </div>
    );

    if (error) return (
        <div className="p-8 min-h-screen bg-[#0a0a0c] flex items-center justify-center">
            <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-md text-center">
                <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                <h2 className="text-xl font-bold text-white mb-2">Error de Conexión</h2>
                <p className="text-gray-400 mb-6">No se ha podido establecer conexión con el servidor central. Por favor, verifica que el backend esté en ejecución.</p>
                <button
                    onClick={() => window.location.reload()}
                    className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold transition-all"
                >
                    Reintentar Conexión
                </button>
            </div>
        </div>
    );

    const allOnline = stats?.online_stations === stats?.total_stations;

    return (
        <div className="p-8 max-w-[1600px] mx-auto">
            {/* HEADER */}
            <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Monitor className="text-blue-500" size={32} />
                        CENTRO DE MANDO
                    </h1>
                    <p className="text-gray-400 mt-1 font-medium">Panel de control general de la sala</p>
                </div>
                <div className="flex items-center gap-4">
                    <Link
                        to="/remote"
                        className="hidden md:flex bg-gray-800 hover:bg-gray-700 text-gray-300 px-3 py-2 rounded-lg font-bold items-center gap-2 transition-colors border border-gray-700 text-sm"
                    >
                        <Tv size={16} />
                        Mando
                    </Link>
                    <Link
                        to="/tv-mode"
                        target="_blank"
                        className="hidden md:flex bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg font-bold items-center gap-2 transition-colors shadow-lg shadow-blue-600/20 text-sm"
                    >
                        <ExternalLink size={16} />
                        Vista TV
                    </Link>
                    <div className={`px-4 py-2 rounded-full font-bold text-sm border ${allOnline ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                        ESTADO DE SALA: {allOnline ? '100% OPERATIVA' : 'ATENCIÓN REQUERIDA'}
                    </div>
                </div>
            </div>

            {/* KPI GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <StatCard
                    label="Estaciones Sim"
                    value={`${stats?.online_stations}/${stats?.total_stations}`}
                    subvalue="Conectados"
                    icon={Zap}
                    color={allOnline ? "green" : "orange"}
                />
                <StatCard
                    label="Perfil Activo"
                    value={stats?.active_profile || "Sin Perfil"}
                    subvalue="Configuración Global"
                    icon={Flag}
                    color="indigo"
                />
                <StatCard
                    label="Pilotos Registrados"
                    value={stats?.total_drivers || "0"}
                    subvalue="Base de datos"
                    icon={Users}
                    color="blue"
                />
                <StatCard
                    label="Estado de Red"
                    value={stats?.syncing_stations && stats.syncing_stations > 0 ? "Sincronizando..." : "Estable"}
                    subvalue={stats?.syncing_stations && stats.syncing_stations > 0 ? `${stats.syncing_stations} transfiriendo` : "Sin actividad P2P"}
                    icon={HardDrive}
                    color={stats?.syncing_stations && stats.syncing_stations > 0 ? "blue" : "gray"}
                    animate={Boolean(stats?.syncing_stations && stats.syncing_stations > 0)}
                />
            </div>

            {/* MASTER CONTROL (WEATHER) */}
            <div className="mb-8 bg-gradient-to-r from-indigo-900/50 to-purple-900/50 border border-indigo-500/30 rounded-2xl p-6 backdrop-blur-sm relative overflow-hidden group">
                <div className="absolute inset-0 bg-grid-white/[0.05] bg-[length:20px_20px]" />
                <div className="relative z-10 flex flex-col md:flex-row items-center justify-between gap-6">
                    <div>
                        <h2 className="text-xl font-black text-white italic tracking-tighter flex items-center gap-2">
                            <CloudLightning className="text-yellow-400" />
                            CONTROL METEOROLÓGICO "DIOS"
                        </h2>
                        <p className="text-indigo-200 text-sm mt-1">Modifica el clima de toda la sala en tiempo real.</p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                        <WeatherBtn icon={Sun} label="SOL" color="yellow" onClick={() => setWeather('sol', 'Sol')} />
                        <WeatherBtn icon={Wind} label="NIEBLA" color="gray" onClick={() => setWeather('fog', 'Niebla')} />
                        <WeatherBtn icon={Cloud} label="NUBLADO" color="blue" onClick={() => setWeather('cloudy', 'Nublado')} />
                        <WeatherBtn icon={CloudRain} label="LLUVIA" color="indigo" onClick={() => setWeather('rain', 'Lluvia')} />
                        <WeatherBtn icon={CloudLightning} label="TORMENTA" color="purple" onClick={() => setWeather('storm', 'Tormenta')} />
                    </div>
                </div>
            </div>

            {/* ACTION PANELS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* LEFT: SESSION CONTROL */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
                        <div className="bg-gray-900/50 px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                            <h2 className="font-bold text-white flex items-center gap-2"><Trophy size={20} className="text-yellow-500" /> GESTIÓN DE CARRERA</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <QuickAction
                                to="/profiles"
                                title="Cambiar Coche/Circuito"
                                desc="Aplicar un nuevo perfil a toda la sala"
                                color="blue"
                            />
                            <QuickAction
                                to="/events"
                                title="Organizar Torneo"
                                desc="Crear eliminatorias y brackets"
                                color="indigo"
                            />
                            <QuickAction
                                to="/championships"
                                title="Gestionar Campeonato"
                                desc="Administrar puntos de temporada"
                                color="purple"
                            />
                            <QuickAction
                                to="/drivers"
                                title="Registrar Piloto"
                                desc="Nuevo cliente en base de datos"
                                color="green"
                            />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-xl overflow-hidden text-white">
                        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <h2 className="font-bold text-white flex items-center gap-2"><Monitor size={20} /> CONTROL DE SALA & TV</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Link to="/remote" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-blue-300">📱 Mando TV</h3>
                                <p className="text-xs text-gray-400">Controlar pantallas públicas</p>
                            </Link>
                            <Link to="/kiosk" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-yellow-300">🖥️ Menú Pantallas</h3>
                                <p className="text-xs text-gray-400">Landing page para TVs</p>
                            </Link>
                            <Link to="/config" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-red-300">🔧 Config. Hardware</h3>
                                <p className="text-xs text-gray-400">Monitorizar Agentes</p>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* RIGHT: SYSTEM STATUS SIDEBAR (Placeholder for logs or alerts) */}
                <div className="space-y-6">
                    <div className="bg-orange-500/10 rounded-2xl p-6 border border-orange-500/20">
                        <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-2"><Activity size={18} /> Alertas del Sistema</h3>
                        {/* Mock Alerts */}
                        <div className="space-y-3">
                            {!allOnline && (
                                <div className="bg-gray-900 p-3 rounded-lg border border-orange-500/30 text-sm shadow-sm">
                                    <p className="font-bold text-orange-400">Simuladores Desconectados</p>
                                    <p className="text-gray-400 text-xs mt-1">Algunos agentes no responden. Revise la red.</p>
                                </div>
                            )}
                            <div className="bg-gray-900 p-3 rounded-lg border border-blue-500/30 text-sm shadow-sm">
                                <p className="font-bold text-blue-400">Sistema Actualizado</p>
                                <p className="text-gray-400 text-xs mt-1">Versión v2.1.0 funcionando correctamente.</p>
                            </div>
                        </div>
                    </div>
                </div>

                {/* STATION CONTROLS & EMERGENCY */}
                <div className="lg:col-span-3">
                    <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-700 flex justify-between items-center bg-gray-900/50">
                            <h2 className="font-bold text-white flex items-center gap-2">
                                <Activity size={20} className="text-blue-500" /> MONITOR DE ESTACIONES Y EMERGENCIA
                            </h2>
                        </div>
                        <div className="p-6">
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                                {Array.isArray(stations) ? (
                                    stations.map((station) => (
                                        <div key={station.id} className="bg-gray-900 border border-gray-700 rounded-xl p-4 flex items-center justify-between">
                                            <div>
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-2 h-2 rounded-full ${station.is_online ? 'bg-green-500 animate-pulse' : 'bg-red-500'}`} />
                                                    <h3 className="font-bold text-white leading-none">{station.name || `Simulador ${station.id}`}</h3>
                                                </div>
                                                <p className="text-xs text-gray-500 font-mono mt-1">{station.ip_address}</p>
                                            </div>
                                            <button
                                                onClick={() => sendPanic(station.id, station.name || `Station ${station.id}`)}
                                                className="bg-red-500/10 hover:bg-red-600 hover:text-white text-red-500 border border-red-500/30 p-2 rounded-lg transition-all active:scale-95"
                                                title="Panic Button: Forzar cierre"
                                            >
                                                <AlertTriangle size={18} />
                                            </button>
                                        </div>
                                    ))
                                ) : (
                                    <p className="text-gray-500 italic col-span-full py-4 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-700">
                                        No se detectan estaciones o el formato de datos es incorrecto.
                                    </p>
                                )}
                                {Array.isArray(stations) && stations.length === 0 && (
                                    <p className="text-gray-500 italic col-span-full py-4 text-center bg-gray-900/50 rounded-xl border border-dashed border-gray-700">
                                        No hay estaciones registradas.
                                    </p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

            </div>

            {/* ANALYTICS SECTION */}
            <div className="mt-10">
                <AnalyticsPanel />
            </div>
        </div>
    );
}

// Subcomponents for cleaner code
interface StatCardProps {
    label: string;
    value: string | number;
    subvalue?: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    color: string;
    animate?: boolean;
}

function StatCard({ label, value, subvalue, icon: Icon, color, animate }: StatCardProps) {
    const colors: Record<string, { icon: string; border: string; glow: string }> = {
        green: { icon: "text-emerald-400 bg-emerald-500/20", border: "border-emerald-500/20 hover:border-emerald-500/40", glow: "shadow-emerald-500/10" },
        orange: { icon: "text-orange-400 bg-orange-500/20", border: "border-orange-500/20 hover:border-orange-500/40", glow: "shadow-orange-500/10" },
        blue: { icon: "text-blue-400 bg-blue-500/20", border: "border-blue-500/20 hover:border-blue-500/40", glow: "shadow-blue-500/10" },
        indigo: { icon: "text-indigo-400 bg-indigo-500/20", border: "border-indigo-500/20 hover:border-indigo-500/40", glow: "shadow-indigo-500/10" },
        gray: { icon: "text-gray-400 bg-gray-700/50", border: "border-gray-700/50", glow: "" }
    };

    const c = colors[color] || colors.gray;

    return (
        <div className={`glass-card glass-card-hover p-6 flex items-start justify-between border ${c.border} ${c.glow} shadow-lg`}>
            <div>
                <p className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-2">{label}</p>
                <h3 className="text-3xl font-black text-white mb-1 tracking-tight">{value}</h3>
                <p className="text-xs text-gray-500 font-medium">{subvalue}</p>
            </div>
            <div className={`p-4 rounded-xl ${c.icon} ${animate ? 'animate-pulse' : ''}`}>
                <Icon size={28} />
            </div>
        </div>
    )
}

function QuickAction({ to, title, desc, color }: { to: string; title: string; desc: string; color: string }) {
    const colors: Record<string, string> = {
        blue: "hover:border-blue-500/50 hover:bg-blue-500/10 hover:shadow-blue-500/10",
        indigo: "hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:shadow-indigo-500/10",
        purple: "hover:border-purple-500/50 hover:bg-purple-500/10 hover:shadow-purple-500/10",
        green: "hover:border-green-500/50 hover:bg-green-500/10 hover:shadow-green-500/10",
    }

    return (
        <Link to={to} className={`block p-5 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm shadow-lg transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl ${colors[color]}`}>
            <h3 className="font-bold text-white mb-1 group-hover:translate-x-1 transition-transform">{title}</h3>
            <p className="text-sm text-gray-400">{desc}</p>
        </Link>
    )
}

function WeatherBtn({ icon: Icon, label, color, onClick }: any) {
    const colors: any = {
        yellow: "hover:bg-yellow-500 hover:text-white border-yellow-500/50 text-yellow-400",
        gray: "hover:bg-gray-500 hover:text-white border-gray-500/50 text-gray-400",
        blue: "hover:bg-blue-500 hover:text-white border-blue-500/50 text-blue-400",
        indigo: "hover:bg-indigo-500 hover:text-white border-indigo-500/50 text-indigo-400",
        purple: "hover:bg-purple-500 hover:text-white border-purple-500/50 text-purple-400",
    }
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl border bg-black/40 transition-all active:scale-95 ${colors[color]}`}
        >
            <Icon size={20} />
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    )
}
