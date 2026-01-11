import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Trophy, Shuffle, Save, AlertCircle } from 'lucide-react';

export default function TournamentAdmin({ eventId }: { eventId: number }) {
    const queryClient = useQueryClient();
    const [participants, setParticipants] = useState<string>(''); // Text area input for simple list

    // Fetch Bracket
    const { data: bracket } = useQuery({
        queryKey: ['bracket', eventId],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/tournaments/${eventId}/bracket`);
                return res.data?.status === 'empty' ? null : res.data;
            } catch (e) { return null; }
        }
    });

    // Generate Bracket Mutation
    const generateMutation = useMutation({
        mutationFn: async (playerList: string[]) => {
            await axios.post(`${API_URL}/tournaments/${eventId}/generate`, playerList);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bracket', eventId] });
        }
    });

    // Update Match Mutation
    const updateMatchMutation = useMutation({
        mutationFn: async ({ matchId, score1, score2, winner }: any) => {
            await axios.post(`${API_URL}/tournaments/${eventId}/match/${matchId}/update`, null, {
                params: { score1, score2, winner }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bracket', eventId] });
        }
    });

    const handleGenerate = () => {
        const list = participants.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        if (list.length < 2) return alert("Se necesitan al menos 2 participantes");
        generateMutation.mutate(list);
    };

    if (!bracket) {
        return (
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h3 className="text-white font-bold mb-4 flex items-center">
                    <Shuffle className="mr-2 text-blue-500" /> Generar Cuadro
                </h3>
                <textarea
                    className="w-full bg-gray-900 text-white p-4 rounded-lg border border-gray-700 mb-4 h-40 font-mono text-sm"
                    placeholder="Escribe los nombres de los pilotos (uno por línea)..."
                    value={participants}
                    onChange={(e) => setParticipants(e.target.value)}
                />
                <button
                    onClick={handleGenerate}
                    disabled={generateMutation.isPending}
                    className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center"
                >
                    {generateMutation.isPending ? 'Generando...' : 'Crear Torneo'}
                </button>
            </div>
        );
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center justify-between">
                <h3 className="text-white font-bold text-xl flex items-center">
                    <Trophy className="mr-2 text-yellow-500" /> Gestión del Torneo
                </h3>
                <span className="text-xs text-green-400 bg-green-900/30 px-3 py-1 rounded-full border border-green-800">
                    Cuadro Activo
                </span>
            </div>

            <div className="grid gap-6">
                {bracket.rounds.map((round: any[], rIdx: number) => (
                    <div key={rIdx} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                        <h4 className="text-gray-400 font-bold uppercase text-xs tracking-widest mb-4 border-b border-gray-700 pb-2">
                            Ronda {rIdx + 1}
                        </h4>
                        <div className="space-y-3">
                            {round.map((match: any) => (
                                <MatchAdminCard
                                    key={match.id}
                                    match={match}
                                    onUpdate={(data: any) => updateMatchMutation.mutate({ ...data, matchId: match.id })}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}

function MatchAdminCard({ match, onUpdate }: { match: any, onUpdate: (d: any) => void }) {
    const isLocked = !match.player1 || !match.player2;
    const isCompleted = match.status === 'completed';

    const [s1, setS1] = useState(match.score1);
    const [s2, setS2] = useState(match.score2);

    const handleSave = (winnerName: string) => {
        if (!confirm(`¿Confirmar a ${winnerName} como ganador?`)) return;
        onUpdate({ score1: s1, score2: s2, winner: winnerName });
    };

    if (isLocked) {
        return (
            <div className="bg-gray-900/50 p-3 rounded-lg border border-gray-800 opacity-50 flex justify-between items-center">
                <span className="text-sm font-mono text-gray-600">Partido #{match.match_num}</span>
                <span className="text-xs text-gray-600 italic">Esperando rivales...</span>
            </div>
        );
    }

    return (
        <div className={`bg-gray-900 p-4 rounded-lg border ${isCompleted ? 'border-green-900/50' : 'border-gray-700'} flex flex-col gap-3 transition-colors`}>
            <div className="flex justify-between items-center text-sm text-gray-500 mb-1">
                <span>Match #{match.match_num}</span>
                {isCompleted && <span className="text-green-500 font-bold text-xs uppercase">Finalizado</span>}
            </div>

            {/* Config Row */}
            <div className="flex items-center justify-between gap-4">
                {/* Player 1 */}
                <div className="flex-1 flex items-center justify-between bg-black/20 p-2 rounded border border-gray-800">
                    <span className={`font-bold truncate ${match.winner === match.player1 ? 'text-green-400' : 'text-white'}`}>{match.player1}</span>
                    <input
                        type="number"
                        value={s1}
                        onChange={(e) => setS1(parseInt(e.target.value))}
                        disabled={isCompleted}
                        className="w-12 bg-gray-800 border border-gray-700 rounded p-1 text-center font-mono text-white"
                    />
                </div>

                <div className="text-gray-600 font-bold text-xs">VS</div>

                {/* Player 2 */}
                <div className="flex-1 flex items-center justify-between bg-black/20 p-2 rounded border border-gray-800">
                    <input
                        type="number"
                        value={s2}
                        onChange={(e) => setS2(parseInt(e.target.value))}
                        disabled={isCompleted}
                        className="w-12 bg-gray-800 border border-gray-700 rounded p-1 text-center font-mono text-white"
                    />
                    <span className={`font-bold truncate text-right ${match.winner === match.player2 ? 'text-green-400' : 'text-white'}`}>{match.player2}</span>
                </div>
            </div>

            {/* Actions */}
            {!isCompleted && (
                <div className="flex gap-2 mt-1">
                    <button
                        onClick={() => handleSave(match.player1)}
                        className="flex-1 bg-gray-800 hover:bg-green-700 text-gray-300 hover:text-white py-1.5 rounded text-xs font-bold transition-colors border border-gray-700"
                    >
                        Gana {match.player1}
                    </button>
                    <button
                        onClick={() => handleSave(match.player2)}
                        className="flex-1 bg-gray-800 hover:bg-green-700 text-gray-300 hover:text-white py-1.5 rounded text-xs font-bold transition-colors border border-gray-700"
                    >
                        Gana {match.player2}
                    </button>
                </div>
            )}
        </div>
    );
}
