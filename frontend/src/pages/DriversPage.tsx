import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getDrivers } from '../api/telemetry';
import { syncVMSUsers } from '../api/integrations';
import { useState } from 'react';
import { Search, Trophy, User, Clock, Car, ChevronRight, Medal, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';
import { formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DriversPage() {
    const { data: drivers, isLoading, error } = useQuery({
        queryKey: ['drivers'],
        queryFn: getDrivers
    });

    const [search, setSearch] = useState('');
    const queryClient = useQueryClient();

    const { mutate: syncUsers, isPending: isSyncing } = useMutation({
        mutationFn: () => syncVMSUsers(),
        onSuccess: (data) => {
            alert(`Sincronización completada:\nEncontrados: ${data.users_found}\nCreados: ${data.users_created}\nActualizados: ${data.users_updated}`);
            queryClient.invalidateQueries({ queryKey: ['drivers'] });
        },
        onError: () => alert('Error al sincronizar con VMS')
    });

    if (isLoading) return (
        <div className="p-10 text-center text-white flex flex-col items-center justify-center min-h-[400px]">
            <div className="w-10 h-10 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin mb-4" />
            <p className="font-bold text-blue-500 animate-pulse uppercase tracking-widest text-sm">Cargando pilotos...</p>
        </div>
    );

    if (error) return (
        <div className="p-10 text-center text-white flex flex-col items-center justify-center min-h-[400px]">
            <AlertTriangle size={48} className="text-red-500 mb-4" />
            <p className="font-bold text-red-500 uppercase tracking-widest text-sm">Error al cargar la base de datos de pilotos</p>
            <p className="text-gray-500 text-xs mt-2 font-medium">No se ha podido establecer conexión con el servidor.</p>
        </div>
    );

    const safeDrivers = Array.isArray(drivers) ? drivers : [];
    const filteredDrivers = safeDrivers.filter(d =>
        d.driver_name.toLowerCase().includes(search.toLowerCase())
    );

    const getRankColor = (rank: string) => {
        switch (rank) {
            case 'Alien': return 'text-purple-600 bg-purple-100 border-purple-200';
            case 'Pro': return 'text-blue-600 bg-blue-100 border-blue-200';
            case 'Amateur': return 'text-green-600 bg-green-100 border-green-200';
            default: return 'text-gray-600 bg-gray-100 border-gray-200';
        }
    };

    return (
        <div className="p-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-3xl font-black text-white italic uppercase tracking-tight">Pilotos y Licencias</h1>
                    <p className="text-gray-400 mt-1 font-bold">Base de datos de corredores registrados</p>
                </div>

                <div className="flex gap-4">
                    <button
                        onClick={() => syncUsers()}
                        disabled={isSyncing}
                        className="bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-colors shadow-lg shadow-blue-600/20"
                    >
                        <User size={18} /> {isSyncing ? 'Sincronizando...' : 'Sincronizar VMS'}
                    </button>
                    <div className="relative w-72">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                        <input
                            type="text"
                            placeholder="Buscar piloto..."
                            className="w-full pl-10 pr-4 py-2 bg-gray-900 border border-gray-700 rounded-xl focus:ring-2 focus:ring-blue-500 outline-none text-white placeholder-gray-500 font-medium"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {Array.isArray(safeDrivers) && safeDrivers.length > 0 ? (
                    filteredDrivers.map((driver, index) => (
                        <Link
                            to={`/drivers/${driver.driver_name}`}
                            key={driver.driver_name}
                            className="bg-gray-800 p-6 rounded-2xl shadow-lg border border-gray-700 hover:shadow-xl hover:border-gray-500 transition-all group relative overflow-hidden"
                        >
                            <div className="flex justify-between items-start mb-4 relative z-10">
                                <div className="flex items-center space-x-3">
                                    <div className="w-12 h-12 bg-gradient-to-br from-gray-700 to-gray-900 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-lg border border-gray-600">
                                        {driver.driver_name?.charAt(0).toUpperCase() || '?'}
                                    </div>
                                    <div>
                                        <h3 className="font-black text-lg text-white group-hover:text-blue-400 transition-colors uppercase tracking-tight">
                                            {driver.driver_name}
                                        </h3>
                                        <span className={`text-[10px] uppercase font-bold px-2 py-0.5 rounded-full border ${getRankColor(driver.rank_tier)}`}>
                                            {driver.rank_tier}
                                        </span>
                                    </div>
                                </div>
                                {index < 3 && (
                                    <Medal size={24} className={
                                        index === 0 ? "text-yellow-400" :
                                            index === 1 ? "text-gray-400" : "text-amber-600"
                                    } />
                                )}
                            </div>

                            <div className="grid grid-cols-2 gap-4 text-sm mb-4">
                                <div className="bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                                    <div className="text-gray-400 text-xs flex items-center gap-1 mb-1 font-bold uppercase">
                                        <Trophy size={10} /> Vueltas
                                    </div>
                                    <div className="font-black text-white">{driver.total_laps}</div>
                                </div>
                                <div className="bg-gray-900/50 p-2 rounded-lg border border-gray-700">
                                    <div className="text-gray-400 text-xs flex items-center gap-1 mb-1 font-bold uppercase">
                                        <Car size={10} /> Favorito
                                    </div>
                                    <div className="font-black text-white truncate" title={driver.favorite_car}>
                                        {driver.favorite_car}
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-4 border-t border-gray-700">
                                <div className="text-xs text-gray-400 flex items-center gap-1">
                                    <Clock size={12} />
                                    {formatDistanceToNow(new Date(driver.last_seen), { addSuffix: true, locale: es })}
                                </div>
                                <div className="text-blue-500 text-xs font-bold flex items-center group-hover:translate-x-1 transition-transform">
                                    Ver Pasaporte <ChevronRight size={14} />
                                </div>
                            </div>
                        </Link>
                    ))
                ) : (
                    <div className="col-span-full py-20 text-center bg-gray-900/30 rounded-3xl border-2 border-dashed border-gray-800 text-gray-500">
                        <User size={48} className="mx-auto mb-4 opacity-10" />
                        <p className="font-bold uppercase tracking-widest text-xs">No hay pilotos registrados</p>
                    </div>
                )}
            </div>

            {safeDrivers.length > 0 && filteredDrivers.length === 0 && (
                <div className="text-center py-12 text-gray-400">
                    <User size={48} className="mx-auto mb-4 opacity-50" />
                    <p>No se encontraron pilotos con ese nombre.</p>
                </div>
            )}
        </div >
    );
}
