import React, { useState } from 'react';
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
    Gamepad2
} from 'lucide-react';
import { useTheme } from '../contexts/useTheme';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';


// NavItem Component
const NavItem = ({ to, icon: Icon, children, collapsed }: { to: string, icon: React.ComponentType<{ size?: number }>, children: React.ReactNode, collapsed?: boolean }) => {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            className={`flex items-center ${collapsed ? 'justify-center' : 'gap-3'} px-4 py-3 rounded-xl transition-all duration-200 group ${isActive
                ? 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25'
                : 'text-gray-400 hover:bg-white/5 hover:text-white'
                }`}
            title={collapsed ? children as string : ''}
        >
            <span className={`flex-shrink-0 ${isActive ? 'drop-shadow-lg' : 'group-hover:scale-110 transition-transform'}`}>
                <Icon size={20} />
            </span>
            <span className={`font-medium transition-all ${collapsed ? 'hidden w-0 opacity-0' : 'block opacity-100'}`}>{children}</span>
            {isActive && !collapsed && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-white animate-pulse" />}
        </Link>
    );
};

// Theme Toggle Component
const ThemeToggle = ({ collapsed }: { collapsed: boolean }) => {
    const { theme, toggleTheme } = useTheme();

    return (
        <button
            onClick={toggleTheme}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 transition-all hover:scale-105"
            title={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
        >
            {theme === 'dark' ? (
                <Sun size={collapsed ? 16 : 18} className="text-yellow-400 drop-shadow-[0_0_8px_rgba(250,204,21,0.5)]" />
            ) : (
                <Moon size={collapsed ? 16 : 18} className="text-blue-400 drop-shadow-[0_0_8px_rgba(96,165,250,0.5)]" />
            )}
        </button>
    );
};

// Main Layout Component
export default function Layout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const location = useLocation();

    // Determine if we should show the full layout or just the content (e.g. for TV/Mobile/Public views)
    const publicPaths = ['/', '/tv', '/tv-mode', '/mobile', '/passport-scanner', '/hall-of-fame', '/live-map', '/battle', '/kiosk', '/login', '/leaderboard', '/remote', '/reservar'];
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

    // --- LOCK CHECK LOGIC ---
    // Poll hardware stats for station 1 (default) or detect station ID from URL/Storage
    // In a real multi-station deployment, the frontend knows its "Station ID" via config.
    // For now, we assume stationId = 1 or use local storage logic similar to KioskMode.
    const [stationId, setStationId] = useState<number>(() => {
        const stored = localStorage.getItem('kiosk_station_id');
        return stored ? parseInt(stored) : 1;
    });

    useQuery({
        queryKey: ['lock-check', stationId],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/hardware/status/${stationId}`);
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
                return res.data;
            } catch { return null; }
        },
        refetchInterval: 2000, // Poll every 2s
        enabled: !location.pathname.includes('/admin') // Admin panel should not be locked ideally, or maybe it should? Let's exclude admin for safety.
    });


    if (isPublicView) {
        return (
            <div className="flex h-screen bg-transparent text-white overflow-hidden">
                <div className="flex-1 overflow-auto">
                    {children}
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-screen text-gray-100 overflow-hidden">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} glass-sidebar text-white flex flex-col transition-all duration-300 relative`}>
                {/* Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute -right-3 top-7 bg-gradient-to-r from-blue-600 to-indigo-600 rounded-full p-1.5 shadow-lg shadow-blue-500/30 z-50 hover:scale-110 transition-all border border-white/20"
                >
                    {isSidebarOpen ? <ChevronLeft size={14} className="text-white" /> : <ChevronRight size={14} className="text-white" />}
                </button>

                {/* Logo Section */}
                <div className="p-6 flex flex-col items-center overflow-hidden">
                    <img
                        src={barLogo}
                        alt="VRacing Bar"
                        className={`h-20 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)] mb-2 transition-all duration-300 ${isSidebarOpen ? 'opacity-100 scale-100' : 'opacity-0 scale-50 h-0 my-0'}`}
                    />
                    <h2 className={`text-xs font-black uppercase tracking-[0.3em] text-blue-500 opacity-80 whitespace-nowrap transition-all duration-300 ${!isSidebarOpen && 'hidden'}`}>
                        {barName}
                    </h2>
                    {!isSidebarOpen && <img src={barLogo} className="h-10 w-10 object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.5)]" />}
                </div>

                {/* Navigation */}
                <nav className="flex-1 px-4 space-y-1 overflow-y-auto scrollbar-thin scrollbar-thumb-gray-800">
                    {/* GESTIÓN */}
                    <div className={`text-[10px] text-gray-500 font-bold uppercase mt-4 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
                        Gestión
                    </div>
                    <NavItem to="/admin" icon={LayoutDashboard} collapsed={!isSidebarOpen}>Panel Control</NavItem>
                    <NavItem to="/drivers" icon={Users} collapsed={!isSidebarOpen}>Pilotos</NavItem>
                    <NavItem to="/events" icon={Calendar} collapsed={!isSidebarOpen}>Torneos</NavItem>
                    <NavItem to="/championships" icon={Trophy} collapsed={!isSidebarOpen}>Campeonatos</NavItem>
                    <NavItem to="/history" icon={HistoryIcon} collapsed={!isSidebarOpen}>Historial</NavItem>
                    <NavItem to="/bookings" icon={CalendarCheck} collapsed={!isSidebarOpen}>Reservas</NavItem>
                    <NavItem to="/analytics" icon={LayoutDashboard} collapsed={!isSidebarOpen}>Ingresos</NavItem>
                    <NavItem to="/admin/scenarios" icon={Gamepad2} collapsed={!isSidebarOpen}>Sesiones Kiosk</NavItem>
                    <NavItem to="/mods" icon={Library} collapsed={!isSidebarOpen}>Librería</NavItem>

                    {/* CONFIGURACIÓN */}
                    <div className={`text-[10px] text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
                        Sistema
                    </div>
                    <NavItem to="/settings" icon={Settings} collapsed={!isSidebarOpen}>Configuración</NavItem>
                    <NavItem to="/settings?tab=game" icon={Gamepad2} collapsed={!isSidebarOpen}>Editor AC</NavItem>
                    <NavItem to="/profiles" icon={Users} collapsed={!isSidebarOpen}>Perfiles</NavItem>

                    {/* VISTA PÚBLICA */}
                    <div className={`text-[10px] text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
                        Sala & TV
                    </div>
                    <NavItem to="/remote" icon={MonitorPlay} collapsed={!isSidebarOpen}>Mando TV</NavItem>
                    <NavItem to="/leaderboard" icon={List} collapsed={!isSidebarOpen}>Clasificación</NavItem>
                    <NavItem to="/hall-of-fame" icon={Crown} collapsed={!isSidebarOpen}>Salón Fama</NavItem>
                    <NavItem to="/kiosk" icon={MonitorPlay} collapsed={!isSidebarOpen}>Menú Pantallas</NavItem>
                </nav>

                {/* User Profile / Status */}
                <div className="p-4 border-t border-white/5 bg-black/20">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center font-bold flex-shrink-0 shadow-lg shadow-blue-500/30 text-sm">A</div>
                            <div className={`transition-all overflow-hidden ${!isSidebarOpen ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                                <p className="text-sm font-semibold whitespace-nowrap">Operador</p>
                                <p className="text-xs text-emerald-400 flex items-center gap-1.5">
                                    <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse shadow-lg shadow-emerald-500/50"></span>
                                    Conectado
                                </p>
                            </div>
                        </div>
                        <ThemeToggle collapsed={!isSidebarOpen} />
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto relative">
                <div className="min-h-full">
                    {children}
                </div>
            </div>
        </div>
    );
}
