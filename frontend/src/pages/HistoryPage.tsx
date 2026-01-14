import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { getRecentSessions } from '../api/telemetry';
import { format } from 'date-fns';
import { Search, Filter, MapPin, Gauge, ChevronRight, History as HistoryIcon, AlertTriangle } from 'lucide-react';
import { Link } from 'react-router-dom';

export default function HistoryPage() {
    const [filters, setFilters] = useState({
        track_name: '',
        driver_name: '',
        car_model: '',
        limit: 50
    });

    const { data: sessions, isLoading, error } = useQuery({
        queryKey: ['history_sessions', filters],
        queryFn: async () => {
            const res = await getRecentSessions(filters);
            return Array.isArray(res) ? res : [];
        }
    });

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-12">
                <div>
                    <h1 className="text-5xl font-black text-white italic uppercase tracking-tighter flex items-center gap-4">
                        <HistoryIcon className="text-yellow-500" size={48} /> Historial de Carreras
                    </h1>
                    <p className="text-gray-500 font-bold uppercase tracking-[0.2em] text-sm mt-3">
                        Explora cada vuelta, cada sesión y cada dato histórico
                    </p>
                </div>

                <div className="flex bg-white/5 p-1 rounded-2xl border border-white/10 backdrop-blur-xl">
                    <div className="px-6 py-3 text-center">
                        <div className="text-2xl font-black text-white italic">{sessions?.length || 0}</div>
                        <div className="text-[10px] text-gray-500 font-black uppercase">Sesiones</div>
                    </div>
                </div>
            </div>

            {/* Filters Bar */}
            <div className="bg-gray-900/50 backdrop-blur-xl border border-white/5 rounded-3xl p-6 mb-10 shadow-2xl">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Piloto</label>
                        <div className="relative">
                            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                            <input
                                type="text"
                                placeholder="Buscar piloto..."
                                className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-gray-700"
                                value={filters.driver_name}
                                onChange={e => setFilters({ ...filters, driver_name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Circuito</label>
                        <div className="relative">
                            <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                            <input
                                type="text"
                                placeholder="Filtrar por pista..."
                                className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-gray-700"
                                value={filters.track_name}
                                onChange={e => setFilters({ ...filters, track_name: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest ml-1">Vehículo</label>
                        <div className="relative">
                            <Gauge className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-600" size={16} />
                            <input
                                type="text"
                                placeholder="Modelo de coche..."
                                className="w-full bg-black/40 border border-white/5 rounded-xl py-3 pl-12 pr-4 text-white font-bold focus:border-yellow-500 outline-none transition-all placeholder:text-gray-700"
                                value={filters.car_model}
                                onChange={e => setFilters({ ...filters, car_model: e.target.value })}
                            />
                        </div>
                    </div>

                    <div className="flex items-end">
                        <button className="w-full bg-white/5 hover:bg-white/10 text-white font-black uppercase italic tracking-tighter py-3 rounded-xl border border-white/10 transition-all flex items-center justify-center gap-2">
                            <Filter size={18} /> Aplicar Filtros
                        </button>
                    </div>
                </div>
            </div>

            {/* Sessions Table */}
            <div className="bg-gray-900/40 backdrop-blur-xl border border-white/5 rounded-3xl overflow-hidden shadow-2xl">
                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/40 text-gray-500 text-[10px] uppercase tracking-[0.2em] font-black border-b border-white/5">
                                <th className="p-6">Fecha / Hora</th>
                                <th className="p-6">Piloto</th>
                                <th className="p-6">Circuito</th>
                                <th className="p-6">Vehículo</th>
                                <th className="p-6 text-center">Mejor Vuelta</th>
                                <th className="p-6 text-right"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-white/5">
                            {isLoading ? (
                                Array.from({ length: 5 }).map((_, i) => (
                                    <tr key={i} className="animate-pulse">
                                        <td colSpan={6} className="p-8 bg-white/[0.01] h-20"></td>
                                    </tr>
                                ))
                            ) : Array.isArray(sessions) && sessions.length > 0 ? (
                                sessions.map((session: any) => (
                                    <tr key={session.id} className="hover:bg-white/[0.02] transition-all group">
                                        <td className="p-6">
                                            <div className="flex flex-col">
                                                <span className="text-white font-bold text-sm">
                                                    {session.date ? format(new Date(session.date), 'dd MMM yyyy') : 'Sin Fecha'}
                                                </span>
                                                <span className="text-gray-600 text-[10px] font-black uppercase mt-0.5">
                                                    {session.date ? format(new Date(session.date), 'HH:mm') : '--:--'}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="font-black text-white group-hover:text-yellow-500 transition-colors uppercase italic">
                                                {session.driver_name}
                                            </div>
                                        </td>
                                        <td className="p-6">
                                            <div className="flex items-center gap-2 text-gray-400 text-xs font-bold uppercase">
                                                <MapPin size={12} className="text-blue-500" /> {session.track_name}
                                            </div>
                                        </td>
                                        <td className="p-6 text-xs font-bold uppercase">
                                            <span className="bg-white/5 px-2.5 py-1 rounded-lg text-gray-400 border border-white/5">
                                                {session.car_model}
                                            </span>
                                        </td>
                                        <td className="p-6 text-center">
                                            <div className="text-yellow-500 font-mono text-lg font-black italic">
                                                {(session.best_lap / 1000).toFixed(3)}s
                                            </div>
                                        </td>
                                        <td className="p-6 text-right">
                                            <Link
                                                to={`/telemetry/${session.id}`}
                                                className="inline-flex items-center gap-2 bg-white/5 hover:bg-yellow-500 hover:text-black py-2 px-4 rounded-xl border border-white/10 transition-all text-[10px] font-black uppercase tracking-widest"
                                            >
                                                Analizar <ChevronRight size={14} />
                                            </Link>
                                        </td>
                                    </tr>
                                ))
                            ) : null}
                            {(!Array.isArray(sessions) || (sessions.length === 0 && !isLoading)) && (
                                <tr>
                                    <td colSpan={6} className="p-20 text-center text-gray-600 italic">
                                        {error ? (
                                            <div className="flex flex-col items-center">
                                                <AlertTriangle size={32} className="text-red-500/50 mb-2" />
                                                <p className="text-red-400 font-bold uppercase tracking-widest text-xs">Error al conectar con el historial</p>
                                            </div>
                                        ) : "No hay sesiones registradas que coincidan con los filtros."}
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
