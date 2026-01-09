import { useQuery } from '@tanstack/react-query';
import { getDashboardStats } from '../api/dashboard';
import { Monitor, HardDrive, Users, Activity } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function Dashboard() {
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 5000 // Poll every 5s for real-time arcade status
    });

    if (isLoading) return <div className="p-8 text-white">Cargando estado de la sala...</div>;
    if (error) return <div className="p-8 text-red-400">Error conectando con el servidor central.</div>;

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-bold text-gray-800">Sala de Simuladores</h1>
                    <p className="text-gray-500">Vista general en tiempo real</p>
                </div>
                <div className="flex space-x-3">
                    {/* Quick Actions for Operator */}
                    <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-colors flex items-center gap-2">
                        <Activity size={18} /> PARADA DE EMERGENCIA
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
                {/* KPI: Stations Online */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-gray-500 text-sm font-medium uppercase mb-1">Simuladores Online</h3>
                        <p className="text-4xl font-bold text-gray-900">{stats?.online_stations} <span className="text-lg text-gray-400 font-normal">/ {stats?.total_stations}</span></p>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stats?.online_stations === stats?.total_stations ? 'bg-green-100 text-green-600' : 'bg-yellow-100 text-yellow-600'}`}>
                        <Monitor size={24} />
                    </div>
                </div>

                {/* KPI: Active Profile */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between col-span-2">
                    <div>
                        <h3 className="text-gray-500 text-sm font-medium uppercase mb-1">Evento Actual (Perfil)</h3>
                        <p className="text-3xl font-bold text-indigo-600 truncate">{stats?.active_profile}</p>
                    </div>
                    <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center">
                        <Users size={24} />
                    </div>
                </div>

                {/* KPI: Sync Status */}
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-gray-500 text-sm font-medium uppercase mb-1">Sincronizando</h3>
                        <p className="text-4xl font-bold text-gray-900">{stats?.syncing_stations}</p>
                    </div>
                    <div className={`w-12 h-12 rounded-full flex items-center justify-center ${stats?.syncing_stations && stats.syncing_stations > 0 ? 'bg-blue-100 text-blue-600 animate-pulse' : 'bg-gray-100 text-gray-400'}`}>
                        <HardDrive size={24} />
                    </div>
                </div>
            </div>

            {/* Operator Quick Actions Section */}
            <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-2xl p-8 text-white shadow-lg">
                <h2 className="text-xl font-bold mb-4 flex items-center gap-2">
                    <Activity className="text-green-400" />
                    Panel de Operador (Acciones Rápidas)
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <Link to="/profiles" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all cursor-pointer border border-white/5 hover:border-white/30 text-left group">
                        <h3 className="font-bold text-lg mb-1 group-hover:text-blue-300">Cambiar Evento (Perfil)</h3>
                        <p className="text-sm text-gray-400">Seleccionar coche/circuito para toda la sala.</p>
                    </Link>
                    <Link to="/mods" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all cursor-pointer border border-white/5 hover:border-white/30 text-left group">
                        <h3 className="font-bold text-lg mb-1 group-hover:text-purple-300">Instalar Nuevo Mod</h3>
                        <p className="text-sm text-gray-400">Subir .zip de coche o circuito.</p>
                    </Link>
                    <Link to="/config" className="bg-white/10 hover:bg-white/20 p-4 rounded-xl transition-all cursor-pointer border border-white/5 hover:border-white/30 text-left group">
                        <h3 className="font-bold text-lg mb-1 group-hover:text-yellow-300">Gestionar IPs</h3>
                        <p className="text-sm text-gray-400">Añadir o reiniciar simuladores.</p>
                    </Link>
                </div>
            </div>
        </div>
    );
}
