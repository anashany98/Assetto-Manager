import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy } from 'lucide-react';
import axios from 'axios';

interface Match {
    id: number;
    round_number: number;
    match_number: number;
    player1: string | null;
    player2: string | null;
    winner: string | null;
    next_match_id: number | null;
}

const API_URL = `http://${window.location.hostname}:8000/events`;

export default function TournamentBracket({ eventId, isAdmin = false }: { eventId: number, isAdmin?: boolean }) {
    const queryClient = useQueryClient();
    const { data: matches, isLoading } = useQuery<Match[]>({
        queryKey: ['bracket', eventId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/${eventId}/bracket`);
            return res.data;
        }
    });

    const generateMutation = useMutation({
        mutationFn: (size: number) => axios.post(`${API_URL}/${eventId}/generate_bracket?size=${size}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bracket', eventId] })
    });

    const setWinnerMutation = useMutation({
        mutationFn: ({ matchId, winner }: { matchId: number, winner: string }) =>
            axios.post(`${API_URL}/match/${matchId}/winner?winner_name=${winner}`),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bracket', eventId] })
    });

    if (isLoading) return <div className="text-white">Cargando cuadro...</div>;

    // Group matches by round
    // round_number 4 = Quarter Finals, 2 = Semis, 1 = Final
    const storedRounds = matches?.reduce((acc, match) => {
        const r = match.round_number;
        if (!acc[r]) acc[r] = [];
        acc[r].push(match);
        return acc;
    }, {} as Record<number, Match[]>) || {};

    const rounds = Object.keys(storedRounds).map(Number).sort((a, b) => b - a); // 4, 2, 1

    const getRoundName = (r: number) => {
        if (r === 1) return "Final";
        if (r === 2) return "Semifinales";
        if (r === 4) return "Cuartos de Final";
        return `Ronda de ${r * 2}`;
    };

    return (
        <div className="w-full h-full overflow-x-auto p-8">
            {matches?.length === 0 ? (
                isAdmin ? (
                    <div className="text-center py-12 bg-white/5 rounded-xl border border-white/10">
                        <Trophy size={48} className="mx-auto text-yellow-500 mb-4" />
                        <h3 className="text-xl font-bold text-white mb-4">Generar Cuadro del Torneo</h3>
                        <p className="text-gray-400 mb-6">Selecciona el tamaño del cuadro basado en la clasificación actual.</p>
                        <div className="flex justify-center gap-4">
                            {[4, 8, 16].map(size => (
                                <button
                                    key={size}
                                    onClick={() => {
                                        if (confirm(`¿Generar cuadro de ${size} jugadores? Borrará cualquier progreso actual.`))
                                            generateMutation.mutate(size);
                                    }}
                                    className="px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold transition-colors"
                                >
                                    Top {size}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="text-center text-gray-400 py-12">El cuadro del torneo aún no ha sido generado.</div>
                )
            ) : (
                <div className="flex justify-center items-center gap-12 min-w-max">
                    {rounds.map((round) => (
                        <div key={round} className="flex flex-col justify-around gap-8 relative">
                            <h3 className="text-center text-yellow-500 font-bold uppercase tracking-widest mb-4 absolute -top-8 w-full">
                                {getRoundName(round)}
                            </h3>
                            {storedRounds[round].sort((a, b) => a.match_number - b.match_number).map(match => (
                                <div key={match.id} className="relative w-64">
                                    {/* Connector Lines (Left Side) - Only if not first round */}

                                    <div className={`bg-[#1a1c23] border ${match.winner ? 'border-yellow-500/50' : 'border-gray-700'} rounded-lg overflow-hidden shadow-xl`}>
                                        <div className="flex justify-between items-center text-xs text-gray-500 px-3 py-1 bg-black/20 border-b border-white/5">
                                            <span>Match #{match.match_number}</span>
                                            {match.winner && <span className="text-green-500">Completado</span>}
                                        </div>

                                        {/* Player 1 */}
                                        <div
                                            className={`px-4 py-3 border-b border-white/5 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors ${match.winner === match.player1 ? 'bg-yellow-500/10' : ''}`}
                                            onClick={() => isAdmin && match.player1 && setWinnerMutation.mutate({ matchId: match.id, winner: match.player1 })}
                                        >
                                            <span className={`font-bold ${match.winner === match.player1 ? 'text-yellow-400' : 'text-gray-300'} ${!match.player1 ? 'italic text-gray-600' : ''}`}>
                                                {match.player1 || 'BYE'}
                                            </span>
                                            {match.winner === match.player1 && <Trophy size={14} className="text-yellow-400" />}
                                        </div>

                                        {/* Player 2 */}
                                        <div
                                            className={`px-4 py-3 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors ${match.winner === match.player2 ? 'bg-yellow-500/10' : ''}`}
                                            onClick={() => isAdmin && match.player2 && setWinnerMutation.mutate({ matchId: match.id, winner: match.player2 })}
                                        >
                                            <span className={`font-bold ${match.winner === match.player2 ? 'text-yellow-400' : 'text-gray-300'} ${!match.player2 ? 'italic text-gray-600' : ''}`}>
                                                {match.player2 || 'BYE'}
                                            </span>
                                            {match.winner === match.player2 && <Trophy size={14} className="text-yellow-400" />}
                                        </div>
                                    </div>

                                    {/* Connector Lines Logic (Simplified for CSS) */}
                                    {/* 
                                       We can use SVG or CSS borders for real connectors, 
                                       but for now, simple spacing works well enough. 
                                    */}
                                </div>
                            ))}
                        </div>
                    ))}

                    {/* Winner Pedestal */}
                    {rounds.includes(1) && storedRounds[1][0].winner && (
                        <div className="flex flex-col items-center justify-center animate-in zoom-in duration-500">
                            <Trophy size={64} className="text-yellow-400 mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                            <div className="text-sm text-yellow-500 uppercase font-bold tracking-widest mb-2">Campeón</div>
                            <div className="text-3xl font-black text-white bg-gradient-to-r from-yellow-600 to-yellow-400 bg-clip-text text-transparent">
                                {storedRounds[1][0].winner}
                            </div>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
