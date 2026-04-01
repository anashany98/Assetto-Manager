import { useState, useMemo, memo, useCallback } from 'react';
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
    BarChart3,
    HelpCircle,
    X
} from 'lucide-react';
import { Link } from 'react-router-dom';
import axios from 'axios';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getActiveSessions, type Session } from '../api/sessions';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SessionTimer from '../components/SessionTimer';
import MassLaunchModal from '../components/MassLaunchModal';
import { FEATURES } from '../config/features';
import { API_URL } from '../config';
import { useKeyboardShortcuts, getShortcutLabel } from '../hooks/useKeyboardShortcuts';
import { SessionCardSkeleton } from '../components/Skeleton';

type DashboardTab = 'overview' | 'analytics';

interface TabConfig {
    id: DashboardTab;
    label: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    description: string;
}

const TABS: TabConfig[] = [
    { id: 'overview', label: 'Vista General', icon: LayoutDashboard, description: 'Sesiones y estado' },
    { id: 'analytics', label: 'Analíticas', icon: BarChart3, description: 'Métricas y rendimiento' },
];

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<DashboardTab>('overview');
    const [showLaunchModal, setShowLaunchModal] = useState(false);

    const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 15000
    });

    const { data: activeSessions, isLoading: sessionsLoading } = useQuery<Session[]>({
        queryKey: ['active-sessions'],
        queryFn: getActiveSessions,
        refetchInterval: 15000
    });

    const { data: settings = [] } = useQuery<{ key: string; value: string }[]>({
        queryKey: ['dashboard-settings'],
        queryFn: async () => {
            const response = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(response.data) ? response.data : [];
        },
        staleTime: 60_000,
    });

    const sessionsCount = activeSessions?.length ?? 0;
    const paymentCurrency = useMemo(() => {
        const currency = settings.find((item) => item.key === 'payment_currency')?.value?.trim().toUpperCase();
        return currency && /^[A-Z]{3}$/.test(currency) ? currency : 'EUR';
    }, [settings]);

    const handleSessionUpdate = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
    }, [queryClient]);

    const [showShortcuts, setShowShortcuts] = useState(false);

    const refreshData = useCallback(() => {
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] });
        queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
    }, [queryClient]);

    useKeyboardShortcuts([
        { key: '1', action: () => setActiveTab('overview'), description: 'Vista General' },
        { key: '2', action: () => setActiveTab('analytics'), description: 'Analíticas' },
        { key: 'l', action: () => setShowLaunchModal(true), description: 'Lanzamiento Masivo' },
        { key: 'r', ctrlKey: true, action: refreshData, description: 'Actualizar datos' },
        { key: '?', action: () => setShowShortcuts(prev => !prev), description: 'Mostrar atajos' },
        { key: 'Escape', action: () => { setShowShortcuts(false); setShowLaunchModal(false); }, description: 'Cerrar modales' },
    ]);

    return (
        <div className="min-h-screen">
            {/* HEADER */}
            <header className="bg-[var(--bg-card)] border-b border-[var(--border-default)] sticky top-0 z-20">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
                    <div className="flex items-center justify-between h-16">
                        <div className="flex items-center gap-3">
                            <div className="hidden sm:flex items-center justify-center w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20">
                                <Monitor size={18} className="text-white" />
                            </div>
                            <div>
                                <h1 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] tracking-tight">
                                    Panel de Control
                                </h1>
                                <p className="text-xs text-[var(--text-tertiary)] hidden sm:block">
                                    Centro de gestión de simuladores
                                </p>
                            </div>
                        </div>

                        {/* Status */}
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setShowShortcuts(prev => !prev)}
                                className="p-1.5 rounded-lg text-[var(--text-tertiary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-badge)] transition-colors"
                                title="Atajos de teclado"
                            >
                                <HelpCircle size={14} />
                            </button>
                            <div className={`ac-badge ${sessionsCount > 0 ? 'ac-badge-success' : 'bg-[var(--bg-badge)] text-[var(--text-tertiary)]'}`}>
                                <Activity size={12} className={sessionsCount > 0 ? 'animate-pulse' : ''} />
                                <span className="hidden sm:inline">{sessionsCount > 0 ? 'Sistema activo' : 'En espera'}</span>
                                <span className="sm:hidden">{sessionsCount}</span>
                            </div>
                        </div>
                    </div>

                    {/* Tabs */}
                    <nav className="flex gap-1 -mb-px" role="tablist">
                        {TABS.map((tab) => {
                            const isActive = activeTab === tab.id;
                            const Icon = tab.icon;
                            return (
                                <button
                                    key={tab.id}
                                    role="tab"
                                    aria-selected={isActive}
                                    onClick={() => setActiveTab(tab.id)}
                                    className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-all ${
                                        isActive
                                            ? 'border-[var(--accent-primary)] text-[var(--accent-primary)]'
                                            : 'border-transparent text-[var(--text-tertiary)] hover:text-[var(--text-secondary)] hover:border-[var(--border-default)]'
                                    }`}
                                >
                                    <Icon size={15} />
                                    <span>{tab.label}</span>
                                </button>
                            );
                        })}
                    </nav>
                </div>
            </header>

            {/* CONTENT */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
                {activeTab === 'overview' && (
                    <div className="space-y-6 animate-fade-in" role="tabpanel" id="tabpanel-overview">
                        {/* Stats */}
                        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                            <StatCard 
                                label="Simuladores" 
                                value={statsLoading ? '--' : (stats?.total_stations || 0)} 
                                description="Configurados" 
                                icon={Monitor} 
                                color="blue" 
                                loading={statsLoading}
                            />
                            <StatCard 
                                label="Online" 
                                value={statsLoading ? '--' : (stats?.online_stations || 0)} 
                                description="Disponibles" 
                                icon={Activity} 
                                color="emerald" 
                                highlight={(stats?.online_stations || 0) > 0}
                                loading={statsLoading}
                            />
                            <StatCard 
                                label="Sincronizando" 
                                value={statsLoading ? '--' : (stats?.syncing_stations || 0)} 
                                description="Descargando" 
                                icon={HardDrive} 
                                color="amber" 
                                loading={statsLoading}
                            />
                            <StatCard 
                                label="Perfil Activo" 
                                value={statsLoading ? '--' : (stats?.active_profile || "—")} 
                                description="Configuración" 
                                icon={Gauge} 
                                color="violet" 
                                loading={statsLoading}
                            />
                        </section>

                        {/* Quick Actions */}
                        <section>
                            <h2 className="text-sm font-semibold text-[var(--text-secondary)] uppercase tracking-wider mb-3">
                                Acciones Rápidas
                            </h2>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                                <QuickActionButton
                                    onClick={() => setShowLaunchModal(true)}
                                    title="Lanzamiento Masivo"
                                    description="Múltiples simuladores"
                                    icon={Rocket}
                                />
                                {FEATURES.profiles && (
                                    <QuickActionLink to="/profiles" title="Perfiles Volante" description="Config FFB" icon={Zap} />
                                )}
                                {FEATURES.tournaments && (
                                    <QuickActionLink to="/events" title="Organizar Torneo" description="Competiciones" icon={Trophy} />
                                )}
                                {FEATURES.settings && (
                                    <QuickActionLink to="/settings" title="Configuración" description="Ajustes sistema" icon={Settings} />
                                )}
                            </div>
                        </section>

                        {/* Active Sessions */}
                        <section className="ac-card-elevated overflow-hidden">
                            <div className="px-5 py-4 border-b border-[var(--border-default)] flex items-center justify-between">
                                <div className="flex items-center gap-2.5">
                                    <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-[var(--accent-success-muted)]">
                                        <Play size={14} className="text-[var(--accent-success)]" />
                                    </div>
                                    <h2 className="font-semibold text-[var(--text-primary)]">Sesiones en Curso</h2>
                                </div>
                                <span className={`ac-badge ${sessionsCount > 0 ? 'ac-badge-success' : 'bg-[var(--bg-badge)] text-[var(--text-tertiary)]'}`}>
                                    {sessionsCount} {sessionsCount === 1 ? 'activa' : 'activas'}
                                </span>
                            </div>

                            <div className="p-5">
                                {sessionsLoading ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {Array.from({ length: 3 }).map((_, i) => (
                                            <SessionCardSkeleton key={i} />
                                        ))}
                                    </div>
                                ) : activeSessions && activeSessions.length > 0 ? (
                                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                                        {activeSessions.map(session => (
                                            <MemoizedSessionCard
                                                key={session.id}
                                                session={session}
                                                onUpdate={handleSessionUpdate}
                                            />
                                        ))}
                                    </div>
                                ) : (
                                    <EmptyState onLaunchClick={() => setShowLaunchModal(true)} />
                                )}
                            </div>
                        </section>
                    </div>
                )}

                {activeTab === 'analytics' && (
                    <div className="animate-fade-in" role="tabpanel" id="tabpanel-analytics">
                        <AnalyticsTabContent paymentCurrency={paymentCurrency} />
                    </div>
                )}
            </main>

            {/* Keyboard Shortcuts Help */}
            {showShortcuts && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setShowShortcuts(false)}>
                    <div className="ac-card p-6 max-w-sm w-full mx-4" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="text-lg font-bold text-[var(--text-primary)]">Atajos de Teclado</h3>
                            <button onClick={() => setShowShortcuts(false)} className="p-1 rounded hover:bg-[var(--bg-badge)] text-[var(--text-tertiary)]">
                                <X size={16} />
                            </button>
                        </div>
                        <div className="space-y-2">
                            {[
                                { keys: '1', desc: 'Vista General' },
                                { keys: '2', desc: 'Analíticas' },
                                { keys: 'L', desc: 'Lanzamiento Masivo' },
                                { keys: getShortcutLabel({ key: 'r', ctrlKey: true, action: () => {} }), desc: 'Actualizar datos' },
                                { keys: '?', desc: 'Mostrar esta ayuda' },
                                { keys: 'Esc', desc: 'Cerrar modales' },
                            ].map((item, i) => (
                                <div key={i} className="flex items-center justify-between py-1.5">
                                    <span className="text-sm text-[var(--text-secondary)]">{item.desc}</span>
                                    <kbd className="px-2 py-0.5 text-xs font-mono bg-[var(--bg-badge)] border border-[var(--border-default)] rounded text-[var(--text-tertiary)]">
                                        {item.keys}
                                    </kbd>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Modals */}
            {showLaunchModal && <MassLaunchModal onClose={() => setShowLaunchModal(false)} />}
        </div>
    );
}

// ============================================================================
// ANALYTICS TAB
// ============================================================================

type DateFilter = 'today' | 'week' | 'month' | 'year';

function AnalyticsTabContent({ paymentCurrency }: { paymentCurrency: string }) {
    const [dateFilter, setDateFilter] = useState<DateFilter>('today');
    
    const rangeDaysMap: Record<DateFilter, number> = {
        today: 1,
        week: 7,
        month: 30,
        year: 365
    };
    
    const { data: analyticsData, isLoading: analyticsLoading, error: analyticsError, refetch: refetchAnalytics } = useQuery({
        queryKey: ['analytics', dateFilter],
        queryFn: async () => {
            const { default: axios } = await import('axios');
            const { API_URL } = await import('../config');
            const res = await axios.get(`${API_URL}/analytics/overview`, {
                params: { range_days: rangeDaysMap[dateFilter] }
            });
            return res.data;
        },
        refetchInterval: 60000,
        retry: 2
    });

    const summaryData = useMemo(() => {
        if (!analyticsData?.summary) return null;
        const s = analyticsData.summary;
        
        const periodMap: Record<DateFilter, number> = {
            today: s.sessions_today || 0,
            week: s.sessions_this_week || 0,
            month: s.sessions_this_month || 0,
            year: s.total_sessions || 0,
        };
        
        return {
            sessionsTotal: periodMap[dateFilter] || 0,
            avgDuration: analyticsData.avg_session_duration 
                ? Math.round(analyticsData.avg_session_duration / 60) 
                : '--',
            revenue: analyticsData.total_revenue || '--',
            occupancy: analyticsData.occupancy_rate || '--',
            topStation: analyticsData.most_used_station_name || '--',
            topCar: analyticsData.popular_cars?.[0]?.name || '--',
            topTrack: analyticsData.popular_tracks?.[0]?.name || '--',
            topDriver: analyticsData.top_drivers?.[0]?.name || '--',
        };
    }, [analyticsData, dateFilter]);

    const revenueLabel = useMemo(() => {
        const numericValue = typeof summaryData?.revenue === 'number'
            ? summaryData.revenue
            : Number(summaryData?.revenue);
        if (!Number.isFinite(numericValue)) return '--';
        return new Intl.NumberFormat(undefined, {
            style: 'currency',
            currency: paymentCurrency,
            maximumFractionDigits: 2,
        }).format(numericValue);
    }, [paymentCurrency, summaryData?.revenue]);

    return (
        <div className="space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-violet-500/10">
                        <TrendingUp size={18} className="text-violet-500" />
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-[var(--text-primary)]">Analíticas</h2>
                        <p className="text-xs text-[var(--text-tertiary)]">Métricas de rendimiento</p>
                    </div>
                </div>
                <select 
                    className="ac-input w-auto max-w-[160px]"
                    value={dateFilter}
                    onChange={(e) => setDateFilter(e.target.value as DateFilter)}
                >
                    <option value="today">Hoy</option>
                    <option value="week">Esta semana</option>
                    <option value="month">Este mes</option>
                    <option value="year">Este año</option>
                </select>
            </div>

            <div className="ac-card-elevated p-5 lg:p-7">
                <AnalyticsPanel externalData={analyticsData} />
            </div>

            {analyticsLoading ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {[1, 2].map(i => (
                        <div key={i} className="ac-card p-5 animate-pulse">
                            <div className="h-5 w-32 bg-[var(--bg-badge)] rounded mb-4" />
                            {[1,2,3,4].map(j => (
                                <div key={j} className="flex justify-between py-2 border-b border-[var(--border-subtle)]">
                                    <div className="h-4 w-24 bg-[var(--bg-badge)] rounded" />
                                    <div className="h-4 w-16 bg-[var(--bg-badge)] rounded" />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            ) : analyticsError ? (
                <div className="ac-card p-6 text-center">
                    <p className="text-[var(--text-tertiary)]">Error al cargar analíticas</p>
                    <button 
                        onClick={() => refetchAnalytics()}
                        className="mt-2 text-sm text-[var(--accent-primary)] hover:underline"
                    >
                        Reintentar
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    <SummaryCard title="Resumen del Período" items={[
                        { label: 'Sesiones totales', value: summaryData?.sessionsTotal !== undefined ? String(summaryData.sessionsTotal) : '--' },
                        { label: 'Duración promedio', value: summaryData?.avgDuration !== '--' ? `${summaryData?.avgDuration} min` : '--' },
                        { label: 'Ingresos', value: revenueLabel, accent: true },
                        { label: 'Ocupación', value: summaryData?.occupancy !== '--' ? `${summaryData?.occupancy}%` : '--' },
                    ]} />
                    <SummaryCard title="Rendimiento" items={[
                        { label: 'Simulador más usado', value: summaryData?.topStation || '--' },
                        { label: 'Coche más popular', value: summaryData?.topCar || '--' },
                        { label: 'Track favorito', value: summaryData?.topTrack || '--' },
                        { label: 'Piloto del período', value: summaryData?.topDriver || '--' },
                    ]} />
                </div>
            )}
        </div>
    );
}

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

interface StatCardProps {
    label: string;
    value: string | number;
    description: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    color: 'blue' | 'emerald' | 'amber' | 'violet';
    highlight?: boolean;
    loading?: boolean;
}

const COLORS = {
    blue: { icon: 'from-blue-500 to-blue-600', shadow: 'shadow-blue-500/15', muted: 'bg-blue-500/10' },
    emerald: { icon: 'from-emerald-500 to-teal-500', shadow: 'shadow-emerald-500/15', muted: 'bg-emerald-500/10' },
    amber: { icon: 'from-amber-500 to-orange-500', shadow: 'shadow-amber-500/15', muted: 'bg-amber-500/10' },
    violet: { icon: 'from-violet-500 to-purple-600', shadow: 'shadow-violet-500/15', muted: 'bg-violet-500/10' },
};

const StatCard = memo(function StatCard({ label, value, description, icon: Icon, color, highlight, loading }: StatCardProps) {
    const c = COLORS[color];
    const isString = typeof value === 'string';

    return (
        <div className={`ac-stat-card group ${highlight ? 'border-emerald-500/20' : ''} ${loading ? 'opacity-60' : ''}`}>
            <div className={`absolute top-4 right-4 w-9 h-9 rounded-lg bg-gradient-to-br ${c.icon} shadow-md ${c.shadow} flex items-center justify-center transition-transform group-hover:scale-110 ${loading ? 'animate-pulse' : ''}`}>
                <Icon size={16} className="text-white" />
            </div>
            <div className="pr-12">
                <p className="ac-stat-label">{label}</p>
                {loading ? (
                    <div className="h-7 w-16 bg-[var(--bg-badge)] rounded animate-pulse" />
                ) : (
                    <p className={`ac-stat-value ${isString ? 'text-xl truncate' : ''}`}>{value}</p>
                )}
                <p className="text-xs text-[var(--text-tertiary)] mt-1">{description}</p>
            </div>
            {highlight && (
                <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-emerald-500 to-teal-500 rounded-b-[var(--radius-lg)]" />
            )}
        </div>
    );
});

interface QuickActionProps {
    title: string;
    description: string;
    icon: React.ComponentType<{ size?: number; className?: string }>;
}

function QuickActionLink({ to, title, description, icon: Icon }: QuickActionProps & { to: string }) {
    return (
        <Link
            to={to}
            className="group ac-card flex flex-col p-4 hover:-translate-y-0.5"
        >
            <div className="w-10 h-10 rounded-lg bg-[var(--bg-badge)] text-[var(--text-tertiary)] flex items-center justify-center group-hover:bg-[var(--accent-primary-muted)] group-hover:text-[var(--accent-primary)] transition-colors">
                <Icon size={18} />
            </div>
            <h3 className="mt-3 font-semibold text-sm text-[var(--text-primary)] group-hover:text-[var(--accent-primary)] transition-colors">{title}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5 line-clamp-1">{description}</p>
            <ArrowRight size={14} className="absolute top-4 right-4 text-[var(--text-tertiary)] group-hover:text-[var(--accent-primary)] group-hover:translate-x-0.5 transition-all opacity-0 group-hover:opacity-100" />
        </Link>
    );
}

function QuickActionButton({ onClick, title, description, icon: Icon }: QuickActionProps & { onClick: () => void }) {
    return (
        <button
            onClick={onClick}
            className="group relative flex flex-col p-4 rounded-[var(--radius-lg)] bg-gradient-to-br from-blue-500/8 to-cyan-500/5 border border-blue-500/15 hover:border-blue-500/30 transition-all hover:shadow-lg hover:shadow-blue-500/5 hover:-translate-y-0.5 text-left"
        >
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 shadow-md shadow-blue-500/20 flex items-center justify-center transition-transform group-hover:scale-110">
                <Icon size={18} className="text-white" />
            </div>
            <h3 className="mt-3 font-semibold text-sm text-[var(--text-primary)]">{title}</h3>
            <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{description}</p>
            <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-500 to-indigo-600 rounded-b-[var(--radius-lg)] opacity-40 group-hover:opacity-100 transition-opacity" />
        </button>
    );
}

function SessionCard({ session, onUpdate }: { session: Session; onUpdate: () => void }) {
    return (
        <div className="group relative bg-[var(--bg-card-hover)] rounded-xl p-4 border border-[var(--border-subtle)] hover:border-[var(--border-default)] transition-all hover:shadow-sm">
            <div className="flex items-start justify-between mb-2.5">
                <div className="min-w-0 flex-1">
                    <h4 className="font-semibold text-sm text-[var(--text-primary)] truncate">
                        {session.station_name || `Simulador ${session.station_id}`}
                    </h4>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <Users size={12} className="text-[var(--text-tertiary)] flex-shrink-0" />
                        <span className="text-xs text-[var(--text-secondary)] truncate">{session.driver_name || "Anónimo"}</span>
                    </div>
                </div>
                <span className="ac-badge ac-badge-success text-[10px]">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    Activa
                </span>
            </div>

            <SessionTimer session={session} onUpdate={onUpdate} />

            <div className="mt-2.5 pt-2.5 border-t border-[var(--border-subtle)] flex items-center gap-2 text-xs text-[var(--text-tertiary)]">
                {session.is_vr && (
                    <span className="flex items-center gap-1 text-blue-500 font-medium">
                        <Glasses size={12} />VR
                    </span>
                )}
                <span className="font-medium">
                    {session.payment_method ?? 'Sin método'} · {session.is_paid ? 'Pagado' : 'Pendiente'}
                </span>
            </div>
        </div>
    );
}

const MemoizedSessionCard = memo(SessionCard);

const EmptyState = memo(function EmptyState({ onLaunchClick }: { onLaunchClick: () => void }) {
    return (
        <div className="py-12 text-center">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[var(--bg-badge)] mb-4">
                <Clock size={24} className="text-[var(--text-tertiary)]" />
            </div>
            <p className="text-base font-medium text-[var(--text-secondary)]">No hay sesiones activas</p>
            <p className="mt-1 text-sm text-[var(--text-tertiary)] max-w-xs mx-auto">
                Inicia una sesión o usa el lanzamiento masivo
            </p>
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-3">
                <button
                    onClick={onLaunchClick}
                    className="ac-btn ac-btn-primary"
                >
                    <Rocket size={15} />
                    Lanzamiento masivo
                </button>
                <Link to="/bookings" className="ac-btn ac-btn-secondary">
                    <Calendar size={15} />
                    Ver reservas
                </Link>
            </div>
        </div>
    );
});

const SummaryCard = memo(function SummaryCard({ title, items }: { title: string; items: { label: string; value: string; accent?: boolean }[] }) {
    return (
        <div className="ac-card p-5">
            <h3 className="font-semibold text-[var(--text-primary)] mb-4">{title}</h3>
            <div className="space-y-3">
                {items.map((item, i) => (
                    <div key={i} className={`flex items-center justify-between py-2 ${i < items.length - 1 ? 'border-b border-[var(--border-subtle)]' : ''}`}>
                        <span className="text-sm text-[var(--text-secondary)]">{item.label}</span>
                        <span className={`text-sm font-semibold ${item.accent ? 'text-[var(--accent-success)]' : 'text-[var(--text-primary)]'}`}>
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
});
