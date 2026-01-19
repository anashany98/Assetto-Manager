import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Trophy, Shuffle, Settings } from 'lucide-react';


export default function TournamentAdmin({ eventId, isCompleted }: { eventId: number; isCompleted: boolean }) {
    const queryClient = useQueryClient();
    const [participants, setParticipants] = useState<string>(''); // Text area input for simple list

    // Fetch Bracket
    const { data: bracket } = useQuery({
        queryKey: ['bracket', eventId],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/tournaments/${eventId}/bracket`);
                return res.data?.status === 'empty' ? null : res.data;
            } catch { return null; }
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
        mutationFn: async ({ matchId, score1, score2, winner }: { matchId: number; score1: number; score2: number; winner: string }) => {
            await axios.post(`${API_URL}/tournaments/${eventId}/match/${matchId}/update`, null, {
                params: { score1, score2, winner }
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['bracket', eventId] });
        }
    });


    // Process Results Mutation (ELO + Stats)
    const processResultsMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.post(`${API_URL}/events/${eventId}/process_results`);
            return res.data;
        },
        onSuccess: (data: any) => {
            alert(`¡Evento Finalizado! ELO actualizado para ${data.participants} pilotos.`);
            window.location.reload();
        },
        onError: (err: any) => {
            alert("Error: " + (err.response?.data?.detail || err.message));
        }
    });

    // Update Session Config Mutation
    const updateConfigMutation = useMutation({
        mutationFn: async (config: { mode: 'practice' | 'race', duration_minutes: number, laps: number }) => {
            await axios.put(`${API_URL}/events/${eventId}/config`, config);
        },
        onSuccess: () => {
            alert("Configuración de sesión actualizada");
        }
    });

    const [config, setConfig] = useState({
        mode: 'race' as 'practice' | 'race',
        duration_minutes: 15,
        laps: 5
    });

    const handleGenerate = () => {
        const list = participants.split('\n').map(p => p.trim()).filter(p => p.length > 0);
        if (list.length < 2) return alert("Se necesitan al menos 2 participantes");
        generateMutation.mutate(list);
    };

    if (!bracket) {
        return (
            <div className="space-y-8">
                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-white font-bold mb-4 flex items-center">
                        <Shuffle className="mr-2 text-blue-500" /> Generar Cuadro (Torneo)
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">Si este evento es un torneo eliminatorio, introduce los participantes aquí. Si es una carrera normal, usa el botón de finalizar abajo.</p>
                    <textarea
                        className="w-full bg-gray-900 text-white p-4 rounded-lg border border-gray-700 mb-4 h-40 font-mono text-sm"
                        placeholder="Escribe los nombres de los pilotos (uno por línea)..."
                        value={participants}
                        onChange={(e) => setParticipants(e.target.value)}
                    />
                    <button
                        onClick={handleGenerate}
                        disabled={generateMutation.isPending || isCompleted}
                        className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        {generateMutation.isPending ? 'Generando...' : 'Crear Torneo'}
                    </button>
                </div>

                <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                    <h3 className="text-white font-bold mb-4 flex items-center">
                        <Trophy className="mr-2 text-yellow-500" /> Finalizar Evento (Estándar)
                    </h3>
                    <p className="text-gray-400 text-sm mb-4">
                        Calcula los puntos ELO basados en la clasificación actual (tiempos de vuelta) y cierra el evento.
                    </p>

                    {isCompleted ? (
                        <div className="bg-green-900/30 border border-green-800 text-green-400 p-4 rounded-lg text-center font-bold">
                            ✅ Evento Finalizado y Procesado
                        </div>
                    ) : (
                        <button
                            onClick={() => {
                                if (confirm("¿Seguro que quieres finalizar el evento? Se calculará el ELO y no se podrán añadir más tiempos.")) {
                                    processResultsMutation.mutate();
                                }
                            }}
                            disabled={processResultsMutation.isPending}
                            className="w-full bg-yellow-600 hover:bg-yellow-500 text-white font-bold py-3 rounded-lg transition-colors flex justify-center items-center"
                        >
                            {processResultsMutation.isPending ? 'Procesando...' : 'Finalizar y Calcular ELO'}
                        </button>
                    )}
                </div>
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

            {/* Session Configuration Form */}
            <div className="bg-gray-800 p-6 rounded-xl border border-gray-700">
                <h4 className="text-white font-bold mb-4 flex items-center">
                    <Settings className="mr-2 text-blue-500" /> Configuración de Sesiones
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase mb-2">Modo de Competición</label>
                        <select
                            value={config.mode}
                            onChange={e => setConfig({ ...config, mode: e.target.value as any })}
                            className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700"
                        >
                            <option value="race">Carrera (Simultánea)</option>
                            <option value="practice">Contrarreloj / Rally (Individual)</option>
                        </select>
                    </div>
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase mb-2">Duración (Minutos)</label>
                        <input
                            type="number"
                            value={config.duration_minutes}
                            onChange={e => setConfig({ ...config, duration_minutes: parseInt(e.target.value) })}
                            className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700"
                            min={1}
                        />
                    </div>
                    <div>
                        <label className="block text-gray-400 text-xs font-bold uppercase mb-2">Vueltas</label>
                        <input
                            type="number"
                            value={config.laps}
                            onChange={e => setConfig({ ...config, laps: parseInt(e.target.value) })}
                            className="w-full bg-gray-900 text-white rounded-lg p-3 border border-gray-700"
                            min={1}
                        />
                    </div>
                </div>
                <div className="mt-4 flex justify-end">
                    <button
                        onClick={() => updateConfigMutation.mutate(config)}
                        disabled={updateConfigMutation.isPending}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-lg font-bold text-sm transition-colors"
                    >
                        {updateConfigMutation.isPending ? 'Guardando...' : 'Guardar Configuración'}
                    </button>
                </div>
            </div>

            <div className="grid gap-6">
                {Array.isArray(bracket.rounds) && bracket.rounds.map((round: { id: number; match_num: number; player1?: string; player2?: string; score1?: number; score2?: number; winner?: string; status: string }[], rIdx: number) => (
                    <div key={rIdx} className="bg-gray-800/50 p-4 rounded-xl border border-gray-700">
                        <h4 className="text-gray-400 font-bold uppercase text-xs tracking-widest mb-4 border-b border-gray-700 pb-2">
                            Ronda {rIdx + 1}
                        </h4>
                        <div className="space-y-3">
                            {Array.isArray(round) && round.map((match) => (
                                <MatchAdminCard
                                    key={match.id}
                                    match={match}
                                    onUpdate={(data: { score1: number; score2: number; winner: string }) => updateMatchMutation.mutate({ ...data, matchId: match.id })}
                                />
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}



function MatchAdminCard({ match, onUpdate }: { match: { id: number; match_num: number; player1?: string; player2?: string; score1?: number; score2?: number; winner?: string; status: string }, onUpdate: (d: { score1: number; score2: number; winner: string }) => void }) {
    const isLocked = !match.player1 || !match.player2;
    const isCompleted = match.status === 'completed';

    const [s1, setS1] = useState(match.score1 ?? 0);
    const [s2, setS2] = useState(match.score2 ?? 0);

    const handleSave = (winnerName?: string) => {
        if (!winnerName) return;
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

