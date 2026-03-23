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
    Clock
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getActiveSessions, type Session } from '../api/sessions';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SessionTimer from '../components/SessionTimer';
import StartSessionModal from '../components/StartSessionModal';
import MassLaunchModal from '../components/MassLaunchModal';
import { FEATURES } from '../config/features';

export default function DashboardV2() {
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

    const sessionsCount = activeSessions?.length ?? 0;

    return (
        <div className="p-6 lg:p-8 space-y-8 max-w-7xl mx-auto">
            {/* Page Header */}
            <header className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-gray-900 dark:text-white tracking-tight">
                        Panel de Control
                    </h1>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                        Vista general del centro de simulación
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <Link
                        to="/bookings"
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                    >
                        <Calendar size={16} />
                        <span>Nueva Reserva</span>
                    </Link>
                    <button
                        onClick={() => setShowLaunchModal(true)}
                        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors shadow-sm"
                    >
                        <Rocket size={16} />
                        <span>Lanzamiento Masivo</span>
                    </button>
                </div>
            </header>

            {/* Stats Grid */}
            <section>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
                    <StatCardV2
                        label="Simuladores"
                        value={stats?.total_stations ?? 0}
                        subtitle="Total configurados"
                        icon={Monitor}
                        color="blue"
                    />
                    <StatCardV2
                        label="En línea"
                        value={stats?.online_stations ?? 0}
                        subtitle="Disponibles ahora"
                        icon={Activity}
                        color="green"
                        highlight={(stats?.online_stations ?? 0) > 0}
                    />
                    <StatCardV2
                        label="Sincronizando"
                        value={stats?.syncing_stations ?? 0}
                        subtitle="Descargando mods"
                        icon={HardDrive}
                        color="amber"
                    />
                    <StatCardV2
                        label="Perfil Activo"
                        value={stats?.active_profile ?? 'Ninguno'}
                        subtitle="Configuración global"
                        icon={Gauge}
                        color="violet"
                        isString
                    />
                </div>
            </section>

            {/* Quick Actions */}
            <section>
                <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Acciones Rápidas
                    </h2>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <QuickActionV2
                        onClick={() => setShowLaunchModal(true)}
                        title="Lanzamiento Masivo"
                        description="Desplegar en múltiples simuladores"
                        icon={Rocket}
                        variant="primary"
                    />
                    {FEATURES.profiles && (
                        <QuickActionLinkV2
                            to="/profiles"
                            title="Perfiles Volante"
                            description="Configurar FFB y hardware"
                            icon={Zap}
                        />
                    )}
                    {FEATURES.tournaments && (
                        <QuickActionLinkV2
                            to="/events"
                            title="Organizar Torneo"
                            description="Crear competiciones"
                            icon={Trophy}
                        />
                    )}
                    {FEATURES.settings && (
                        <QuickActionLinkV2
                            to="/settings"
                            title="Configuración"
                            description="Ajustes del sistema"
                            icon={Settings}
                        />
                    )}
                </div>
            </section>

            {/* Main Content Grid */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 lg:gap-8">
                {/* Active Sessions */}
                <section className="xl:col-span-2">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                        {/* Section Header */}
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                                    <Play size={16} className="text-emerald-500" />
                                </div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Sesiones Activas
                                </h2>
                            </div>
                            <div className="flex items-center gap-2">
                                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${
                                    sessionsCount > 0
                                        ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10 dark:text-emerald-400'
                                        : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400'
                                }`}>
                                    {sessionsCount} {sessionsCount === 1 ? 'activa' : 'activas'}
                                </span>
                            </div>
                        </div>

                        {/* Sessions List */}
                        <div className="p-6">
                            {activeSessions && activeSessions.length > 0 ? (
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    {activeSessions.map(session => (
                                        <SessionCardV2
                                            key={session.id}
                                            session={session}
                                            onUpdate={() => queryClient.invalidateQueries({ queryKey: ['active-sessions'] })}
                                        />
                                    ))}
                                </div>
                            ) : (
                                <EmptyStateV2 onLaunchClick={() => setShowLaunchModal(true)} />
                            )}
                        </div>
                    </div>
                </section>

                {/* Analytics Sidebar */}
                <section className="xl:sticky xl:top-24 xl:self-start">
                    <div className="bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
                        <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-violet-50 dark:bg-violet-500/10 flex items-center justify-center">
                                    <TrendingUp size={16} className="text-violet-500" />
                                </div>
                                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                                    Analíticas
                                </h2>
                            </div>
                        </div>
                        <div className="p-6">
                            <AnalyticsPanel />
                        </div>
                    </div>
                </section>
            </div>

            {/* Modals */}
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
// Subcomponents
// ============================================================================

interface StatCardV2Props {
    label: string;
    value: number | string;
    subtitle: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    color: 'blue' | 'green' | 'amber' | 'violet';
    highlight?: boolean;
    isString?: boolean;
}

function StatCardV2({ label, value, subtitle, icon: Icon, color, highlight, isString }: StatCardV2Props) {
    const colorStyles = {
        blue: {
            bg: 'bg-blue-50 dark:bg-blue-500/10',
            icon: 'text-blue-500',
            dot: 'bg-blue-500'
        },
        green: {
            bg: 'bg-emerald-50 dark:bg-emerald-500/10',
            icon: 'text-emerald-500',
            dot: 'bg-emerald-500'
        },
        amber: {
            bg: 'bg-amber-50 dark:bg-amber-500/10',
            icon: 'text-amber-500',
            dot: 'bg-amber-500'
        },
        violet: {
            bg: 'bg-violet-50 dark:bg-violet-500/10',
            icon: 'text-violet-500',
            dot: 'bg-violet-500'
        }
    };

    const styles = colorStyles[color];

    return (
        <div className={`relative p-5 bg-white dark:bg-gray-900 rounded-2xl border transition-all duration-200 hover:shadow-md ${
            highlight
                ? 'border-emerald-200 dark:border-emerald-500/30 shadow-sm'
                : 'border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700'
        }`}>
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                        {label}
                    </p>
                    <p className={`mt-2 font-bold text-gray-900 dark:text-white tracking-tight ${
                        isString ? 'text-xl truncate' : 'text-3xl'
                    }`}>
                        {value}
                    </p>
                    <p className="mt-1 text-sm text-gray-400 dark:text-gray-500">
                        {subtitle}
                    </p>
                </div>
                <div className={`w-10 h-10 rounded-xl ${styles.bg} flex items-center justify-center`}>
                    <Icon size={20} className={styles.icon} />
                </div>
            </div>
            {highlight && (
                <div className={`absolute bottom-0 left-0 right-0 h-0.5 ${styles.dot} rounded-b-2xl`} />
            )}
        </div>
    );
}

interface QuickActionV2Props {
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
    variant?: 'primary' | 'secondary';
}

function QuickActionLinkV2({ to, title, description, icon: Icon }: QuickActionV2Props & { to: string }) {
    return (
        <Link
            to={to}
            className="group p-5 bg-white dark:bg-gray-900 rounded-2xl border border-gray-100 dark:border-gray-800 hover:border-gray-200 dark:hover:border-gray-700 hover:shadow-md transition-all duration-200"
        >
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-500 dark:text-gray-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-500/10 group-hover:text-blue-500 transition-colors">
                    <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
                        {title}
                    </h3>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 line-clamp-1">
                        {description}
                    </p>
                </div>
                <ArrowRight size={16} className="text-gray-300 dark:text-gray-600 group-hover:text-blue-500 group-hover:translate-x-0.5 transition-all mt-1" />
            </div>
        </Link>
    );
}

function QuickActionV2({ onClick, title, description, icon: Icon, variant: _variant }: QuickActionV2Props & { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="group w-full text-left p-5 bg-gradient-to-br from-blue-50 to-indigo-50 dark:from-blue-500/10 dark:to-indigo-500/10 rounded-2xl border border-blue-100 dark:border-blue-500/20 hover:border-blue-200 dark:hover:border-blue-500/30 hover:shadow-md transition-all duration-200"
        >
            <div className="flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-blue-500 flex items-center justify-center text-white shadow-sm">
                    <Icon size={20} />
                </div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-blue-900 dark:text-blue-300">
                        {title}
                    </h3>
                    <p className="mt-1 text-sm text-blue-600/70 dark:text-blue-400/70 line-clamp-1">
                        {description}
                    </p>
                </div>
                <ArrowRight size={16} className="text-blue-400 group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all mt-1" />
            </div>
        </button>
    );
}

function SessionCardV2({ session, onUpdate }: { session: Session; onUpdate: () => void }) {
    return (
        <div className="group p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-100 dark:border-gray-700/50 hover:border-gray-200 dark:hover:border-gray-600 transition-all">
            <div className="flex items-start justify-between mb-3">
                <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                        {session.station_name || `Simulador ${session.station_id}`}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-1 text-sm text-gray-500 dark:text-gray-400">
                        <Users size={14} />
                        <span className="truncate">{session.driver_name || 'Piloto anónimo'}</span>
                    </div>
                </div>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-1 rounded-md bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Activa
                </span>
            </div>
            <SessionTimer session={session} onUpdate={onUpdate} />
            <div className="mt-3 pt-3 border-t border-gray-200/50 dark:border-gray-700/50 flex items-center gap-2">
                {session.is_vr && (
                    <span className="inline-flex items-center gap-1 text-xs text-blue-500">
                        <Glasses size={12} />
                        VR
                    </span>
                )}
                <span className="text-xs text-gray-500 dark:text-gray-400">
                    {session.payment_method} · {session.is_paid ? 'Pagado' : 'Pendiente'}
                </span>
            </div>
        </div>
    );
}

function EmptyStateV2({ onLaunchClick }: { onLaunchClick: () => void }) {
    return (
        <div className="py-16 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-gray-100 dark:bg-gray-800 mb-4">
                <Clock size={24} className="text-gray-400 dark:text-gray-500" />
            </div>
            <p className="text-base font-medium text-gray-700 dark:text-gray-300">
                No hay sesiones activas
            </p>
            <p className="mt-1 text-sm text-gray-500 dark:text-gray-400 max-w-xs mx-auto">
                Inicia una sesión desde el panel de estaciones o usa el lanzamiento masivo
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                    onClick={onLaunchClick}
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-white bg-blue-600 rounded-xl hover:bg-blue-700 transition-colors shadow-sm"
                >
                    <Rocket size={16} />
                    Lanzamiento masivo
                </button>
                <Link
                    to="/bookings"
                    className="inline-flex items-center gap-2 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-200 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                >
                    <Calendar size={16} />
                    Ver reservas
                </Link>
            </div>
        </div>
    );
}
