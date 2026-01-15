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
    CalendarCheck
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

// NavItem Component
const NavItem = ({ to, icon: Icon, children, collapsed }: { to: string, icon: any, children: React.ReactNode, collapsed?: boolean }) => {
    const location = useLocation();
    const isActive = location.pathname === to;

    return (
        <Link
            to={to}
            className={`flex items-center ${collapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-lg transition-colors ${isActive
                ? 'bg-blue-600 text-white shadow-lg'
                : 'text-gray-400 hover:bg-gray-800 hover:text-white'
                }`}
            title={collapsed ? children as string : ''}
        >
            <Icon size={20} />
            <span className={`font-medium transition-all ${collapsed ? 'hidden w-0' : 'block'}`}>{children}</span>
        </Link>
    );
};

// Main Layout Component
export default function Layout({ children }: { children: React.ReactNode }) {
    const [isSidebarOpen, setIsSidebarOpen] = useState(true);
    const location = useLocation();

    // Determine if we should show the full layout or just the content (e.g. for TV/Mobile/Public views)
    const publicPaths = ['/', '/tv', '/tv-mode', '/mobile', '/passport-scanner', '/hall-of-fame', '/live-map', '/battle', '/kiosk', '/login', '/leaderboard', '/remote', '/reservar'];
    const isPublicView = publicPaths.includes(location.pathname) || location.pathname.startsWith('/tv/') || location.pathname.startsWith('/telemetry/');

    // Branding Query
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings`);
                return Array.isArray(res.data) ? res.data : [];
            } catch (e) { return []; }
        },
        retry: 1,
        initialData: []
    });

    const safeBranding = Array.isArray(branding) ? branding : [];
    const barLogo = safeBranding.find((s: any) => s.key === 'bar_logo')?.value || '/logo.png';
    const barName = safeBranding.find((s: any) => s.key === 'bar_name')?.value || 'VRacing Bar';

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
        <div className="flex h-screen bg-gray-950 text-gray-100">
            {/* Sidebar */}
            <div className={`${isSidebarOpen ? 'w-64' : 'w-20'} bg-gray-900 text-white flex flex-col transition-all duration-300 relative border-r border-gray-800`}>
                {/* Toggle Button */}
                <button
                    onClick={() => setIsSidebarOpen(!isSidebarOpen)}
                    className="absolute -right-3 top-6 bg-blue-600 rounded-full p-1 shadow-lg border border-gray-800 z-50 hover:bg-blue-700 transition-transform hover:scale-110"
                >
                    {isSidebarOpen ? <ChevronLeft size={16} /> : <ChevronRight size={16} />}
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
                    <NavItem to="/mods" icon={Library} collapsed={!isSidebarOpen}>Librería</NavItem>

                    {/* CONFIGURACIÓN */}
                    <div className={`text-[10px] text-gray-500 font-bold uppercase mt-6 mb-2 px-2 tracking-wider ${!isSidebarOpen && 'hidden'}`}>
                        Sistema
                    </div>
                    <NavItem to="/settings" icon={Settings} collapsed={!isSidebarOpen}>Configuración</NavItem>
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
                <div className="p-4 border-t border-gray-800 bg-gray-900/50">
                    <div className="flex items-center space-x-3 justify-center">
                        <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center font-bold flex-shrink-0 shadow-lg shadow-blue-900/50">A</div>
                        <div className={`transition-all overflow-hidden ${!isSidebarOpen ? 'w-0 opacity-0' : 'w-auto opacity-100'}`}>
                            <p className="text-sm font-medium whitespace-nowrap">Operador</p>
                            <p className="text-xs text-green-400 flex items-center gap-1">
                                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></span>
                                Conectado
                            </p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Main Content Area */}
            <div className="flex-1 overflow-auto bg-gray-950 relative">
                {children}
            </div>
        </div>
    );
}
