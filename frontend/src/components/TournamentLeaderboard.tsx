import { useQuery } from '@tanstack/react-query';
import { getEventLeaderboard } from '../api/events';
import { cn } from '../lib/utils';
import { Trophy } from 'lucide-react';
import { EloBadge } from './EloBadge';


interface Props {
    eventId: number;
    eventName: string;
    description?: string;
}

export function TournamentLeaderboard({ eventId, eventName, description }: Props) {
    const { data: leaderboard, isLoading } = useQuery({
        queryKey: ['event_leaderboard', eventId],
        queryFn: () => getEventLeaderboard(eventId),
        enabled: !!eventId,
        refetchInterval: 5000 // Live updates for TV
    });

    if (isLoading) return (
        <div className="flex flex-col items-center justify-center p-20 text-white min-h-[400px]">
            <div className="w-12 h-12 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mb-4" />
            <p className="font-bold text-yellow-500 animate-pulse uppercase tracking-widest text-lg">Sincronizando clasificación...</p>
        </div>
    );

    const safeLeaderboard = Array.isArray(leaderboard) ? leaderboard : [];

    return (
        <div className="h-full bg-gray-900 text-white p-8">
            <header className="mb-8 text-center border-b border-gray-800 pb-6">
                <div className="inline-flex items-center justify-center p-3 bg-yellow-500/10 rounded-full mb-4">
                    <Trophy className="text-yellow-500 w-12 h-12" />
                </div>
                <h1 className="text-5xl font-black uppercase tracking-tight mb-2">{eventName}</h1>
                <p className="text-xl text-gray-400">{description || "Clasificación en tiempo real"}</p>
            </header>

            {safeLeaderboard.length === 0 ? (
                <div className="flex flex-col items-center justify-center h-96 text-gray-500">
                    <div className="text-2xl mb-2">Esperando tiempos...</div>
                    <p>¡Sé el primero en marcar una vuelta!</p>
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-gray-800 bg-gray-800/20 backdrop-blur-sm">
                    <table className="w-full text-left">
                        <thead className="bg-gray-800/50 text-gray-400 uppercase tracking-widest text-sm font-bold">
                            <tr>
                                <th className="p-6 pl-8">Pos</th>
                                <th className="p-6">Piloto</th>
                                <th className="p-6">Auto</th>
                                <th className="p-6 text-right">Tiempo</th>
                                <th className="p-6 text-right pr-8">Dif.</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-gray-800">
                            {safeLeaderboard.slice(0, 10).map((entry, index) => (
                                <tr key={entry.lap_id} className={cn(
                                    "text-2xl font-bold transition-colors",
                                    index === 0 ? "bg-yellow-500/10 text-yellow-400" :
                                        index === 1 ? "bg-gray-500/10 text-gray-300" :
                                            index === 2 ? "bg-orange-500/10 text-orange-400" : "text-white hover:bg-white/5"
                                )}>
                                    <td className="p-6 pl-8">
                                        <div className={cn(
                                            "w-12 h-12 flex items-center justify-center rounded-lg border-2",
                                            index === 0 ? "border-yellow-500 bg-yellow-500/20" :
                                                "border-gray-700 bg-gray-800"
                                        )}>
                                            {index + 1}
                                        </div>
                                    </td>

                                    <td className="p-6">
                                        <div className="flex items-center gap-3">
                                            {entry.driver_name}
                                            <EloBadge driverName={entry.driver_name} size="md" />
                                        </div>
                                    </td>

                                    <td className="p-6 text-lg text-gray-400 font-medium">{entry.car_model}</td>
                                    <td className="p-6 text-right font-mono text-3xl">
                                        {new Date(entry.lap_time).toISOString().substr(14, 9)}
                                    </td>
                                    <td className="p-6 text-right pr-8 font-mono text-xl text-red-400">
                                        {entry.gap ? `+${(entry.gap / 1000).toFixed(3)}` : '-'}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
}
