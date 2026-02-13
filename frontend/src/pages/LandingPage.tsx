import { useNavigate } from 'react-router-dom';
import { Trophy, MonitorPlay, Map, QrCode, Medal, Swords } from 'lucide-react';
import { useLicense } from '../context/LicenseContext';

export default function LandingPage() {
    const navigate = useNavigate();
    const { isLoading, isModuleEnabled, license } = useLicense();

    const COLOR_STYLES: Record<string, { hoverBorder: string; glow: string; glowHover: string; icon: string }> = {
        yellow: {
            hoverBorder: 'hover:border-yellow-500/50',
            glow: 'bg-yellow-500/10',
            glowHover: 'group-hover:bg-yellow-500/20',
            icon: 'text-yellow-500',
        },
        blue: {
            hoverBorder: 'hover:border-blue-500/50',
            glow: 'bg-blue-500/10',
            glowHover: 'group-hover:bg-blue-500/20',
            icon: 'text-blue-500',
        },
        green: {
            hoverBorder: 'hover:border-green-500/50',
            glow: 'bg-green-500/10',
            glowHover: 'group-hover:bg-green-500/20',
            icon: 'text-green-500',
        },
        purple: {
            hoverBorder: 'hover:border-purple-500/50',
            glow: 'bg-purple-500/10',
            glowHover: 'group-hover:bg-purple-500/20',
            icon: 'text-purple-500',
        },
        orange: {
            hoverBorder: 'hover:border-orange-500/50',
            glow: 'bg-orange-500/10',
            glowHover: 'group-hover:bg-orange-500/20',
            icon: 'text-orange-500',
        },
        red: {
            hoverBorder: 'hover:border-red-500/50',
            glow: 'bg-red-500/10',
            glowHover: 'group-hover:bg-red-500/20',
            icon: 'text-red-500',
        },
    };

    const menuItems: Array<{
        title: string;
        description: string;
        icon: typeof Trophy;
        color: keyof typeof COLOR_STYLES;
        path: string;
        moduleKeys: string[];
    }> = [
        {
            title: "Clasificación en Vivo",
            description: "Clasificación en tiempo real y estadísticas de pista",
            icon: Trophy,
            color: "yellow",
            path: "/leaderboard",
            moduleKeys: ["leaderboard"],
        },
        {
            title: "Pasaporte Piloto",
            description: "Consulta tus estadísticas personales y récords",
            icon: QrCode,
            color: "blue",
            path: "/passport-scanner",
            moduleKeys: ["passport"],
        },
        {
            title: "Mapa en Vivo",
            description: "Rastreo GPS de los simuladores en pista",
            icon: Map,
            color: "green",
            path: "/live-map",
            moduleKeys: ["live_map"],
        },
        {
            title: "Modo TV",
            description: "Pantalla de rotación automática para eventos",
            icon: MonitorPlay,
            color: "purple",
            path: "/tv",
            moduleKeys: ["tv"],
        },
        {
            title: "Salón de la Fama",
            description: "Los pilotos más rápidos de la historia",
            icon: Medal,
            color: "orange",
            path: "/hall-of-fame",
            moduleKeys: ["hall_of_fame"],
        },
        {
            title: "Modo Batalla",
            description: "Encuentros 1vs1 directos",
            icon: Swords,
            color: "red",
            path: "/battle",
            moduleKeys: ["battle"],
        }
    ];

    const visibleItems = menuItems.filter((item) => item.moduleKeys.some((k) => isModuleEnabled(k)));

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-12">
                <h1 className="text-5xl font-black text-white mb-4 uppercase tracking-tighter">
                    <span className="text-blue-600">Assetto</span> Manager
                </h1>
                <p className="text-gray-400 text-xl">Selecciona un modo de visualización</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
                {isLoading && (
                    Array.from({ length: 6 }).map((_, idx) => (
                        <div
                            key={idx}
                            className="relative overflow-hidden p-8 rounded-3xl border border-gray-800 bg-gray-900 text-left animate-pulse"
                        >
                            <div className="w-12 h-12 rounded-xl bg-gray-800 mb-6" />
                            <div className="h-6 w-2/3 rounded bg-gray-800 mb-3" />
                            <div className="h-4 w-full rounded bg-gray-800 mb-2" />
                            <div className="h-4 w-5/6 rounded bg-gray-800" />
                        </div>
                    ))
                )}

                {!isLoading && visibleItems.map((item) => {
                    const styles = COLOR_STYLES[item.color];
                    return (
                        <button
                            key={item.title}
                            onClick={() => navigate(item.path)}
                            className={`relative overflow-hidden group p-8 rounded-3xl border border-gray-800 bg-gray-900 ${styles.hoverBorder} transition-all duration-300 hover:shadow-2xl hover:scale-105 text-left`}
                        >
                            <div className={`absolute top-0 right-0 p-32 ${styles.glow} rounded-full blur-3xl ${styles.glowHover} transition-all duration-500 -mr-16 -mt-16`} />

                            <item.icon className={`w-12 h-12 ${styles.icon} mb-6 relative z-10`} />

                            <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{item.title}</h3>
                            <p className="text-gray-400 relative z-10">{item.description}</p>
                        </button>
                    );
                })}

                {!isLoading && visibleItems.length === 0 && (
                    <div className="col-span-full">
                        <div className="max-w-2xl mx-auto p-10 rounded-3xl border border-gray-800 bg-gray-900 text-center">
                            <p className="text-white text-xl font-bold mb-2">No hay módulos habilitados</p>
                            <p className="text-gray-400">
                                {license?.is_valid
                                    ? 'La licencia actual no habilita módulos de pantallas.'
                                    : 'Activa una licencia para mostrar solo los módulos autorizados.'}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            <div className="mt-16 text-gray-700 text-xs">
                <button onClick={() => navigate('/admin')} className="hover:text-blue-500 transition-colors uppercase font-bold tracking-widest">
                    Panel de Gestión
                </button>
            </div>
        </div>
    );
}
