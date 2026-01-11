import { useNavigate } from 'react-router-dom';
import { Trophy, Crown, MonitorPlay, Map, QrCode, Swords } from 'lucide-react';

export default function LandingPage() {
    const navigate = useNavigate();

    const menuItems = [
        {
            title: "TV Mode",
            description: "Vista rotativa automática para pantallas principales",
            icon: MonitorPlay,
            color: "blue",
            path: "/tv"
        },
        {
            title: "Leaderboard",
            description: "Tabla de tiempos general a pantalla completa",
            icon: Trophy,
            color: "yellow",
            path: "/tv/leaderboard"
        },
        {
            title: "Salón de la Fama",
            description: "Los mejores tiempos históricos",
            icon: Crown,
            color: "purple",
            path: "/hall-of-fame"
        },
        {
            title: "Live Map",
            description: "Mapa del circuito en tiempo real",
            icon: Map,
            color: "red",
            path: "/live-map" // We might need to handle this route specifically if it doesn't exist standalone yet
        },
        {
            title: "Pasaporte",
            description: "Escanear QR de piloto",
            icon: QrCode,
            color: "green",
            path: "/passport-scanner" // Placeholder for future feature
        },
        {
            title: "Battle Mode",
            description: "Comparativa Cara a Cara (VS)",
            icon: Swords,
            color: "red",
            path: "/battle"
        }
    ];

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-8">
            <div className="text-center mb-12">
                <h1 className="text-5xl font-black text-white mb-4 uppercase tracking-tighter">
                    <span className="text-blue-600">Assetto</span> Manager
                </h1>
                <p className="text-gray-400 text-xl">Selecciona un modo de visualización</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 max-w-6xl w-full">
                {menuItems.map((item) => (
                    <button
                        key={item.title}
                        onClick={() => navigate(item.path)}
                        className={`
              relative overflow-hidden group p-8 rounded-3xl border border-gray-800 bg-gray-900 
              hover:border-${item.color}-500/50 transition-all duration-300 hover:shadow-2xl hover:scale-105 text-left
            `}
                    >
                        <div className={`
              absolute top-0 right-0 p-32 bg-${item.color}-500/10 rounded-full blur-3xl 
              group-hover:bg-${item.color}-500/20 transition-all duration-500 -mr-16 -mt-16
            `} />

                        <item.icon className={`w-12 h-12 text-${item.color}-500 mb-6 relative z-10`} />

                        <h3 className="text-2xl font-bold text-white mb-2 relative z-10">{item.title}</h3>
                        <p className="text-gray-400 relative z-10">{item.description}</p>
                    </button>
                ))}
            </div>

            <div className="mt-16 text-gray-600 text-sm">
                <button onClick={() => navigate('/')} className="hover:text-white transition-colors">
                    Acceder al Panel de Administración
                </button>
            </div>
        </div>
    );
}
