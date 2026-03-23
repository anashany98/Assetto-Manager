import React, { useEffect, useState } from 'react';
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
    X
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


// NavItem Component
const NavItem = ({
    to,
    icon: Icon,
    children,
    collapsed,
    onNavigate
}: {
    to: string,
    icon: React.ComponentType<{ size?: number }>,
    children: React.ReactNode,
    collapsed?: boolean,
    onNavigate?: () => void
}) => {
    const location = useLocation();
    const { user } = useAuth();
    const { isModuleEnabled } = useLicense();
    const isActive = location.pathname === to;
    const itemId = `nav-item-${to.replace(/\//g, '-')}`;

    // Permission/Module Check
    // Keys should match BOTH backend user permissions AND license modules.
    // We select the longest matching prefix so "/" does not shadow everything.
    const ROUTE_PERMISSION_MAP: Record<string, string> = {
        // Management
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

        // System
        '/settings?tab=game': 'editor',
        '/settings': 'settings',
        '/profiles': 'profiles',
        '/users': 'users',

        // Public / TV
        '/remote': 'tv_remote',
        '/tv/spectator': 'tv_spectator',
        '/leaderboard': 'leaderboard',
        '/hall-of-fame': 'hall_of_fame',
        '/kiosk': 'kiosk',

        // Fallback
        '/': 'dashboard',
    };

    const requiredPerm = (() => {
        let bestPerm: string | undefined;
        let bestLen = -1;
        for (const [prefix, perm] of Object.entries(ROUTE_PERMISSION_MAP)) {
            if (to.startsWith(prefix) && prefix.length > bestLen) {
                bestPerm = perm;
                bestLen = prefix.length;
            }
        }
        return bestPerm;
    })();

    // User Permission Check
    const hasUserPerm = !requiredPerm ||
        user?.role === 'admin' ||
        (user?.permissions && user.permissions.includes(requiredPerm));

    // License Check
    const hasLicense = !requiredPerm || isModuleEnabled(requiredPerm);

    if (!hasUserPerm || !hasLicense) return null;

    return (
        <Link
            to={to}
            onClick={onNavigate}
            role="menuitem"
            id={itemId}
            aria-current={isActive ? 'page' : undefined}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all duration-200 group focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 ${isActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-slate-600 hover:bg-slate-100 hover:text-blue-600 dark:text-gray-400 dark:hover:bg-white/5 dark:hover:text-white'
                }`}
            title={collapsed ? children as string : ''}
        >
            <span className={`flex-shrink-0 ${isActive ? 'drop-shadow-lg' : 'group-hover:scale-110 transition-transform'}`}>
                <Icon size={20} />
            </span>
            <span className={`font-medium transition-all ${collapsed ? 'hidden w-0 opacity-0' : 'block opacity-100'}`}>{children}</span>
            {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" aria-hidden="true" />}
        </Link>
    );
};

// Theme Toggle Component
const ThemeToggle = ({ collapsed }: { collapsed: boolean }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-white/5 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 transition-all hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
            {theme === 'dark' ? (
                <Sun size={collapsed ? 16 : 18} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" aria-hidden="true" />
            ) : (
                <Moon size={collapsed ? 16 : 18} className="text-blue-600 dark:text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" aria-hidden="true" />
            )}
        </button>
    );
};

// Main Layout Component
export default function Layout({ children }: { children: React.ReactNode }) {
    const [isMobile, setIsMobile] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth < 1024;
    });
    const [isTablet, setIsTablet] = useState(() => {
        if (typeof window === 'undefined') return false;
        return window.innerWidth >= 768 && window.innerWidth < 1024;
    });
    const [isDesktopCollapsed, setIsDesktopCollapsed] = useState(() => {
        if (typeof window === 'undefined') return false;
        const saved = localStorage.getItem('sidebar-collapsed');
        return saved === 'true';
    });
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
    const location = useLocation();
    const { isAuthenticated } = useAuth();

    useEffect(() => {
        const onResize = () => {
            const width = window.innerWidth;
            setIsMobile(width < 768);
            setIsTablet(width >= 768 && width < 1024);
        };

        onResize();
        window.addEventListener('resize', onResize);
        return () => window.removeEventListener('resize', onResize);
    }, []);

    // Persist sidebar collapsed state
    useEffect(() => {
        localStorage.setItem('sidebar-collapsed', String(isDesktopCollapsed));
    }, [isDesktopCollapsed]);

    useEffect(() => {
        if (!isMobile) {
            setIsMobileMenuOpen(false);
        }
    }, [isMobile]);

    useEffect(() => {
        // Solo cerrar cuando cambia la ruta
        setIsMobileMenuOpen(false);
    }, [location.pathname]);

    // Determine if we should show the full layout or just the content (e.g. for TV/Mobile/Public views)
    const publicPaths = [
        '/',
        '/tv',
        '/tv-mode',
        '/mobile',
        '/passport-scanner',
        '/hall-of-fame',
        '/live-map',
        '/battle',
        '/kiosk',
        '/kiosk-modern',
        '/kiosk-racing',
        '/login',
        '/leaderboard',
        '/remote',
        '/reservar'
    ];
    const isPublicView = publicPaths.includes(location.pathname) ||
        location.pathname.startsWith('/tv/') ||
        location.pathname.startsWith('/telemetry/') ||
        location.pathname.startsWith('/p/');

    // Branding Query
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        retry: 1,
        initialData: []
    });

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barLogo = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png';
    const barName = safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_name')?.value || 'VRacing Bar';

    const isAdminView = location.pathname.startsWith('/admin');
    const publicHeaders = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
    const pairedStationId = getPairedStationId();
    const canResolveStation = isAuthenticated || Boolean(PUBLIC_API_TOKEN);

    // Resolve a safe station id to avoid repetitive 404 polling on fresh installs.
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
            } catch {
                return [];
            }
        },
        enabled: canResolveStation,
        retry: 1,
        staleTime: 60_000,
    });

    const stationId = (() => {
        if (pairedStationId && stationIds.includes(pairedStationId)) {
            return pairedStationId;
        }
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
                        if (location.pathname !== '/lock-screen') {
                            window.location.href = '/lock-screen';
                        }
                    } else {
                        // If unlocked and currently on lock screen, go back to home/kiosk
                        if (location.pathname === '/lock-screen') {
                            window.location.href = '/kiosk'; // Default to kiosk after unlock
                        }
                    }
                }
                return res.data;
            } catch { return null; }
        },
        refetchInterval: () => {
            // Reduce polling load and pause while tab/window is not visible.
            if (typeof document !== 'undefined' && document.visibilityState !== 'visible') return false;
            return isAdminView ? 10000 : 4000;
        },
        refetchIntervalInBackground: false,
        enabled: canResolveStation && stationId !== null,
    });

    const hardwareWarning = lockStatus && (lockStatus.is_online === false || !lockStatus.wheel_connected || !lockStatus.pedals_connected);
    const collapsed = !isMobile && !isTablet && isDesktopCollapsed;
    const closeMobileNav = () => {
        if (isMobile || isTablet) setIsMobileMenuOpen(false);
    };


    if (isPublicView) {
        return (
            <div className="public-shell flex h-screen bg-transparent text-white overflow-hidden">
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div className="app-shell flex h-screen text-slate-900 dark:text-gray-100 overflow-hidden bg-slate-50 dark:bg-slate-900">
            {/* Skip to main content link for accessibility */}
            <a
                href="#main-content"
                className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-blue-600 focus:text-white focus:rounded-lg focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
            >
                Saltar al contenido principal
            </a>
            {(isMobile || isTablet) && !isMobileMenuOpen && (
                <button
                    onClick={() => setIsMobileMenuOpen(true)}
                    className="fixed top-3 left-3 z-40 h-11 w-11 rounded-xl bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 shadow-lg flex items-center justify-center text-slate-700 dark:text-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Abrir menú de navegación"
                >
                    <Menu size={20} />
                </button>
            )}

            {(isMobile || isTablet) && isMobileMenuOpen && (
                <div
                    className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]"
                    onClick={() => setIsMobileMenuOpen(false)}
                    onKeyDown={(e) => e.key === 'Escape' && setIsMobileMenuOpen(false)}
                    aria-hidden="true"
                />
            )}

            {/* Sidebar */}
            <div className={`${collapsed ? 'lg:w-20' : 'lg:w-64'} w-0 flex-shrink-0`}>
                <div
                    className={`bg-white dark:bg-gray-900 border-r border-gray-200 dark:border-gray-800 text-slate-900 dark:text-white flex flex-col transition-all duration-300 relative fixed inset-y-0 left-0 z-50 w-72 transform ${(isMobile || isTablet) ? (isMobileMenuOpen ? 'translate-x-0' : '-translate-x-full') : 'lg:relative lg:z-auto lg:w-full lg:translate-x-0'}`}
                    role="dialog"
                    aria-modal={(isMobile || isTablet) && isMobileMenuOpen ? 'true' : undefined}
                    aria-label="Menú de navegación"
                >
                {/* Desktop Toggle */}
                <button
                    onClick={() => setIsDesktopCollapsed((prev) => !prev)}
                    className="hidden lg:flex absolute -right-3 top-7 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full p-1.5 shadow-md hover:scale-110 transition-all z-50 text-blue-600 dark:text-gray-400"
                    aria-label={collapsed ? 'Expandir menu lateral' : 'Contraer menu lateral'}
                >
                    {collapsed ? <ChevronRight size={14} /> : <ChevronLeft size={14} />}
                </button>

                {/* Mobile Close */}
                <button
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="absolute right-3 top-3 lg:hidden h-11 w-11 rounded-lg bg-slate-100 dark:bg-white/10 text-slate-700 dark:text-gray-200 flex items-center justify-center focus:outline-none focus:ring-2 focus:ring-blue-500"
                    aria-label="Cerrar menú"
                >
                    <X size={20} />
                </button>

                {/* Logo Section */}
                <div className="p-6 flex flex-col items-center overflow-hidden border-b border-gray-100 dark:border-gray-800/50">
                    <img
                        src={barLogo}
                        alt="VRacing Bar"
                        className={`h-20 w-auto object-contain mb-2 transition-all duration-300 ${collapsed ? 'opacity-0 scale-50 h-0 my-0' : 'opacity-100 scale-100'}`}
                    />
                    <h2 className={`text-xs font-black uppercase tracking-[0.3em] text-blue-600 dark:text-blue-500 opacity-80 whitespace-nowrap transition-all duration-300 ${collapsed ? 'hidden' : ''}`}>
                        {barName}
                    </h2>
                    {collapsed && <img src={barLogo} alt="VRacing Bar" className="h-10 w-10 object-contain" />}
                </div>

                {/* Navigation */}
                <nav role="navigation" aria-label="Navegación principal" className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-800 py-4">
                    <div className={`text-[10px] text-gray-500 dark:text-gray-500 font-bold uppercase mt-4 mb-2 px-2 tracking-wider ${collapsed ? 'hidden' : ''}`}>
                        Gestion
                    </div>
                    <NavItem to="/admin" icon={LayoutDashboard} collapsed={collapsed} onNavigate={closeMobileNav}>Panel Control</NavItem>

                    {FEATURES.drivers && <NavItem to="/drivers" icon={Users} collapsed={collapsed} onNavigate={closeMobileNav}>Pilotos</NavItem>}
                    {FEATURES.tournaments && <NavItem to="/events" icon={Calendar} collapsed={collapsed} onNavigate={closeMobileNav}>Torneos</NavItem>}
                    {FEATURES.championships && <NavItem to="/championships" icon={Trophy} collapsed={collapsed} onNavigate={closeMobileNav}>Campeonatos</NavItem>}
                    {FEATURES.history && <NavItem to="/history" icon={HistoryIcon} collapsed={collapsed} onNavigate={closeMobileNav}>Historial</NavItem>}
                    {FEATURES.bookings && <NavItem to="/bookings" icon={CalendarCheck} collapsed={collapsed} onNavigate={closeMobileNav}>Reservas</NavItem>}
                    {FEATURES.tables && <NavItem to="/reservations" icon={LayoutGrid} collapsed={collapsed} onNavigate={closeMobileNav}>Mesas</NavItem>}
                    {FEATURES.analytics && <NavItem to="/analytics" icon={LayoutDashboard} collapsed={collapsed} onNavigate={closeMobileNav}>Ingresos</NavItem>}
                    {FEATURES.kiosk && <NavItem to="/admin/scenarios" icon={Gamepad2} collapsed={collapsed} onNavigate={closeMobileNav}>Sesiones Kiosk</NavItem>}
                    {FEATURES.mods && <NavItem to="/mods" icon={Library} collapsed={collapsed} onNavigate={closeMobileNav}>Libreria</NavItem>}
                    {FEATURES.online_reservations && <NavItem to="/online-reservations" icon={CalendarPlus} collapsed={collapsed} onNavigate={closeMobileNav}>Reservas Online</NavItem>}
                    {FEATURES.lap_comparison && <NavItem to="/compare" icon={BarChart3} collapsed={collapsed} onNavigate={closeMobileNav}>Comparar Vueltas</NavItem>}

                    <div className={`text-[10px] text-gray-500 dark:text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${collapsed ? 'hidden' : ''}`}>
                        Sistema
                    </div>
                    {FEATURES.settings && <NavItem to="/settings" icon={Settings} collapsed={collapsed} onNavigate={closeMobileNav}>Configuracion</NavItem>}
                    {FEATURES.editor && <NavItem to="/settings?tab=game" icon={Gamepad2} collapsed={collapsed} onNavigate={closeMobileNav}>Editor AC</NavItem>}
                    {FEATURES.profiles && <NavItem to="/profiles" icon={Users} collapsed={collapsed} onNavigate={closeMobileNav}>Perfiles</NavItem>}

                    <div className={`text-[10px] text-gray-500 dark:text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${collapsed ? 'hidden' : ''}`}>
                        Sala & TV
                    </div>
                    {FEATURES.tv_remote && <NavItem to="/remote" icon={MonitorPlay} collapsed={collapsed} onNavigate={closeMobileNav}>Mando TV</NavItem>}
                    {FEATURES.tv_spectator && <NavItem to="/tv/spectator" icon={Eye} collapsed={collapsed} onNavigate={closeMobileNav}>Espectador TV</NavItem>}
                    {FEATURES.leaderboard && <NavItem to="/leaderboard" icon={List} collapsed={collapsed} onNavigate={closeMobileNav}>Clasificacion</NavItem>}
                    {FEATURES.hall_of_fame && <NavItem to="/hall-of-fame" icon={Crown} collapsed={collapsed} onNavigate={closeMobileNav}>Salon Fama</NavItem>}
                    {FEATURES.kiosk_menu && <NavItem to="/kiosk" icon={MonitorPlay} collapsed={collapsed} onNavigate={closeMobileNav}>Menu Pantallas</NavItem>}
                </nav>

                {/* User Profile / Status */}
                <div className="p-4 border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-black/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold flex-shrink-0 shadow-lg shadow-blue-500/30 text-white text-sm" aria-hidden="true">A</div>
                            <div className={`transition-all overflow-hidden ${collapsed ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                                <p className="text-sm font-semibold whitespace-nowrap text-gray-900 dark:text-gray-200">Operador</p>
                                <p className="text-xs text-emerald-700 dark:text-emerald-300 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" aria-hidden="true"></span>
                                    Conectado
                                </p>
                            </div>
                        </div>
                        <ThemeToggle collapsed={collapsed} />
                    </div>
                </div>
                </div>
            </div>

            {/* Main Content Area */}
            <main id="main-content" className={`flex-1 overflow-auto relative ${(isMobile || isTablet) ? 'pt-14' : ''}`} role="main" aria-label="Contenido principal">
                {hardwareWarning && (
                    <div className="mx-4 lg:mx-6 mt-4 mb-2 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-600 dark:text-red-200 font-bold text-sm flex items-center gap-3" role="alert">
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
