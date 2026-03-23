import { useState, useEffect, createContext, type ReactNode } from 'react';
import { Link, useLocation, Outlet } from 'react-router-dom';
import {
    Monitor,
    HardDrive,
    Calendar,
    Users,
    Trophy,
    BarChart3,
    Settings,
    Menu,
    X,
    ChevronLeft,
    ChevronRight,
    Bell,
    Search,
    Moon,
    Sun,
    Car,
    Clock,
    Wifi,
    Home,
    Gamepad2
} from 'lucide-react';

// Context for sidebar state
interface LayoutContextType {
    sidebarCollapsed: boolean;
    setSidebarCollapsed: (collapsed: boolean) => void;
    isMobile: boolean;
}

const LayoutContext = createContext<LayoutContextType>({
    sidebarCollapsed: false,
    setSidebarCollapsed: () => {},
    isMobile: false
});

// Navigation items
const NAV_ITEMS = [
    { path: '/admin', label: 'Panel de Control', icon: Home, section: 'main' },
    { path: '/stations', label: 'Simuladores', icon: Monitor, section: 'main' },
    { path: '/bookings', label: 'Reservas', icon: Calendar, section: 'main' },
    { path: '/drivers', label: 'Pilotos', icon: Users, section: 'main' },
    { path: '/history', label: 'Historial', icon: Clock, section: 'main' },
    { path: '/mods', label: 'Librería', icon: HardDrive, section: 'content' },
    { path: '/events', label: 'Torneos', icon: Trophy, section: 'content' },
    { path: '/championships', label: 'Campeonatos', icon: Gamepad2, section: 'content' },
    { path: '/leaderboard', label: 'Clasificación', icon: BarChart3, section: 'content' },
    { path: '/analytics', label: 'Ingresos', icon: BarChart3, section: 'reports' },
    { path: '/settings', label: 'Configuración', icon: Settings, section: 'system' },
];

const SECTION_LABELS: Record<string, string> = {
    main: 'Principal',
    content: 'Contenido',
    reports: 'Informes',
    system: 'Sistema'
};

interface LayoutV2Props {
    children?: ReactNode;
}

export default function LayoutV2({ children }: LayoutV2Props) {
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [isMobile, setIsMobile] = useState(false);
    const [isDark, setIsDark] = useState(false);
    const location = useLocation();

    // Detect mobile
    useEffect(() => {
        const checkMobile = () => {
            setIsMobile(window.innerWidth < 1024);
            if (window.innerWidth < 1024) {
                setSidebarCollapsed(true);
            }
        };
        checkMobile();
        window.addEventListener('resize', checkMobile);
        return () => window.removeEventListener('resize', checkMobile);
    }, []);

    // Dark mode detection
    useEffect(() => {
        const isDarkMode = document.documentElement.classList.contains('dark');
        setIsDark(isDarkMode);
    }, []);

    // Close mobile menu on route change
    useEffect(() => {
        setMobileMenuOpen(false);
    }, [location.pathname]);

    const toggleDark = () => {
        document.documentElement.classList.toggle('dark');
        setIsDark(!isDark);
    };

    const groupedNav = NAV_ITEMS.reduce((acc, item) => {
        if (!acc[item.section]) acc[item.section] = [];
        acc[item.section].push(item);
        return acc;
    }, {} as Record<string, typeof NAV_ITEMS>);

    return (
        <LayoutContext.Provider value={{ sidebarCollapsed, setSidebarCollapsed, isMobile }}>
            <div className="v2-app min-h-screen bg-gray-50 dark:bg-gray-950">
                {/* Mobile Menu Overlay */}
                {mobileMenuOpen && (
                    <div
                        className="fixed inset-0 bg-black/20 backdrop-blur-sm z-40 lg:hidden"
                        onClick={() => setMobileMenuOpen(false)}
                    />
                )}

                {/* Sidebar */}
                <aside
                    className={`fixed top-0 left-0 h-full z-50 transition-all duration-300 ease-in-out
                        ${sidebarCollapsed ? 'w-[72px]' : 'w-[260px]'}
                        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
                        bg-white dark:bg-gray-900 border-r border-gray-100 dark:border-gray-800
                        flex flex-col`}
                >
                    {/* Logo */}
                    <div className="h-16 flex items-center justify-between px-4 border-b border-gray-100 dark:border-gray-800">
                        {(!sidebarCollapsed || mobileMenuOpen) && (
                            <Link to="/" className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                                    <Car size={18} className="text-white" />
                                </div>
                                <span className="font-semibold text-gray-900 dark:text-white">
                                    AC Manager
                                </span>
                            </Link>
                        )}
                        {sidebarCollapsed && !mobileMenuOpen && (
                            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center mx-auto">
                                <Car size={18} className="text-white" />
                            </div>
                        )}
                        <button
                            onClick={() => setMobileMenuOpen(false)}
                            className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                        >
                            <X size={20} />
                        </button>
                    </div>

                    {/* Navigation */}
                    <nav className="flex-1 overflow-y-auto py-4 px-3 v2-scrollbar">
                        {Object.entries(groupedNav).map(([section, items]) => (
                            <div key={section} className="mb-6">
                                {(!sidebarCollapsed || mobileMenuOpen) && (
                                    <p className="px-3 mb-2 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                                        {SECTION_LABELS[section]}
                                    </p>
                                )}
                                <ul className="space-y-1">
                                    {items.map((item) => {
                                        const isActive = location.pathname === item.path;
                                        return (
                                            <li key={item.path}>
                                                <Link
                                                    to={item.path}
                                                    className={`flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200
                                                        ${isActive
                                                            ? 'bg-blue-50 dark:bg-blue-500/10 text-blue-600 dark:text-blue-400'
                                                            : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-800 hover:text-gray-900 dark:hover:text-gray-200'
                                                        }
                                                        ${sidebarCollapsed && !mobileMenuOpen ? 'justify-center' : ''}
                                                    `}
                                                    title={sidebarCollapsed ? item.label : undefined}
                                                >
                                                    <item.icon size={20} className="flex-shrink-0" />
                                                    {(!sidebarCollapsed || mobileMenuOpen) && (
                                                        <span className="font-medium text-sm">{item.label}</span>
                                                    )}
                                                </Link>
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        ))}
                    </nav>

                    {/* Collapse Toggle - Desktop Only */}
                    <div className="hidden lg:block border-t border-gray-100 dark:border-gray-800 p-3">
                        <button
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                        >
                            {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
                            {!sidebarCollapsed && <span className="text-sm">Colapsar</span>}
                        </button>
                    </div>
                </aside>

                {/* Main Content */}
                <div
                    className={`transition-all duration-300 ease-in-out
                        ${sidebarCollapsed ? 'lg:pl-[72px]' : 'lg:pl-[260px]'}
                        ${mobileMenuOpen ? 'pl-0' : ''}
                    `}
                >
                    {/* Header */}
                    <header className="sticky top-0 z-30 h-16 bg-white/80 dark:bg-gray-900/80 backdrop-blur-xl border-b border-gray-100 dark:border-gray-800">
                        <div className="h-full px-4 lg:px-6 flex items-center justify-between">
                            {/* Left: Mobile Menu + Search */}
                            <div className="flex items-center gap-3">
                                <button
                                    onClick={() => setMobileMenuOpen(true)}
                                    className="lg:hidden p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
                                >
                                    <Menu size={20} />
                                </button>
                                <div className="hidden sm:flex items-center gap-2 px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-lg w-64">
                                    <Search size={16} className="text-gray-400" />
                                    <input
                                        type="text"
                                        placeholder="Buscar..."
                                        className="bg-transparent border-none outline-none text-sm text-gray-600 dark:text-gray-300 placeholder-gray-400 w-full"
                                    />
                                </div>
                            </div>

                            {/* Right: Actions */}
                            <div className="flex items-center gap-2">
                                {/* Status Indicator */}
                                <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-full bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                                    <Wifi size={14} />
                                    <span className="text-xs font-medium">Sistema Online</span>
                                </div>

                                {/* Notifications */}
                                <button className="relative p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors">
                                    <Bell size={20} />
                                    <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
                                </button>

                                {/* Theme Toggle */}
                                <button
                                    onClick={toggleDark}
                                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
                                >
                                    {isDark ? <Sun size={20} /> : <Moon size={20} />}
                                </button>

                                {/* User Menu */}
                                <button className="flex items-center gap-2 p-1.5 pr-3 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors">
                                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center">
                                        <span className="text-white text-sm font-medium">A</span>
                                    </div>
                                    <span className="hidden sm:block text-sm font-medium text-gray-700 dark:text-gray-200">Admin</span>
                                </button>
                            </div>
                        </div>
                    </header>

                    {/* Page Content */}
                    <main className="min-h-[calc(100vh-4rem)]">
                        {children || <Outlet />}
                    </main>
                </div>
            </div>
        </LayoutContext.Provider>
    );
}
