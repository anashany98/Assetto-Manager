import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Activity,
    Monitor,
    HardDrive,
    Zap,
    Play,
    Glasses
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getActiveSessions, type Session } from '../api/sessions';
import { API_URL } from '../config';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SessionTimer from '../components/SessionTimer';
import StartSessionModal from '../components/StartSessionModal';
import MassLaunchModal from '../components/MassLaunchModal';
import { Rocket } from 'lucide-react';

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [showLaunchModal, setShowLaunchModal] = useState(false);
    const [startModalStation, setStartModalStation] = useState<any | null>(null);

    const { data: stats } = useQuery<DashboardStats>({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 5000
    });

    const { data: activeSessions } = useQuery<Session[]>({
        queryKey: ['active-sessions'],
        queryFn: getActiveSessions,
        refetchInterval: 5000
    });

    return (
        <div className="space-y-6">
            {/* STATS GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 p-6 pt-0">
                <StatCard
                    label="Total Simuladores"
                    value={stats?.total_stations || 0}
                    subvalue="Configurados en el sistema"
                    icon={Monitor}
                    color="blue"
                />
                <StatCard
                    label="Online"
                    value={stats?.online_stations || 0}
                    subvalue="Listos para competir"
                    icon={Activity}
                    color="green"
                    animate={(stats?.online_stations || 0) > 0}
                />
                <StatCard
                    label="Syncing"
                    value={stats?.syncing_stations || 0}
                    subvalue="Descargando contenido"
                    icon={HardDrive}
                    color="orange"
                />
                <StatCard
                    label="Perfil Activo"
                    value={stats?.active_profile || "Ninguno"}
                    subvalue="Configuración global"
                    icon={Zap}
                    color="indigo"
                />
            </div>

            {/* QUICK ACTIONS */}
            <div className="px-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <button
                    onClick={() => setShowLaunchModal(true)}
                    className="block p-5 rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 backdrop-blur-sm shadow-sm dark:shadow-lg transition-all duration-300 group hover:-translate-y-1 hover:shadow-md dark:hover:shadow-xl hover:border-red-500/50 hover:bg-red-50 dark:hover:bg-red-500/10 hover:shadow-red-500/10 text-left"
                >
                    <h3 className="font-bold text-gray-900 dark:text-white mb-1 group-hover:translate-x-1 transition-transform flex items-center gap-2 text-lg">
                        <Rocket size={20} className="text-red-500" /> LANZAMIENTO
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Despliegue masivo en simuladores</p>
                </button>

                <QuickAction
                    to="/profiles"
                    title="Perfiles Volante"
                    desc="Aplicar FFB y config hardware"
                    color="blue"
                />
                <QuickAction
                    to="/events"
                    title="Organizar Torneo"
                    desc="Crear eliminatorias y brackets"
                    color="indigo"
                />
                <QuickAction
                    to="/settings"
                    title="Configuración"
                    desc="Ajustes globales del sistema"
                    color="purple"
                />
            </div>

            {/* MAIN CONTENT AREA */}
            <div className="px-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ACTIVE SESSIONS LIST */}
                <div className="lg:col-span-2 space-y-4">
                    <h2 className="text-xl font-bold flex items-center gap-2">
                        <Play size={20} className="text-green-500" /> Sesiones en Curso
                    </h2>

                    {activeSessions && activeSessions.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {activeSessions.map(session => (
                                <div key={session.id} className="bg-white dark:bg-white/5 border border-gray-200 dark:border-white/5 rounded-2xl p-5 shadow-sm">
                                    <div className="flex justify-between items-start mb-4">
                                        <div>
                                            <h4 className="font-bold text-lg">{session.station_name || `Sim ${session.station_id}`}</h4>
                                            <p className="text-sm text-gray-500">{session.driver_name || "Anónimo"}</p>
                                        </div>
                                        <div className="bg-green-500/20 text-green-400 text-[10px] font-black uppercase px-2 py-1 rounded">
                                            ACTIVA
                                        </div>
                                    </div>
                                    <SessionTimer
                                        session={session}
                                        onUpdate={() => queryClient.invalidateQueries({ queryKey: ['active-sessions'] })}
                                    />
                                    <div className="mt-4 pt-4 border-t border-gray-100 dark:border-white/5 flex gap-2">
                                        {session.is_vr && <Glasses size={16} className="text-blue-400" />}
                                        <span className="text-xs text-gray-400 uppercase font-bold tracking-tighter">
                                            {session.payment_method} • {session.is_paid ? 'PAGADO' : 'PENDIENTE'}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="p-12 text-center bg-gray-50 dark:bg-white/5 rounded-3xl border-2 border-dashed border-gray-200 dark:border-white/10">
                            <Activity size={40} className="mx-auto mb-4 text-gray-300 dark:text-gray-600" />
                            <p className="text-gray-500">No hay sesiones activas en este momento</p>
                            <button
                                onClick={() => setShowLaunchModal(true)}
                                className="mt-4 text-sm font-bold text-red-500 hover:underline"
                            >
                                Iniciar sesión manual &rarr;
                            </button>
                        </div>
                    )}
                </div>

                {/* SIDEBAR ANALYTICS */}
                <div className="space-y-6">
                    <AnalyticsPanel />
                </div>
            </div>

            {/* MODALS */}
            {
                showLaunchModal && (
                    <MassLaunchModal onClose={() => setShowLaunchModal(false)} />
                )
            }
            {
                startModalStation && (
                    <StartSessionModal
                        stationId={startModalStation.id}
                        stationName={startModalStation.name}
                        initialIsVR={startModalStation.is_vr}
                        onClose={() => setStartModalStation(null)}
                        onSuccess={() => {
                            setStartModalStation(null);
                            queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
                        }}
                    />
                )
            }
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
        green: { icon: "text-emerald-500 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-500/20", border: "border-emerald-200 dark:border-emerald-500/20 hover:border-emerald-300 dark:hover:border-emerald-500/40", glow: "shadow-emerald-500/10" },
        orange: { icon: "text-orange-500 dark:text-orange-400 bg-orange-100 dark:bg-orange-500/20", border: "border-orange-200 dark:border-orange-500/20 hover:border-orange-300 dark:hover:border-orange-500/40", glow: "shadow-orange-500/10" },
        blue: { icon: "text-blue-500 dark:text-blue-400 bg-blue-100 dark:bg-blue-500/20", border: "border-blue-200 dark:border-blue-500/20 hover:border-blue-300 dark:hover:border-blue-500/40", glow: "shadow-blue-500/10" },
        indigo: { icon: "text-indigo-500 dark:text-indigo-400 bg-indigo-100 dark:bg-indigo-500/20", border: "border-indigo-200 dark:border-indigo-500/20 hover:border-indigo-300 dark:hover:border-indigo-500/40", glow: "shadow-indigo-500/10" },
        gray: { icon: "text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700/50", border: "border-gray-200 dark:border-gray-700/50", glow: "" }
    };

    const c = colors[color] || colors.gray;

    return (
        <div className={`p-6 flex items-start justify-between border rounded-xl transition-all ${c.border} ${c.glow} shadow-sm bg-white dark:bg-white/5`}>
            <div>
                <p className="text-gray-500 dark:text-gray-400 font-bold uppercase text-xs tracking-wider mb-2">{label}</p>
                <h3 className="text-3xl font-black text-gray-900 dark:text-white mb-1 tracking-tight">{value}</h3>
                <p className="text-xs text-gray-400 dark:text-gray-500 font-medium">{subvalue}</p>
            </div>
            <div className={`p-4 rounded-xl ${c.icon} ${animate ? 'animate-pulse' : ''}`}>
                <Icon size={28} />
            </div>
        </div>
    )
}

function QuickAction({ to, title, desc, color }: { to: string; title: string; desc: string; color: string }) {
    const colors: Record<string, string> = {
        blue: "hover:border-blue-300 dark:hover:border-blue-500/50 hover:bg-blue-50 dark:hover:bg-blue-500/10 hover:shadow-blue-500/10",
        indigo: "hover:border-indigo-300 dark:hover:border-indigo-500/50 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 hover:shadow-indigo-500/10",
        purple: "hover:border-purple-300 dark:hover:border-purple-500/50 hover:bg-purple-50 dark:hover:bg-purple-500/10 hover:shadow-purple-500/10",
        green: "hover:border-green-300 dark:hover:border-green-500/50 hover:bg-green-50 dark:hover:bg-green-500/10 hover:shadow-green-500/10",
    }

    return (
        <Link to={to} className={`block p-5 rounded-xl border border-gray-200 dark:border-white/5 bg-white dark:bg-white/5 backdrop-blur-sm shadow-sm dark:shadow-lg transition-all duration-300 group hover:-translate-y-1 hover:shadow-md ${colors[color]}`}>
            <h3 className="font-bold text-gray-900 dark:text-white mb-1 group-hover:translate-x-1 transition-transform">{title}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">{desc}</p>
        </Link>
    )
}

function WeatherBtn({ icon: Icon, label, color, onClick }: any) {
    const colors: any = {
        yellow: "hover:bg-yellow-500 hover:text-white border-yellow-200 dark:border-yellow-500/50 text-yellow-600 dark:text-yellow-400",
        gray: "hover:bg-gray-500 hover:text-white border-gray-200 dark:border-gray-500/50 text-gray-500 dark:text-gray-400",
        blue: "hover:bg-blue-500 hover:text-white border-blue-200 dark:border-blue-500/50 text-blue-600 dark:text-blue-400",
        indigo: "hover:bg-indigo-500 hover:text-white border-indigo-200 dark:border-indigo-500/50 text-indigo-600 dark:text-indigo-400",
        purple: "hover:bg-purple-500 hover:text-white border-purple-200 dark:border-purple-500/50 text-purple-600 dark:text-purple-400",
    }
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl border bg-gray-50 dark:bg-black/40 transition-all active:scale-95 ${colors[color]}`}
        >
            <Icon size={20} />
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    )
}

function DiagnosticBar({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color: string }) {
    const colors: Record<string, { bg: string; fill: string }> = {
        blue: { bg: "bg-blue-100 dark:bg-blue-500/20", fill: "bg-blue-500" },
        green: { bg: "bg-green-100 dark:bg-green-500/20", fill: "bg-green-500" },
        purple: { bg: "bg-purple-100 dark:bg-purple-500/20", fill: "bg-purple-500" },
        red: { bg: "bg-red-100 dark:bg-red-500/20", fill: "bg-red-500" },
    };
    const c = colors[color] || colors.blue;
    const isHigh = value > 80;

    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-500 dark:text-gray-400 w-10">{label}</span>
            <div className={`flex-1 h-2 rounded-full ${c.bg} overflow-hidden`}>
                <div
                    className={`h-full rounded-full transition-all ${isHigh ? 'bg-red-500' : c.fill}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
            <span className={`w-16 text-right font-mono ${isHigh ? 'text-red-500 dark:text-red-400' : 'text-gray-600 dark:text-gray-400'}`}>
                {suffix || `${value.toFixed(0)}%`}
            </span>
        </div>
    );
}

