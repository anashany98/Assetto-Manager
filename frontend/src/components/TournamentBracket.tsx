import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Trophy, AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';

interface Match {
    id: number;
    round: number;
    match_num: number;
    player1: string | null;
    player2: string | null;
    winner: string | null;
    score1?: number;
    score2?: number;
    status?: string;
}

interface BracketData {
    rounds: Match[][];
}

const EVENTS_URL = `${API_URL}/events`;

export default function TournamentBracket({ eventId, isAdmin = false }: { eventId: number, isAdmin?: boolean }) {
    const queryClient = useQueryClient();
    const { data: bracketData, isLoading, error } = useQuery<BracketData | { status: string }>({
        queryKey: ['bracket', eventId],
        queryFn: async () => {
            const res = await axios.get(`${EVENTS_URL}/${eventId}/bracket`);
            return res.data;
        }
    });

    const generateMutation = useMutation({
        mutationFn: (size: number) => axios.post(`${EVENTS_URL}/${eventId}/generate_bracket`, null, { params: { size } }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bracket', eventId] })
    });

    const setWinnerMutation = useMutation({
        mutationFn: ({ matchId, winner }: { matchId: number, winner: string }) =>
            axios.post(`${EVENTS_URL}/match/${matchId}/winner`, null, {
                params: { winner_name: winner, event_id: eventId }
            }),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ['bracket', eventId] })
    });

    if (isLoading) return (
        <div className="p-8 text-center text-white flex flex-col items-center justify-center min-h-[200px]">
            <div className="w-8 h-8 border-4 border-yellow-500/20 border-t-yellow-500 rounded-full animate-spin mb-3" />
            <p className="font-bold text-yellow-500 animate-pulse uppercase tracking-widest text-xs">Cargando cuadro...</p>
        </div>
    );

    if (error) return (
        <div className="p-8 text-center text-red-500 flex flex-col items-center justify-center min-h-[200px]">
            <AlertTriangle size={32} className="mb-2 opacity-50" />
            <p className="font-bold uppercase tracking-widest text-xs">Error al cargar el cuadro</p>
        </div>
    );

    const bracket = (bracketData && 'rounds' in bracketData) ? bracketData : null;
    const rounds = bracket?.rounds || [];
    const totalRounds = rounds.length;

    const getRoundName = (index: number) => {
        if (index === totalRounds - 1) return "Final";
        if (index === totalRounds - 2) return "Semifinales";
        if (index === totalRounds - 3) return "Cuartos de Final";
        return `Ronda ${index + 1}`;
    };

    return (
        <div className="w-full h-full overflow-x-auto p-8">
            {(!bracket || rounds.length === 0) ? (
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
                    {Array.isArray(rounds) && rounds.map((round, roundIndex) => (
                        <div key={roundIndex} className="flex flex-col gap-8 relative pt-12">
                            <h3 className="text-center text-yellow-500 font-bold uppercase tracking-widest mb-4 absolute top-0 left-0 right-0">
                                {getRoundName(roundIndex)}
                            </h3>
                            {Array.isArray(round) && [...round].sort((a, b) => (a.match_num || 0) - (b.match_num || 0)).map((match: Match) => (
                                <div key={match.id} className="relative w-64">
                                    <div className={`bg-[#1a1c23] border ${match.winner ? 'border-yellow-500/50' : 'border-gray-700'} rounded-lg overflow-hidden shadow-xl`}>
                                        <div className="flex justify-between items-center text-xs text-gray-500 px-3 py-1 bg-black/20 border-b border-white/5">
                                            <span>Match #{match.match_num}</span>
                                            {match.winner && <span className="text-green-500">Completado</span>}
                                        </div>

                                        <div
                                            className={`px-4 py-3 border-b border-white/5 flex justify-between items-center cursor-pointer hover:bg-white/5 transition-colors ${match.winner === match.player1 ? 'bg-yellow-500/10' : ''}`}
                                            onClick={() => isAdmin && match.player1 && setWinnerMutation.mutate({ matchId: match.id, winner: match.player1 })}
                                        >
                                            <span className={`font-bold ${match.winner === match.player1 ? 'text-yellow-400' : 'text-gray-300'} ${!match.player1 ? 'italic text-gray-600' : ''}`}>
                                                {match.player1 || 'BYE'}
                                            </span>
                                            {match.winner === match.player1 && <Trophy size={14} className="text-yellow-400" />}
                                        </div>

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
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
            )}

            {/* Winner Pedestal */}
            {Array.isArray(rounds) && rounds.length > 0 && Array.isArray(rounds[rounds.length - 1]) && rounds[rounds.length - 1][0]?.winner && (
                <div className="flex flex-col items-center justify-center mt-20 animate-in zoom-in duration-500">
                    <Trophy size={64} className="text-yellow-400 mb-4 drop-shadow-[0_0_15px_rgba(250,204,21,0.5)]" />
                    <div className="text-sm text-yellow-500 uppercase font-bold tracking-widest mb-2">Campeón</div>
                    <div className="text-3xl font-black text-white bg-gradient-to-r from-yellow-600 to-yellow-400 bg-clip-text text-transparent">
                        {rounds[rounds.length - 1][0]?.winner}
                    </div>
                </div>
            )}
        </div>
    );
}
