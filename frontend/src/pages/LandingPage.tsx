import { useNavigate } from 'react-router-dom';
import { Trophy, MonitorPlay, Map, QrCode, Medal, Swords, ChevronRight } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';

export default function LandingPage() {
    const navigate = useNavigate();
    const { isLoading, isModuleEnabled, license } = useLicense();

    const CARD_THEMES: Record<string, { gradient: string; shadow: string; icon: string; border: string }> = {
        gold: {
            gradient: 'from-amber-500/10 to-yellow-500/5',
            shadow: 'group-hover:shadow-amber-500/10',
            icon: 'text-amber-400',
            border: 'group-hover:border-amber-500/30',
        },
        blue: {
            gradient: 'from-blue-500/10 to-cyan-500/5',
            shadow: 'group-hover:shadow-blue-500/10',
            icon: 'text-blue-400',
            border: 'group-hover:border-blue-500/30',
        },
        emerald: {
            gradient: 'from-emerald-500/10 to-teal-500/5',
            shadow: 'group-hover:shadow-emerald-500/10',
            icon: 'text-emerald-400',
            border: 'group-hover:border-emerald-500/30',
        },
        violet: {
            gradient: 'from-violet-500/10 to-purple-500/5',
            shadow: 'group-hover:shadow-violet-500/10',
            icon: 'text-violet-400',
            border: 'group-hover:border-violet-500/30',
        },
        orange: {
            gradient: 'from-orange-500/10 to-amber-500/5',
            shadow: 'group-hover:shadow-orange-500/10',
            icon: 'text-orange-400',
            border: 'group-hover:border-orange-500/30',
        },
        rose: {
            gradient: 'from-rose-500/10 to-red-500/5',
            shadow: 'group-hover:shadow-rose-500/10',
            icon: 'text-rose-400',
            border: 'group-hover:border-rose-500/30',
        },
    };

    const menuItems: Array<{
        title: string;
        description: string;
        icon: typeof Trophy;
        theme: keyof typeof CARD_THEMES;
        path: string;
        moduleKeys: string[];
    }> = [
        {
            title: "Clasificación en Vivo",
            description: "Clasificación en tiempo real y estadísticas de pista",
            icon: Trophy,
            theme: "gold",
            path: "/leaderboard",
            moduleKeys: ["leaderboard"],
        },
        {
            title: "Pasaporte Piloto",
            description: "Consulta tus estadísticas personales y récords",
            icon: QrCode,
            theme: "blue",
            path: "/passport-scanner",
            moduleKeys: ["passport"],
        },
        {
            title: "Mapa en Vivo",
            description: "Rastreo GPS de los simuladores en pista",
            icon: Map,
            theme: "emerald",
            path: "/live-map",
            moduleKeys: ["live_map"],
        },
        {
            title: "Modo TV",
            description: "Pantalla de rotación automática para eventos",
            icon: MonitorPlay,
            theme: "violet",
            path: "/tv",
            moduleKeys: ["tv"],
        },
        {
            title: "Salón de la Fama",
            description: "Los pilotos más rápidos de la historia",
            icon: Medal,
            theme: "orange",
            path: "/hall-of-fame",
            moduleKeys: ["hall_of_fame"],
        },
        {
            title: "Modo Batalla",
            description: "Encuentros 1vs1 directos",
            icon: Swords,
            theme: "rose",
            path: "/battle",
            moduleKeys: ["battle"],
        },
    ];

    const visibleItems = menuItems.filter((item) => item.moduleKeys.some((k) => isModuleEnabled(k)));

    return (
        <div className="min-h-screen bg-surface-950 flex flex-col items-center justify-center relative overflow-hidden">
            {/* Background effects */}
            <div className="absolute inset-0 pointer-events-none">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/8 rounded-full blur-[120px]" />
                <div className="absolute bottom-0 right-0 w-[600px] h-[300px] bg-cyan-500/5 rounded-full blur-[100px]" />
                <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.03)_1px,transparent_1px)] bg-[size:48px_48px]" />
            </div>

            <div className="relative z-10 w-full max-w-6xl px-6 py-12">
                {/* Header */}
                <div className="text-center mb-14">
                    <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-blue-500/10 border border-blue-500/15 text-blue-400 text-xs font-medium mb-6">
                        <span className="w-1.5 h-1.5 rounded-full bg-blue-400 animate-pulse" />
                        Sistema activo
                    </div>
                    <h1 className="text-5xl sm:text-6xl font-black text-white mb-4 tracking-tight">
                        <span className="text-blue-400">Assetto</span> Manager
                    </h1>
                    <p className="text-slate-400 text-lg max-w-md mx-auto">
                        Selecciona un modo de visualización
                    </p>
                </div>

                {/* Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                    {isLoading &&
                        Array.from({ length: 6 }).map((_, idx) => (
                            <div
                                key={idx}
                                role="status"
                                aria-label="Cargando opciones del menú"
                                className="p-7 rounded-2xl border border-white/5 bg-white/3 animate-pulse"
                            >
                                <span className="sr-only">Cargando...</span>
                                <div className="w-12 h-12 rounded-xl bg-white/5 mb-5" />
                                <div className="h-5 w-2/3 rounded bg-white/5 mb-3" />
                                <div className="h-4 w-full rounded bg-white/5" />
                            </div>
                        ))
                    }

                    {!isLoading && visibleItems.map((item) => {
                        const theme = CARD_THEMES[item.theme];
                        return (
                            <button
                                key={item.title}
                                onClick={() => navigate(item.path)}
                                aria-label={`${item.title}: ${item.description}`}
                                className={`group relative overflow-hidden p-7 rounded-2xl border border-white/6 bg-gradient-to-br ${theme.gradient} backdrop-blur-sm transition-all duration-300 hover:shadow-2xl ${theme.shadow} ${theme.border} hover:scale-[1.02] hover:-translate-y-1 focus:outline-none focus:border-[var(--border-focus)] focus:ring-offset-2 focus:ring-offset-surface-950 text-left`}
                            >
                                {/* Glow */}
                                <div className="absolute -top-8 -right-8 w-32 h-32 bg-gradient-to-br from-white/3 to-transparent rounded-full blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

                                <div className={`w-12 h-12 rounded-xl flex items-center justify-center mb-5 bg-white/5 ${theme.icon} transition-transform duration-300 group-hover:scale-110`}>
                                    <item.icon size={24} />
                                </div>

                                <h3 className="text-xl font-bold text-white mb-2 flex items-center gap-2">
                                    {item.title}
                                    <ChevronRight size={16} className="text-white/30 group-hover:text-white/60 group-hover:translate-x-0.5 transition-all" />
                                </h3>
                                <p className="text-sm text-slate-400 leading-relaxed">{item.description}</p>
                            </button>
                        );
                    })}

                    {!isLoading && visibleItems.length === 0 && (
                        <div className="col-span-full">
                            <div className="max-w-xl mx-auto p-10 rounded-2xl border border-white/6 bg-white/3 text-center">
                                <p className="text-white text-lg font-bold mb-2">No hay módulos habilitados</p>
                                <p className="text-slate-400 text-sm">
                                    {license?.is_valid
                                        ? 'La licencia actual no habilita módulos de pantallas.'
                                        : 'Activa una licencia para mostrar solo los módulos autorizados.'}
                                </p>
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="mt-16 text-center">
                    <button
                        onClick={() => navigate('/admin')}
                        className="text-slate-600 hover:text-blue-400 transition-colors text-xs uppercase font-bold tracking-[0.2em]"
                    >
                        Panel de Gestión
                    </button>
                </div>
            </div>
        </div>
    );
}
