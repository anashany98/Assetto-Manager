import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Activity,
    Monitor,
    HardDrive,
    Zap,
    Play,
    Glasses,
    Rocket,
    ArrowRight,
    TrendingUp,
    Users,
    Calendar,
    Settings,
    Trophy,
    Gauge,
    Clock,
    LayoutDashboard,
    BarChart3
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getActiveSessions, type Session } from '../api/sessions';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SessionTimer from '../components/SessionTimer';
import StartSessionModal from '../components/StartSessionModal';
import MassLaunchModal from '../components/MassLaunchModal';
import { FEATURES } from '../config/features';

// Tab types
type DashboardTab = 'overview' | 'analytics';

interface TabConfig {
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    description: string;
}

const TABS: TabConfig[] = [
    { id: 'overview', label: 'Vista General', icon: LayoutDashboard, description: 'Sesiones y estado del sistema' },
    { id: 'analytics', label: 'Analíticas', icon: BarChart3, description: 'Métricas y rendimiento' },
];

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [showLaunchModal, setShowLaunchModal] = useState(false);
    const [startModalStation, setStartModalStation] = useState<{
        id: number;
        name: string;
        is_vr: boolean;
    } | null>(null);

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

    const sessionsCount = activeSessions?.length ?? 0;

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 dark:from-gray-950 dark:via-gray-900 dark:to-gray-950">
            {/* HEADER SECTION */}
            <header className="bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-slate-200/50 dark:border-gray-800/50 sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16 sm:h-20">
                        {/* Title Group */}
                        <div className="flex items-center gap-4">
                            <div className="hidden sm:flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/25">
                                <Monitor size={20} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white tracking-tight">
                                    Panel de Control
                                </h1>
                                <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">
                                    Centro de gestión de simuladores
                                </p>
                            </div>
                        </div>

                        {/* Status Badge */}
                        <div className={`flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full text-sm font-medium transition-all duration-300 ${
                            sessionsCount > 0
                                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 ring-1 ring-emerald-200 dark:ring-emerald-500/20'
                                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 ring-1 ring-slate-200 dark:ring-slate-700'
                        }`}>
                            <Activity size={14} className={`${sessionsCount > 0 ? 'animate-pulse' : ''}`} />
                            <span className="hidden sm:inline">{sessionsCount > 0 ? 'Sistema activo' : 'Sistema en espera'}</span>
                            <span className="sm:hidden">{sessionsCount}</span>
                        </div>
                    </div>

                    {/* TAB NAVIGATION */}
                    <nav className="flex gap-1 -mb-px overflow-x-auto" role="tablist" aria-label="Secciones del panel">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    aria-controls={`tabpanel-${tab.id}`}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-all duration-200 whitespace-nowrap ${
                                        isActive
                                            ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                                            : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}
                                >
                                    <Icon size={16} className={isActive ? 'text-blue-500' : ''} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {/* MAIN CONTENT */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-8">
                {/* OVERVIEW TAB */}
                {activeTab === 'overview' && (
                    <div className="space-y-8" role="tabpanel" id="tabpanel-overview" aria-labelledby="tab-overview">
                        {/* STATS GRID */}
                        <section aria-label="Estadísticas principales">
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6">
                                <StatCard
                                    label="Simuladores"
                                    value={stats?.total_stations || 0}
                                    description="Total configurados"
                                    icon={Monitor}
                                    trend="neutral"
                                    color="blue"
                                />
                                <StatCard
                                    label="Online"
                                    value={stats?.online_stations || 0}
                                    description="Disponibles ahora"
                                    icon={Activity}
                                    trend={(stats?.online_stations || 0) > 0 ? 'up' : 'neutral'}
                                    color="emerald"
                                    highlight={(stats?.online_stations || 0) > 0}
                                />
                                <StatCard
                                    label="Sincronizando"
                                    value={stats?.syncing_stations || 0}
                                    description="Descargando mods"
                                    icon={HardDrive}
                                    trend="neutral"
                                    color="amber"
                                />
                                <StatCard
                                    label="Perfil Activo"
                                    value={stats?.active_profile || "Ninguno"}
                                    description="Configuración global"
                                    icon={Gauge}
                                    trend="neutral"
                                    color="violet"
                                />
                            </div>
                        </section>

                        {/* QUICK ACTIONS */}
                        <section aria-label="Acciones rápidas">
                            <div className="flex items-center justify-between mb-4">
                                <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                                    Acciones Rápidas
                                </h2>
                            </div>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                                <QuickActionButton
                                    onClick={() => setShowLaunchModal(true)}
                                    title="Lanzamiento Masivo"
                                    description="Desplegar en múltiples simuladores simultáneamente"
                                    icon={Rocket}
                                    variant="featured"
                                />

                                {FEATURES.profiles && (
                                    <QuickActionLink
                                        to="/profiles"
                                        title="Perfiles Volante"
                                        description="Gestionar configuraciones FFB"
                                        icon={Zap}
                                    />
                                )}

                                {FEATURES.tournaments && (
                                    <QuickActionLink
                                        to="/events"
                                        title="Organizar Torneo"
                                        description="Crear competiciones y brackets"
                                        icon={Trophy}
                                    />
                                )}

                                {FEATURES.settings && (
                                    <QuickActionLink
                                        to="/settings"
                                        title="Configuración"
                                        description="Ajustes del sistema"
                                        icon={Settings}
                                    />
                                )}
                            </div>
                        </section>

                        {/* ACTIVE SESSIONS - Full Width */}
                        <section aria-label="Sesiones en curso">
                            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm shadow-slate-200/50 dark:shadow-none ring-1 ring-slate-200 dark:ring-gray-800 overflow-hidden">
                                {/* Section Header */}
                                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 dark:border-gray-800 flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10">
                                            <Play size={16} className="text-emerald-500" />
                                        </div>
                                        <h2 className="text-base sm:text-lg font-semibold text-slate-900 dark:text-white">
                                            Sesiones en Curso
                                        </h2>
                                    </div>
                                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                        sessionsCount > 0
                                            ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        {sessionsCount} {sessionsCount === 1 ? 'activa' : 'activas'}
                                    </span>
                                </div>

                                {/* Sessions Content */}
                                <div className="p-4 sm:p-6">
                                    {activeSessions && activeSessions.length > 0 ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                                            {activeSessions.map(session => (
                                                <SessionCard
                                                    key={session.id}
                                                    session={session}
                                                    onUpdate={() => queryClient.invalidateQueries({ queryKey: ['active-sessions'] })}
                                                />
                                            ))}
                                        </div>
                                    ) : (
                                        <EmptyState onLaunchClick={() => setShowLaunchModal(true)} />
                                    )}
                                </div>
                            </div>
                        </section>
                    </div>
                )}

                {/* ANALYTICS TAB */}
                {activeTab === 'analytics' && (
                    <div role="tabpanel" id="tabpanel-analytics" aria-labelledby="tab-analytics">
                        <AnalyticsTabContent />
                    </div>
                )}
            </main>

            {/* MODALS */}
            {showLaunchModal && (
                <MassLaunchModal onClose={() => setShowLaunchModal(false)} />
            )}
            {startModalStation && (
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
            )}
        </div>
    );
}

// ============================================================================
// ANALYTICS TAB COMPONENT
// ============================================================================

function AnalyticsTabContent() {
    return (
        <div className="space-y-6">
            {/* Analytics Header */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h2 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                        <div className="flex items-center justify-center w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-500/10">
                            <TrendingUp size={20} className="text-violet-500" />
                        </div>
                        Analíticas del Sistema
                    </h2>
                    <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                        Métricas de rendimiento y uso del centro de simulación
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <select 
                        className="px-3 py-2 text-sm bg-white dark:bg-gray-800 border border-slate-200 dark:border-gray-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
                        aria-label="Período de tiempo"
                    >
                        <option value="today">Hoy</option>
                        <option value="week">Esta semana</option>
                        <option value="month">Este mes</option>
                        <option value="year">Este año</option>
                    </select>
                </div>
            </div>

            {/* Analytics Content */}
            <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm shadow-slate-200/50 dark:shadow-none ring-1 ring-slate-200 dark:ring-gray-800 overflow-hidden">
                <div className="p-4 sm:p-6 lg:p-8">
                    <AnalyticsPanel />
                </div>
            </div>

            {/* Additional Analytics Sections */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Quick Stats */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm shadow-slate-200/50 dark:shadow-none ring-1 ring-slate-200 dark:ring-gray-800 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                        Resumen del Día
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Sesiones totales</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Tiempo promedio</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Ingresos</span>
                            <span className="font-semibold text-emerald-600 dark:text-emerald-400">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3">
                            <span className="text-slate-600 dark:text-slate-400">Ocupación</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--%</span>
                        </div>
                    </div>
                </div>

                {/* Top Performers */}
                <div className="bg-white dark:bg-gray-900 rounded-2xl shadow-sm shadow-slate-200/50 dark:shadow-none ring-1 ring-slate-200 dark:ring-gray-800 p-6">
                    <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">
                        Rendimiento
                    </h3>
                    <div className="space-y-4">
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Simulador más usado</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Coche más popular</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-gray-800">
                            <span className="text-slate-600 dark:text-slate-400">Track favorito</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                        <div className="flex items-center justify-between py-3">
                            <span className="text-slate-600 dark:text-slate-400">Piloto del día</span>
                            <span className="font-semibold text-slate-900 dark:text-white">--</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ============================================================================
// SUBCOMPONENTS
// ============================================================================

interface StatCardProps {
    label: string;
    value: string | number;
    description: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    trend: 'up' | 'down' | 'neutral';
    color: 'blue' | 'emerald' | 'amber' | 'violet';
    highlight?: boolean;
}

function StatCard({ label, value, description, icon: Icon, trend: _trend, color, highlight }: StatCardProps) {
    const colorConfig = {
        blue: {
            gradient: 'from-blue-500 to-blue-600',
            bg: 'bg-blue-50 dark:bg-blue-500/10',
            text: 'text-blue-600 dark:text-blue-400',
            shadow: 'shadow-blue-500/20',
            ring: 'ring-blue-100 dark:ring-blue-500/20'
        },
        emerald: {
            gradient: 'from-emerald-500 to-teal-500',
            bg: 'bg-emerald-50 dark:bg-emerald-500/10',
            text: 'text-emerald-600 dark:text-emerald-400',
            shadow: 'shadow-emerald-500/20',
            ring: 'ring-emerald-100 dark:ring-emerald-500/20'
        },
        amber: {
            gradient: 'from-amber-500 to-orange-500',
            bg: 'bg-amber-50 dark:bg-amber-500/10',
            text: 'text-amber-600 dark:text-amber-400',
            shadow: 'shadow-amber-500/20',
            ring: 'ring-amber-100 dark:ring-amber-500/20'
        },
        violet: {
            gradient: 'from-violet-500 to-purple-600',
            bg: 'bg-violet-50 dark:bg-violet-500/10',
            text: 'text-violet-600 dark:text-violet-400',
            shadow: 'shadow-violet-500/20',
            ring: 'ring-violet-100 dark:ring-violet-500/20'
        }
    };

    const config = colorConfig[color];
    const isStringValue = typeof value === 'string';

    return (
        <div className={`group relative bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl p-4 sm:p-5 transition-all duration-300 hover:shadow-lg ${
            highlight 
                ? `ring-2 ${config.ring} shadow-md ${config.shadow}` 
                : 'ring-1 ring-slate-200 dark:ring-gray-800 hover:ring-slate-300 dark:hover:ring-gray-700'
        }`}>
            {/* Icon Container */}
            <div className={`absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center justify-center w-9 h-9 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-gradient-to-br ${config.gradient} shadow-lg ${config.shadow} transition-transform duration-300 group-hover:scale-110`}>
                <Icon size={18} className="text-white" />
            </div>

            {/* Content */}
            <div className="pr-12 sm:pr-14">
                <p className="text-xs font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                    {label}
                </p>
                <p className={`mt-1 sm:mt-2 font-bold text-slate-900 dark:text-white tracking-tight ${
                    isStringValue ? 'text-lg sm:text-xl truncate' : 'text-2xl sm:text-3xl'
                }`}>
                    {value}
                </p>
                <p className="mt-1 text-xs sm:text-sm text-slate-400 dark:text-slate-500">
                    {description}
                </p>
            </div>

            {/* Highlight Indicator */}
            {highlight && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-b-xl sm:rounded-b-2xl" />
            )}
        </div>
    );
}

interface QuickActionProps {
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}

function QuickActionLink({ to, title, description, icon: Icon }: QuickActionProps & { to: string }) {
    return (
        <Link
            to={to}
            className="group relative flex flex-col p-4 sm:p-5 bg-white dark:bg-gray-900 rounded-xl sm:rounded-2xl ring-1 ring-slate-200 dark:ring-gray-800 hover:ring-slate-300 dark:hover:ring-gray-700 transition-all duration-300 hover:shadow-lg hover:-translate-y-0.5"
        >
            {/* Icon */}
            <div className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors duration-300">
                <Icon size={20} />
            </div>

            {/* Content */}
            <h3 className="mt-3 sm:mt-4 font-semibold text-slate-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                {title}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-slate-500 dark:text-slate-400 line-clamp-2">
                {description}
            </p>

            {/* Arrow */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 group-hover:bg-blue-100 dark:group-hover:bg-blue-500/20 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-all duration-300">
                <ArrowRight size={14} className="group-hover:translate-x-0.5 transition-transform" />
            </div>
        </Link>
    );
}

function QuickActionButton({ onClick, title, description, icon: Icon, variant: _variant }: QuickActionProps & { onClick: () => void; variant: 'featured' }) {
    return (
        <button
            onClick={onClick}
            className="group relative flex flex-col p-4 sm:p-5 bg-gradient-to-br from-rose-50 to-orange-50 dark:from-rose-500/10 dark:to-orange-500/10 rounded-xl sm:rounded-2xl ring-1 ring-rose-200 dark:ring-rose-500/20 hover:ring-rose-300 dark:hover:ring-rose-500/40 transition-all duration-300 hover:shadow-lg hover:shadow-rose-500/10 hover:-translate-y-0.5 text-left"
        >
            {/* Icon */}
            <div className="flex items-center justify-center w-10 h-10 sm:w-11 sm:h-11 rounded-lg sm:rounded-xl bg-gradient-to-br from-rose-500 to-orange-500 shadow-lg shadow-rose-500/25 transition-transform duration-300 group-hover:scale-110">
                <Icon size={20} className="text-white" />
            </div>

            {/* Content */}
            <h3 className="mt-3 sm:mt-4 font-semibold text-rose-900 dark:text-rose-300">
                {title}
            </h3>
            <p className="mt-1 text-xs sm:text-sm text-rose-700/70 dark:text-rose-400/70 line-clamp-2">
                {description}
            </p>

            {/* Arrow */}
            <div className="absolute top-4 right-4 sm:top-5 sm:right-5 flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/50 dark:bg-white/10 text-rose-500 dark:text-rose-400 group-hover:bg-white dark:group-hover:bg-white/20 group-hover:translate-x-0.5 transition-all duration-300">
                <ArrowRight size={14} />
            </div>

            {/* Bottom Accent */}
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-rose-500 to-orange-500 rounded-b-xl sm:rounded-b-2xl opacity-50 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

function SessionCard({ session, onUpdate }: { session: Session; onUpdate: () => void }) {
    return (
        <div className="group relative bg-slate-50 dark:bg-slate-800/50 rounded-xl p-4 ring-1 ring-slate-200/50 dark:ring-slate-700/50 hover:ring-slate-300 dark:hover:ring-slate-600 transition-all duration-300 hover:shadow-md">
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-slate-900 dark:text-white truncate">
                        {session.station_name || `Simulador ${session.station_id}`}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-slate-500 dark:text-slate-400">
                        <Users size={14} className="flex-shrink-0" />
                        <span className="truncate">{session.driver_name || "Piloto anónimo"}</span>
                    </div>
                </div>
                <span className="flex-shrink-0 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-md bg-emerald-100 dark:bg-emerald-500/20 text-emerald-700 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Activa
                </span>
            </div>

            {/* Timer */}
            <SessionTimer session={session} onUpdate={onUpdate} />

            {/* Footer */}
            <div className="mt-3 pt-3 border-t border-slate-200/50 dark:border-slate-700/50 flex items-center gap-2">
                {session.is_vr && (
                    <div className="flex items-center gap-1 text-blue-500">
                        <Glasses size={14} />
                        <span className="text-xs font-medium">VR</span>
                    </div>
                )}
                <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                    {session.payment_method} · {session.is_paid ? 'Pagado' : 'Pendiente'}
                </span>
            </div>
        </div>
    );
}

function EmptyState({ onLaunchClick }: { onLaunchClick: () => void }) {
    return (
        <div className="py-12 sm:py-16 text-center">
            {/* Icon */}
            <div className="inline-flex items-center justify-center w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-slate-100 dark:bg-slate-800 mb-4">
                <Clock size={28} className="text-slate-400 dark:text-slate-500" />
            </div>

            {/* Text */}
            <p className="text-base sm:text-lg font-medium text-slate-700 dark:text-slate-300">
                No hay sesiones activas
            </p>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                Inicia una sesión desde el panel de estaciones o usa el lanzamiento masivo
            </p>

            {/* Actions */}
            <div className="mt-6 sm:mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                    onClick={onLaunchClick}
                    className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-white bg-gradient-to-r from-rose-500 to-orange-500 rounded-xl shadow-lg shadow-rose-500/25 hover:shadow-xl hover:shadow-rose-500/30 hover:-translate-y-0.5 transition-all duration-300"
                >
                    <Rocket size={16} />
                    Lanzamiento masivo
                </button>
                <Link
                    to="/bookings"
                    className="inline-flex items-center gap-2 px-5 sm:px-6 py-2.5 sm:py-3 text-sm font-semibold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-500/10 rounded-xl hover:bg-blue-100 dark:hover:bg-blue-500/20 transition-colors duration-300"
                >
                    <Calendar size={16} />
                    Ver reservas
                </Link>
            </div>
        </div>
    );
}
