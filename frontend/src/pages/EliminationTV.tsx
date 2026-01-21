import { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { Skull, Trophy, Timer, Users, Zap, AlertTriangle } from 'lucide-react';

interface Participant {
    driver_name: string;
    is_eliminated: boolean;
    eliminated_at_lap: number | null;
    laps_completed: number;
    current_lap_time: number | null;
    best_lap_time: number | null;
    final_position: number | null;
}

interface RaceStatus {
    id: number;
    name: string;
    status: string;
    current_lap: number;
    warmup_laps: number;
    track_name: string | null;
    active_count: number;
    eliminated_count: number;
    participants: Participant[];
    last_eliminated: string | null;
}

function formatTime(ms: number | null): string {
    if (!ms) return '--:--.---';
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

export default function EliminationTV() {
    const { id } = useParams<{ id: string }>();
    const [lastEliminated, setLastEliminated] = useState<string | null>(null);
    const [showEliminationAnimation, setShowEliminationAnimation] = useState(false);
    const wsRef = useRef<WebSocket | null>(null);

    const { data: race, refetch } = useQuery<RaceStatus>({
        queryKey: ['elimination-race', id],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/elimination/${id}/status`);
            return res.data;
        },
        refetchInterval: 2000,
        enabled: !!id
    });

    // WebSocket for real-time updates
    useEffect(() => {
        if (!id) return;

        const wsUrl = API_URL.replace('http', 'ws');
        const ws = new WebSocket(`${wsUrl}/elimination/${id}/ws`);
        wsRef.current = ws;

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.eliminated) {
                setLastEliminated(data.eliminated);
                setShowEliminationAnimation(true);
                setTimeout(() => setShowEliminationAnimation(false), 4000);
            }
            refetch();
        };

        return () => ws.close();
    }, [id, refetch]);

    if (!race) {
        return (
            <div className="min-h-screen bg-gray-950 flex items-center justify-center">
                <div className="animate-pulse text-4xl font-black text-gray-600">CARGANDO...</div>
            </div>
        );
    }

    const activeParticipants = race.participants.filter(p => !p.is_eliminated);
    const eliminatedParticipants = race.participants.filter(p => p.is_eliminated);
    const isWarmup = race.current_lap <= race.warmup_laps;

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-black text-white overflow-hidden relative">
            {/* Elimination Animation Overlay */}
            {showEliminationAnimation && lastEliminated && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-red-900/90 animate-pulse">
                    <div className="text-center">
                        <Skull className="w-32 h-32 mx-auto text-white mb-4 animate-bounce" />
                        <div className="text-6xl font-black uppercase tracking-wider animate-pulse">
                            {lastEliminated}
                        </div>
                        <div className="text-3xl font-bold mt-4 text-red-200">
                            ¡ELIMINADO!
                        </div>
                    </div>
                </div>
            )}

            {/* Winner Animation */}
            {race.status === 'finished' && activeParticipants.length === 1 && (
                <div className="absolute inset-0 z-50 flex items-center justify-center bg-gradient-to-br from-yellow-500 via-amber-500 to-orange-600">
                    <div className="text-center">
                        <Trophy className="w-40 h-40 mx-auto text-white mb-6 animate-bounce" />
                        <div className="text-8xl font-black uppercase tracking-wider text-white drop-shadow-2xl">
                            {activeParticipants[0].driver_name}
                        </div>
                        <div className="text-4xl font-bold mt-6 text-yellow-100">
                            🏆 ¡CAMPEÓN! 🏆
                        </div>
                    </div>
                </div>
            )}

            {/* Header */}
            <div className="bg-gradient-to-r from-red-600 via-orange-500 to-red-600 p-6 shadow-2xl">
                <div className="max-w-7xl mx-auto flex justify-between items-center">
                    <div>
                        <h1 className="text-5xl font-black uppercase tracking-tight flex items-center">
                            <Zap className="mr-4" />
                            {race.name}
                        </h1>
                        <p className="text-xl font-bold text-red-100 mt-1">
                            {race.track_name || 'MODO ELIMINACIÓN'}
                        </p>
                    </div>
                    <div className="text-right">
                        <div className="text-6xl font-black">
                            VUELTA {race.current_lap}
                        </div>
                        {isWarmup ? (
                            <div className="text-2xl font-bold text-yellow-300 flex items-center justify-end mt-2">
                                <Timer className="mr-2" />
                                CALENTAMIENTO ({race.current_lap}/{race.warmup_laps})
                            </div>
                        ) : (
                            <div className="text-2xl font-bold text-red-200 flex items-center justify-end mt-2">
                                <AlertTriangle className="mr-2" />
                                ¡ZONA DE ELIMINACIÓN!
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-7xl mx-auto p-8 grid grid-cols-3 gap-8">
                {/* Active Drivers */}
                <div className="col-span-2">
                    <div className="flex items-center mb-6">
                        <Users className="text-green-400 mr-3" size={32} />
                        <h2 className="text-3xl font-black uppercase text-green-400">
                            En Carrera ({race.active_count})
                        </h2>
                    </div>
                    <div className="space-y-4">
                        {activeParticipants.map((p, index) => (
                            <div
                                key={p.driver_name}
                                className={cn(
                                    "p-6 rounded-2xl border-2 transition-all duration-300",
                                    index === activeParticipants.length - 1 && !isWarmup
                                        ? "bg-red-900/50 border-red-500 animate-pulse"
                                        : index === 0
                                            ? "bg-green-900/30 border-green-500"
                                            : "bg-gray-800/50 border-gray-700"
                                )}
                            >
                                <div className="flex justify-between items-center">
                                    <div className="flex items-center">
                                        <span className={cn(
                                            "text-5xl font-black mr-6 w-16",
                                            index === 0 && "text-green-400"
                                        )}>
                                            {index + 1}
                                        </span>
                                        <div>
                                            <div className="text-3xl font-black uppercase">
                                                {p.driver_name}
                                            </div>
                                            <div className="text-lg text-gray-400">
                                                Vueltas: {p.laps_completed}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        <div className={cn(
                                            "text-4xl font-mono font-bold",
                                            index === activeParticipants.length - 1 && !isWarmup
                                                ? "text-red-400"
                                                : "text-white"
                                        )}>
                                            {formatTime(p.current_lap_time)}
                                        </div>
                                        <div className="text-sm text-gray-500">
                                            Mejor: {formatTime(p.best_lap_time)}
                                        </div>
                                    </div>
                                    {index === activeParticipants.length - 1 && !isWarmup && (
                                        <div className="ml-6 px-4 py-2 bg-red-600 rounded-xl animate-pulse">
                                            <span className="text-xl font-black">⚠️ PELIGRO</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Eliminated Drivers */}
                <div>
                    <div className="flex items-center mb-6">
                        <Skull className="text-red-400 mr-3" size={32} />
                        <h2 className="text-3xl font-black uppercase text-red-400">
                            Eliminados ({race.eliminated_count})
                        </h2>
                    </div>
                    <div className="space-y-3">
                        {eliminatedParticipants.map((p) => (
                            <div
                                key={p.driver_name}
                                className="p-4 rounded-xl bg-gray-900/80 border border-gray-800"
                            >
                                <div className="flex justify-between items-center">
                                    <div>
                                        <div className="text-xl font-bold text-gray-500 line-through">
                                            {p.driver_name}
                                        </div>
                                        <div className="text-sm text-red-400">
                                            Vuelta {p.eliminated_at_lap}
                                        </div>
                                    </div>
                                    <div className="text-2xl font-black text-gray-600">
                                        #{p.final_position}
                                    </div>
                                </div>
                            </div>
                        ))}
                        {eliminatedParticipants.length === 0 && (
                            <div className="text-center py-8 text-gray-600">
                                Nadie eliminado aún...
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Status Bar */}
            <div className="fixed bottom-0 left-0 right-0 bg-gray-900/95 border-t border-gray-800 p-4">
                <div className="max-w-7xl mx-auto flex justify-center items-center space-x-8 text-xl">
                    <span className={cn(
                        "px-6 py-3 rounded-xl font-black uppercase",
                        race.status === 'waiting' && "bg-yellow-600",
                        race.status === 'racing' && "bg-green-600",
                        race.status === 'finished' && "bg-purple-600"
                    )}>
                        {race.status === 'waiting' && '⏳ ESPERANDO'}
                        {race.status === 'racing' && '🏁 EN CARRERA'}
                        {race.status === 'finished' && '🏆 FINALIZADO'}
                    </span>
                </div>
            </div>
        </div>
    );
}
