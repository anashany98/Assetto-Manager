import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getChampionship, getChampionshipStandings } from '../api/championships';
import { ArrowLeft, Trophy, Medal, Calendar, Flag } from 'lucide-react';
import { cn } from '../lib/utils';

export default function ChampionshipDetails() {
    const { id } = useParams<{ id: string }>();
    const champId = parseInt(id || '0');

    const { data: championship } = useQuery({
        queryKey: ['championship', champId],
        queryFn: () => getChampionship(champId)
    });

    const { data: standings, isLoading } = useQuery({
        queryKey: ['championship_standings', champId],
        queryFn: () => getChampionshipStandings(champId)
    });

    if (isLoading) return <div className="p-10 text-white text-center">Cargando clasificación...</div>;
    if (!championship) return <div className="p-10 text-white text-center">Campeonato no encontrado</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen">
            <Link to="/championships" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
                <ArrowLeft size={20} className="mr-2" /> Volver a Campeonatos
            </Link>

            {/* Header */}
            <div className="bg-gradient-to-r from-yellow-600 to-orange-600 rounded-3xl p-1 mb-10 shadow-2xl">
                <div className="bg-gray-900 rounded-[22px] p-8 relative overflow-hidden">
                    <div className="relative z-10">
                        <span className="bg-yellow-500 text-black px-3 py-1 rounded text-xs font-bold uppercase tracking-widest mb-4 inline-block">
                            Temporada Oficial
                        </span>
                        <h1 className="text-5xl font-black text-white italic uppercase tracking-tighter mb-4">
                            {championship.name}
                        </h1>
                        <div className="flex items-center space-x-6 text-gray-400">
                            <div className="flex items-center">
                                <Calendar size={18} className="mr-2" />
                                <span>Inicio: {new Date(championship.start_date).toLocaleDateString()}</span>
                            </div>
                            <div className="flex items-center">
                                <Flag size={18} className="mr-2" />
                                <span>{standings?.length || 0} Pilotos Activos</span>
                            </div>
                        </div>
                    </div>
                    <Trophy className="absolute -right-10 -bottom-10 text-white/5 rotate-12" size={300} />
                </div>
            </div>

            {/* Standings Table */}
            <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden shadow-xl">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-2xl font-black text-white uppercase italic tracking-tight flex items-center gap-3">
                        <Medal className="text-yellow-500" /> Clasificación General
                    </h2>
                    <span className="text-sm text-gray-500">Puntos F1 (25-18-15...)</span>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="bg-black/20 text-gray-500 text-xs uppercase tracking-widest font-bold">
                                <th className="p-4 text-center w-16">Pos</th>
                                <th className="p-4">Piloto</th>
                                <th className="p-4 text-center">Eventos</th>
                                <th className="p-4 text-center">Victorias</th>
                                <th className="p-4 text-center">Podios</th>
                                <th className="p-4 text-right pr-8">Puntos Totales</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {standings?.map((driver, idx) => (
                                <tr key={driver.driver_name} className="hover:bg-white/5 transition-colors group">
                                    <td className="p-4 text-center">
                                        <div className={cn(
                                            "w-8 h-8 rounded-lg flex items-center justify-center font-bold mx-auto",
                                            idx === 0 ? "bg-yellow-500 text-black" :
                                                idx === 1 ? "bg-gray-400 text-black" :
                                                    idx === 2 ? "bg-orange-700 text-white" : "bg-gray-800 text-gray-500"
                                        )}>
                                            {idx + 1}
                                        </div>
                                    </td>
                                    <td className="p-4">
                                        <div className="font-bold text-white text-lg group-hover:text-blue-400 transition-colors">
                                            {driver.driver_name}
                                        </div>
                                    </td>
                                    <td className="p-4 text-center text-gray-400 font-mono">
                                        {driver.events_participated}
                                    </td>
                                    <td className="p-4 text-center text-white/80 font-mono">
                                        {driver.wins > 0 ? <span className="text-yellow-500 font-bold">{driver.wins}</span> : '-'}
                                    </td>
                                    <td className="p-4 text-center text-white/80 font-mono">
                                        {driver.podiums > 0 ? <span className="text-blue-400 font-bold">{driver.podiums}</span> : '-'}
                                    </td>
                                    <td className="p-4 text-right pr-8">
                                        <div className="font-black text-2xl text-white font-mono tracking-tight">
                                            {driver.total_points} <span className="text-xs text-gray-600 ml-1">PTS</span>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                            {standings?.length === 0 && (
                                <tr>
                                    <td colSpan={6} className="p-12 text-center text-gray-500 italic">
                                        Aún no hay datos registrados en este campeonato.
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
