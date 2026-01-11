import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../api/dashboard';
import { Monitor, HardDrive, Users, Activity, Trophy, Zap, Flag } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 5000
    });

    if (isLoading) return <div className="p-8 text-white">Cargando centro de mando...</div>;
    if (error) return <div className="p-8 text-red-400">Error conectando con el servidor central.</div>;

    const allOnline = stats?.online_stations === stats?.total_stations;

    return (
        <div className="p-8 max-w-[1600px] mx-auto">
            {/* HEADER */}
            <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <Monitor className="text-blue-500" size={32} />
                        CENTRO DE MANDO
                    </h1>
                    <p className="text-gray-400 mt-1 font-medium">Panel de control general de la sala</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className={`px-4 py-2 rounded-full font-bold text-sm border ${allOnline ? 'bg-green-500/10 text-green-400 border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'}`}>
                        ESTADO DE SALA: {allOnline ? '100% OPERATIVA' : 'ATENCIÓN REQUERIDA'}
                    </div>
                </div>
            </div>

            {/* KPI GRID */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <StatCard
                    label="Simuladores Assets"
                    value={`${stats?.online_stations}/${stats?.total_stations}`}
                    subvalue="Conectados"
                    icon={Zap}
                    color={allOnline ? "green" : "orange"}
                />
                <StatCard
                    label="Perfil Activo"
                    value={stats?.active_profile || "Sin Perfil"}
                    subvalue="Configuración Global"
                    icon={Flag}
                    color="indigo"
                />
                <StatCard
                    label="Pilotos Registrados"
                    value={stats?.total_drivers || "0"}
                    subvalue="Base de datos"
                    icon={Users}
                    color="blue"
                />
                <StatCard
                    label="Estado de Red"
                    value={stats?.syncing_stations && stats.syncing_stations > 0 ? "Sincronizando..." : "Estable"}
                    subvalue={stats?.syncing_stations && stats.syncing_stations > 0 ? `${stats.syncing_stations} transfiriendo` : "Sin actividad P2P"}
                    icon={HardDrive}
                    color={stats?.syncing_stations && stats.syncing_stations > 0 ? "blue" : "gray"}
                    animate={Boolean(stats?.syncing_stations && stats.syncing_stations > 0)}
                />
            </div>

            {/* ACTION PANELS */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* LEFT: SESSION CONTROL */}
                <div className="lg:col-span-2 space-y-8">
                    <div className="bg-gray-800 rounded-2xl shadow-xl border border-gray-700 overflow-hidden">
                        <div className="bg-gray-900/50 px-6 py-4 border-b border-gray-700 flex justify-between items-center">
                            <h2 className="font-bold text-white flex items-center gap-2"><Trophy size={20} className="text-yellow-500" /> GESTIÓN DE CARRERA</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <QuickAction
                                to="/profiles"
                                title="Cambiar Coche/Circuito"
                                desc="Aplicar un nuevo perfil a toda la sala"
                                color="blue"
                            />
                            <QuickAction
                                to="/events"
                                title="Organizar Torneo"
                                desc="Crear eliminatorias y brackets"
                                color="indigo"
                            />
                            <QuickAction
                                to="/championships"
                                title="Gestionar Campeonato"
                                desc="Administrar puntos de temporada"
                                color="purple"
                            />
                            <QuickAction
                                to="/drivers"
                                title="Registrar Piloto"
                                desc="Nuevo cliente en base de datos"
                                color="green"
                            />
                        </div>
                    </div>

                    <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-xl overflow-hidden text-white">
                        <div className="px-6 py-4 border-b border-white/10 flex justify-between items-center bg-black/20">
                            <h2 className="font-bold text-white flex items-center gap-2"><Monitor size={20} /> CONTROL DE SALA & TV</h2>
                        </div>
                        <div className="p-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
                            <Link to="/remote" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-blue-300">📱 Mando TV</h3>
                                <p className="text-xs text-gray-400">Controlar pantallas públicas</p>
                            </Link>
                            <Link to="/kiosk" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-yellow-300">🖥️ Menú Pantallas</h3>
                                <p className="text-xs text-gray-400">Landing page para TVs</p>
                            </Link>
                            <Link to="/config" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all border border-white/5 group">
                                <h3 className="font-bold mb-1 group-hover:text-red-300">🔧 Config. Hardware</h3>
                                <p className="text-xs text-gray-400">Monitorizar Agentes</p>
                            </Link>
                        </div>
                    </div>
                </div>

                {/* RIGHT: SYSTEM STATUS SIDEBAR (Placeholder for logs or alerts) */}
                <div className="space-y-6">
                    <div className="bg-orange-500/10 rounded-2xl p-6 border border-orange-500/20">
                        <h3 className="font-bold text-orange-400 mb-2 flex items-center gap-2"><Activity size={18} /> Alertas del Sistema</h3>
                        {/* Mock Alerts */}
                        <div className="space-y-3">
                            {!allOnline && (
                                <div className="bg-gray-900 p-3 rounded-lg border border-orange-500/30 text-sm shadow-sm">
                                    <p className="font-bold text-orange-400">Simuladores Desconectados</p>
                                    <p className="text-gray-400 text-xs mt-1">Algunos agentes no responden. Revise la red.</p>
                                </div>
                            )}
                            <div className="bg-gray-900 p-3 rounded-lg border border-blue-500/30 text-sm shadow-sm">
                                <p className="font-bold text-blue-400">Sistema Actualizado</p>
                                <p className="text-gray-400 text-xs mt-1">Versión v2.1.0 funcionando correctamente.</p>
                            </div>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

// Subcomponents for cleaner code
function StatCard({ label, value, subvalue, icon: Icon, color, animate }: any) {
    const colors: any = {
        green: "text-green-400 bg-green-500/20",
        orange: "text-orange-400 bg-orange-500/20",
        blue: "text-blue-400 bg-blue-500/20",
        indigo: "text-indigo-400 bg-indigo-500/20",
        gray: "text-gray-400 bg-gray-700/50"
    };

    return (
        <div className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 flex items-start justify-between hover:border-gray-600 transition-all">
            <div>
                <p className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-1">{label}</p>
                <h3 className="text-2xl font-black text-white mb-1 tracking-tight">{value}</h3>
                <p className="text-xs text-gray-500 font-medium">{subvalue}</p>
            </div>
            <div className={`p-3 rounded-xl ${colors[color]} ${animate ? 'animate-pulse' : ''}`}>
                <Icon size={24} />
            </div>
        </div>
    )
}

function QuickAction({ to, title, desc, color }: any) {
    const colors: any = {
        blue: "hover:border-blue-500/50 hover:bg-blue-500/10 group-hover:text-blue-400",
        indigo: "hover:border-indigo-500/50 hover:bg-indigo-500/10 group-hover:text-indigo-400",
        purple: "hover:border-purple-500/50 hover:bg-purple-500/10 group-hover:text-purple-400",
        green: "hover:border-green-500/50 hover:bg-green-500/10 group-hover:text-green-400",
    }

    return (
        <Link to={to} className={`block p-4 rounded-xl border border-gray-700 bg-gray-900 shadow-sm transition-all group ${colors[color]}`}>
            <h3 className="font-bold text-gray-200 mb-1 transition-colors">{title}</h3>
            <p className="text-sm text-gray-500">{desc}</p>
        </Link>
    )
}
