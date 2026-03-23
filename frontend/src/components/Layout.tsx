import React, { useEffect, useState, useCallback } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
    LayoutDashboard,
    Settings,
    Users,
    Trophy,
    Calendar,
    Library,
    MonitorPlay,
    List,
    Crown,
    ChevronLeft,
    ChevronRight,
    ChevronDown,
    History as HistoryIcon,
    CalendarCheck,
    Sun,
    Moon,
    Gamepad2,
    AlertTriangle,
    LayoutGrid,
    CalendarPlus,
    BarChart3,
    Eye,
    Menu,
    X,
    Search,
    LogOut,
    Cpu,
    Swords,
    Monitor,
    UserCog
} from 'lucide-react';
import { useTheme } from '../contexts/useTheme';
import { useAuth } from '../context/useAuth';
import { useLicense } from '../context/LicenseContext';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { FEATURES } from '../config/features';
import AppUpdateBanner from './AppUpdateBanner';
import Breadcrumbs from './Breadcrumbs';
import { getPairedStationId } from '../utils/stationPairing';


// ============================================================================
// TYPES
// ============================================================================

interface NavSection {
    label: string;
    items: NavItemConfig[];
}

interface NavItemConfig {
    to: string;
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    featureKey?: keyof typeof FEATURES;
    permissionKey?: string;
}

// ============================================================================
// NAV CONFIGURATION
// ============================================================================

const NAV_SECTIONS: NavSection[] = [
    {
        label: 'Gestión',
        items: [
            { to: '/admin', icon: LayoutDashboard, label: 'Panel Control', permissionKey: 'dashboard' },
            { to: '/drivers', icon: Users, label: 'Pilotos', featureKey: 'drivers', permissionKey: 'drivers' },
            { to: '/events', icon: Calendar, label: 'Torneos', featureKey: 'tournaments', permissionKey: 'events' },
            { to: '/championships', icon: Trophy, label: 'Campeonatos', featureKey: 'championships', permissionKey: 'championships' },
            { to: '/history', icon: HistoryIcon, label: 'Historial', featureKey: 'history', permissionKey: 'history' },
            { to: '/bookings', icon: CalendarCheck, label: 'Reservas', featureKey: 'bookings', permissionKey: 'bookings' },
            { to: '/reservations', icon: LayoutGrid, label: 'Mesas', featureKey: 'tables', permissionKey: 'tables' },
            { to: '/analytics', icon: BarChart3, label: 'Ingresos', featureKey: 'analytics', permissionKey: 'analytics' },
            { to: '/online-reservations', icon: CalendarPlus, label: 'Reservas Online', featureKey: 'online_reservations', permissionKey: 'online_reservations' },
            { to: '/compare', icon: BarChart3, label: 'Comparar Vueltas', featureKey: 'lap_comparison', permissionKey: 'lap_comparison' },
        ],
    },
    {
        label: 'Contenido',
        items: [
            { to: '/admin/scenarios', icon: Gamepad2, label: 'Sesiones Kiosk', featureKey: 'kiosk', permissionKey: 'kiosk' },
            { to: '/mods', icon: Library, label: 'Librería Mods', featureKey: 'mods', permissionKey: 'mods' },
        ],
    },
    {
        label: 'Sistema',
        items: [
            { to: '/settings', icon: Settings, label: 'Configuración', featureKey: 'settings', permissionKey: 'settings' },
            { to: '/settings?tab=game', icon: Gamepad2, label: 'Editor AC', featureKey: 'editor', permissionKey: 'editor' },
            { to: '/profiles', icon: Users, label: 'Perfiles', featureKey: 'profiles', permissionKey: 'profiles' },
            { to: '/users', icon: UserCog, label: 'Usuarios', permissionKey: 'users' },
            { to: '/hardware', icon: Cpu, label: 'Hardware', permissionKey: 'hardware' },
        ],
    },
    {
        label: 'Sala & TV',
        items: [
            { to: '/remote', icon: MonitorPlay, label: 'Mando TV', featureKey: 'tv_remote', permissionKey: 'tv_remote' },
            { to: '/director', icon: MonitorPlay, label: 'Director TV', featureKey: 'tv_spectator', permissionKey: 'tv_spectator' },
            { to: '/tv/spectator', icon: Eye, label: 'Espectador TV', featureKey: 'tv_spectator', permissionKey: 'tv_spectator' },
            { to: '/leaderboard', icon: List, label: 'Clasificación', featureKey: 'leaderboard', permissionKey: 'leaderboard' },
            { to: '/hall-of-fame', icon: Crown, label: 'Salón Fama', featureKey: 'hall_of_fame', permissionKey: 'hall_of_fame' },
            { to: '/kiosk', icon: Monitor, label: 'Pantallas', featureKey: 'kiosk_menu', permissionKey: 'kiosk' },
        ],
    },
];

// Permission map for routes
const ROUTE_PERMISSION_MAP: Record<string, string> = {
    '/admin/scenarios': 'kiosk',
    '/admin': 'dashboard',
    '/drivers': 'drivers',
    '/events': 'events',
    '/championships': 'championships',
    '/history': 'history',
    '/bookings': 'bookings',
    '/reservations': 'tables',
    '/analytics': 'analytics',
    '/mods': 'mods',
    '/online-reservations': 'online_reservations',
    '/compare': 'lap_comparison',
    '/settings?tab=game': 'editor',
    '/settings': 'settings',
    '/profiles': 'profiles',
    '/users': 'users',
    '/remote': 'tv_remote',
    '/director': 'tv_spectator',
    '/tv/spectator': 'tv_spectator',
    '/leaderboard': 'leaderboard',
    '/hall-of-fame': 'hall_of_fame',
    '/kiosk': 'kiosk',
    '/hardware': 'hardware',
    '/': 'dashboard',
};

// ============================================================================
// SUB-COMPONENTS
// ============================================================================

const NavItem = ({
    to,
    icon: Icon,
    label,
    collapsed,
    onNavigate,
}: {
    to: string;
    icon: React.ComponentType<{ size?: number }>;
    label: string;
    collapsed?: boolean;
    onNavigate?: () => void;
}) => {
    const location = useLocation();
    const isActive = location.pathname === to || (to !== '/' && location.pathname.startsWith(to) && to.length > 1);
    const itemId = `nav-item-${to.replace(/\//g, '-')}`;

    return (
        <Link
            to={to}
            onClick={onNavigate}
            role="menuitem"
            id={itemId}
            aria-current={isActive ? 'page' : undefined}
            className={`group flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-3 py-2.5 rounded-xl transition-all duration-200 text-sm ${isActive
                ? 'bg-[var(--accent-primary)] text-[var(--text-primary)] shadow-md'
                : 'text-[var(--nav-item-color)] hover:bg-[var(--nav-item-hover-bg)] hover:text-[var(--nav-item-hover-color)]'
                }`}
            style={isActive ? { boxShadow: 'var(--nav-item-active-shadow)' } : undefined}
            title={collapsed ? label : ''}
        >
            <span className={`flex-shrink-0 transition-transform duration-200 ${!isActive ? 'group-hover:scale-110' : ''}`}>
                <Icon size={18} />
            </span>
            {!collapsed && (
                <span className="font-medium truncate">{label}</span>
            )}
            {isActive && !collapsed && (
                <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[var(--bg-card)]/70" aria-hidden="true" />
            )}
        </Link>
    );
};

const NavSectionComponent = ({
    section,
    collapsed,
    onNavigate,
    isExpanded,
    onToggle,
    user,
    isModuleEnabled,
}: {
    section: NavSection;
    collapsed: boolean;
    onNavigate?: () => void;
    isExpanded: boolean;
    onToggle: () => void;
    user: { role?: string; permissions?: string[] } | null;
    isModuleEnabled: (key: string) => boolean;
}) => {
    const visibleItems = section.items.filter((item) => {
        // Feature flag check
        if (item.featureKey && !FEATURES[item.featureKey]) return false;

        // Permission check
        const perm = item.permissionKey;
        if (!perm) return true;
        if (user?.role === 'admin') return true;
        if (user?.permissions && !user.permissions.includes(perm)) return false;

        // License check
        if (!isModuleEnabled(perm)) return false;

        return true;
    });

    if (visibleItems.length === 0) return null;

    return (
        <div className="mb-1">
            {!collapsed ? (
                <button
                    onClick={onToggle}
                    className="w-full flex items-center justify-between px-3 py-2 text-[11px] font-bold uppercase tracking-[0.08em] text-[var(--nav-section-label)] hover:text-[var(--text-secondary)] transition-colors"
                >
                    <span>{section.label}</span>
                    <ChevronDown
                        size={12}
                        className={`transition-transform duration-200 ${isExpanded ? 'rotate-0' : '-rotate-90'}`}
                    />
                </button>
            ) : (
                <div className="h-px mx-3 my-2 bg-[var(--border-default)]" />
            )}

            {(isExpanded || collapsed) && (
                <div className="space-y-0.5">
                    {visibleItems.map((item) => (
                        <NavItem
                            key={item.to}
                            to={item.to}
                            icon={item.icon}
                            label={item.label}
                            collapsed={collapsed}
                            onNavigate={onNavigate}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const ThemeToggle = ({ collapsed }: { collapsed: boolean }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-lg bg-[var(--bg-badge)] hover:bg-[var(--bg-card-hover)] border border-[var(--border-default)] transition-all duration-200 hover:scale-105"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
        >
            {theme === 'dark' ? (
                <Sun size={collapsed ? 14 : 16} className="text-amber-400" aria-hidden="true" />
            ) : (
                <Moon size={collapsed ? 14 : 16} className="text-blue-500" aria-hidden="true" />
            )}
        </button>
    );
};

// ============================================================================
// MAIN LAYOUT
// ============================================================================

export default function Layout({ children }: { children: React.ReactNode }) {
    const [isMobile, setIsMobile] = useState(() => typeof window !== 'undefined' && window.innerWidth < 1024);
    const [isTablet, setIsTablet] = useState(() => typeof window !== 'undefined' && window.innerWidth >= 768 && window.innerWidth < 1024);
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        return localStorage.getItem('sidebar-collapsed') === 'true';
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
        const saved = localStorage.getItem('nav-sections-expanded');
        if (saved) return JSON.parse(saved);
        return Object.fromEntries(NAV_SECTIONS.map((s) => [s.label, true]));
    });

    const location = useLocation();
    const { isAuthenticated, user, logout } = useAuth();
    const { isModuleEnabled } = useLicense();

    // Responsive
    useEffect(() => {
        const onResize = () => {
            const w = window.innerWidth;
            setIsMobile(w < 768);
            setIsTablet(w >= 768 && w < 1024);
        };
        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Persist sidebar
    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isDesktopCollapsed));
    }, [isDesktopCollapsed]);

    // Persist sections
    useEffect(() => {
        localStorage.setItem('nav-sections-expanded', JSON.stringify(expandedSections));
    }, [expandedSections]);

    // Close mobile on route change
    useEffect(() => {
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    useEffect(() => {
        if (!isMobile) setIsMobileMenuOpen(false);
    }, [isMobile]);

    const toggleSection = useCallback((label: string) => {
        setExpandedSections((prev) => ({ ...prev, [label]: !prev[label] }));
    }, []);

    const closeMobileNav = () => {
        if (isMobile || isTablet) setIsMobileMenuOpen(false);
    };

    // Public routes (no sidebar)
    const publicPaths = [
        '/', '/tv', '/tv-mode', '/mobile', '/passport-scanner', '/hall-of-fame',
        '/live-map', '/battle', '/kiosk', '/kiosk-modern', '/kiosk-racing',
        '/login', '/leaderboard', '/remote', '/reservar', '/director-tv'
    ];
    const isPublicView = publicPaths.includes(location.pathname) ||
        location.pathname.startsWith('/tv/') ||
        location.pathname.startsWith('/telemetry/') ||
        location.pathname.startsWith('/p/');

    // Branding
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        retry: 1,
        initialData: [],
    });

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';

    const isAdminView = location.pathname.startsWith('/admin');
    const publicHeaders = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
    const pairedStationId = getPairedStationId();
    const canResolveStation = isAuthenticated || Boolean(PUBLIC_API_TOKEN);

    // Station lock check
    const { data: stationIds = [] } = useQuery<number[]>({
        queryKey: ['lock-check-station-ids'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/stations/`, { headers: publicHeaders });
                const rows = Array.isArray(res.data) ? res.data : [];
                return rows
                    .map((station: { id?: unknown; is_active?: boolean }) => {
                        const id = Number(station?.id);
                        const isActive = station?.is_active !== false;
                        return Number.isFinite(id) && id > 0 && isActive ? Math.floor(id) : null;
                    })
                    .filter((id: number | null): id is number => id !== null)
                    .sort((a, b) => a - b);
            } catch { return []; }
        },
        enabled: canResolveStation,
        retry: 1,
        staleTime: 60_000,
    });

    const stationId = (() => {
        if (pairedStationId && stationIds.includes(pairedStationId)) return pairedStationId;
        return stationIds[0] ?? null;
    })();

    const { data: lockStatus } = useQuery({
        queryKey: ['lock-check', stationId],
        queryFn: async () => {
            if (!stationId) return null;
            try {
                const res = await axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: publicHeaders });
                if (!isAdminView) {
                    if (res.data?.is_locked) {
                        if (location.pathname !== '/lock-screen') window.location.href = '/lock-screen';
                    } else {
                        if (location.pathname === '/lock-screen') window.location.href = '/kiosk';
                    }
                }
                return res.data;
            } catch { return null; }
        },
        refetchInterval: () => {
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
            return isAdminView ? 10000 : 4000;
        },
        refetchIntervalInBackground: false,
        enabled: canResolveStation && stationId !== null,
    });

    const hardwareWarning = lockStatus && (lockStatus.is_online === false || !lockStatus.wheel_connected || !lockStatus.pedals_connected);
    const collapsed = !isMobile && !isTablet && isDesktopCollapsed;

    // ========== PUBLIC VIEW ==========
    if (isPublicView) {
        return (
            <div className="public-shell flex h-screen bg-transparent text-[var(--text-primary)] overflow-hidden">
                <div className="flex-1 overflow-auto">{children}</div>
            </div>
        );
    }

    // ========== ADMIN VIEW ==========
    return (
        <div className="app-shell flex h-screen overflow-hidden">
            {/* Skip to content */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-[var(--accent-primary)] focus:text-[var(--text-primary)] focus:rounded-lg"
            >
                Saltar al contenido principal
            </a>

            {/* Mobile menu button */}
            {(isMobile || isTablet) && !isMobileMenuOpen && (
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="fixed top-3 left-3 z-40 h-11 w-11 rounded-xl bg-[var(--bg-card)] border border-[var(--border-default)] shadow-lg flex items-center justify-center text-[var(--text-primary)]"
                    aria-label="Abrir menú"
                >
                    <Menu size={20} />
                </button>
            )}

            {/* Overlay */}
            {(isMobile || isTablet) && isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
                    onClick={() => setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* ===== SIDEBAR ===== */}
            <div className={`${collapsed ? 'lg:w-[72px]' : 'lg:w-[260px]'} w-0 flex-shrink-0 transition-all duration-300`}>
                <div
                    className={`bg-[var(--bg-sidebar)] border-r border-[var(--border-default)] flex flex-col h-full transition-all duration-300 fixed inset-y-0 left-0 z-50 ${collapsed ? 'w-[72px]' : 'w-[260px]'} ${(isMobile || isTablet) ? (isMobileMenuOpen ? 'translate-x-0 w-72' : '-translate-x-full') : 'lg:relative lg:z-auto lg:translate-x-0'}`}
                    role="dialog"
                    aria-modal={(isMobile || isTablet) && isMobileMenuOpen ? 'true' : undefined}
                    aria-label="Navegación"
                >
                    {/* Desktop collapse toggle */}
                    <button
                        onClick={() => setIsDesktopCollapsed((prev) => !prev)}
                        className="hidden lg:flex absolute -right-3 top-7 bg-[var(--bg-card)] border border-[var(--border-default)] rounded-full p-1.5 shadow-md hover:scale-110 transition-all z-50 text-[var(--accent-primary)]"
                        aria-label={collapsed ? 'Expandir menú' : 'Contraer menú'}
                    >
                        {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                    </button>

                    {/* Mobile close */}
                    <button
                        onClick={() => setIsMobileMenuOpen(false)}
                        className="absolute right-3 top-3 lg:hidden h-10 w-10 rounded-lg bg-[var(--bg-badge)] text-[var(--text-primary)] flex items-center justify-center"
                        aria-label="Cerrar menú"
                    >
                        <X size={18} />
                    </button>

                    {/* Logo */}
                    <div className={`flex flex-col items-center py-5 px-4 border-b border-[var(--border-default)] ${collapsed ? 'px-2' : ''}`}>
                        <img
                            src={barLogo}
                            alt={barName}
                            className={`object-contain transition-all duration-300 ${collapsed ? 'h-8 w-8' : 'h-14 w-auto max-w-[160px] mb-1'}`}
                        />
                        {!collapsed && (
                            <span className="text-[10px] font-bold uppercase tracking-[0.25em] text-[var(--accent-primary)] mt-1 opacity-70">
                                {barName}
                            </span>
                        )}
                    </div>

                    {/* Search (non-collapsed only) */}
                    {!collapsed && (
                        <div className="px-4 py-3">
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)]" />
                                <input
                                    type="text"
                                    placeholder="Buscar..."
                                    className="w-full pl-9 pr-3 py-2 text-xs bg-[var(--bg-input)] border border-[var(--border-default)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:border-[var(--border-focus)] transition-colors"
                                />
                            </div>
                        </div>
                    )}

                    {/* Navigation */}
                    <nav
                        role="navigation"
                        aria-label="Navegación principal"
                        className="flex-1 px-3 overflow-y-auto scrollbar-thin py-2"
                    >
                        {NAV_SECTIONS.map((section) => (
                            <NavSectionComponent
                                key={section.label}
                                section={section}
                                collapsed={collapsed}
                                onNavigate={closeMobileNav}
                                isExpanded={expandedSections[section.label] ?? true}
                                onToggle={() => toggleSection(section.label)}
                                user={user}
                                isModuleEnabled={isModuleEnabled}
                            />
                        ))}
                    </nav>

                    {/* User / Footer */}
                    <div className="p-3 border-t border-[var(--border-default)]">
                        <div className={`flex items-center ${collapsed ? 'flex-col gap-2' : 'justify-between'}`}>
                            <div className={`flex items-center gap-2.5 ${collapsed ? 'flex-col' : ''}`}>
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold text-[var(--text-primary)] text-xs shadow-md flex-shrink-0">
                                    {(user?.role || 'A').charAt(0).toUpperCase()}
                                </div>
                                {!collapsed && (
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-[var(--text-primary)] truncate">
                                            {user?.role === 'admin' ? 'Administrador' : 'Operador'}
                                        </p>
                                        <p className="text-[10px] text-[var(--accent-success)] flex items-center gap-1">
                                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                                            Conectado
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className={`flex items-center gap-1.5 ${collapsed ? 'flex-col' : ''}`}>
                                <ThemeToggle collapsed={collapsed} />
                                {isAuthenticated && (
                                    <button
                                        onClick={() => {
                                            logout();
                                            window.location.href = '/login';
                                        }}
                                        className="p-2 rounded-lg bg-[var(--bg-badge)] hover:bg-[var(--accent-danger-muted)] border border-[var(--border-default)] hover:border-red-500/30 transition-all duration-200 text-[var(--text-tertiary)] hover:text-red-500"
                                        aria-label="Cerrar sesión"
                                        title="Cerrar sesión"
                                    >
                                        <LogOut size={collapsed ? 14 : 16} />
                                    </button>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {/* ===== MAIN CONTENT ===== */}
            <main
                id="main-content"
                className={`flex-1 overflow-auto ${(isMobile || isTablet) ? 'pt-14' : ''}`}
                role="main"
                aria-label="Contenido principal"
            >
                {/* Hardware Warning */}
                {hardwareWarning && (
                    <div className="mx-4 lg:mx-6 mt-4 mb-2 bg-[var(--accent-danger-muted)] border border-red-500/30 rounded-xl p-3.5 text-red-500 font-semibold text-sm flex items-center gap-3" role="alert">
                        <AlertTriangle size={18} aria-hidden="true" />
                        <span>
                            {!lockStatus?.is_online && 'Agente desconectado. '}
                            {lockStatus?.is_online && (!lockStatus?.wheel_connected || !lockStatus?.pedals_connected) && 'Hardware no detectado: '}
                            {lockStatus?.is_online && !lockStatus?.wheel_connected && 'volante '}
                            {lockStatus?.is_online && !lockStatus?.pedals_connected && 'pedales'}
                        </span>
                    </div>
                )}
                <AppUpdateBanner />
                <Breadcrumbs />
                {children}
            </main>
        </div>
    );
}
