import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import {
    Zap, Plus, Play, Users, Trash2, MonitorPlay,
    UserPlus, Trophy, AlertTriangle, ExternalLink
} from 'lucide-react';

interface Race {
    id: number;
    name: string;
    status: string;
    current_lap: number;
}

export default function EliminationAdmin() {
    const queryClient = useQueryClient();
    const [newRaceName, setNewRaceName] = useState('');
    const [newTrack, setNewTrack] = useState('');
    const [warmupLaps, setWarmupLaps] = useState(1);
    const [selectedRace, setSelectedRace] = useState<number | null>(null);
    const [newDriver, setNewDriver] = useState('');

    // Fetch races
    const { data: races } = useQuery<Race[]>({
        queryKey: ['elimination-races'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/elimination/list`);
            return res.data;
        }
    });

    // Create race mutation
    const createRace = useMutation({
        mutationFn: async () => {
            await axios.post(`${API_URL}/elimination/create`, {
                name: newRaceName,
                track_name: newTrack || null,
                warmup_laps: warmupLaps
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['elimination-races'] });
            setNewRaceName('');
            setNewTrack('');
        }
    });

    // Register driver
    const registerDriver = useMutation({
        mutationFn: async () => {
            if (!selectedRace) return;
            await axios.post(`${API_URL}/elimination/${selectedRace}/register`, {
                driver_name: newDriver
            });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['elimination-races'] });
            setNewDriver('');
        }
    });

    // Start race
    const startRace = useMutation({
        mutationFn: async (raceId: number) => {
            await axios.post(`${API_URL}/elimination/${raceId}/start`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['elimination-races'] });
        }
    });

    // Delete race
    const deleteRace = useMutation({
        mutationFn: async (raceId: number) => {
            await axios.delete(`${API_URL}/elimination/${raceId}`);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['elimination-races'] });
            setSelectedRace(null);
        }
    });

    return (
        <div className="min-h-screen bg-gray-950 text-white p-8">
            <div className="max-w-6xl mx-auto">
                {/* Header */}
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h1 className="text-4xl font-black uppercase flex items-center">
                            <Zap className="mr-3 text-orange-500" />
                            Modo Eliminación
                        </h1>
                        <p className="text-gray-400 mt-1">Crea y gestiona carreras por eliminación</p>
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-8">
                    {/* Create Race */}
                    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                        <h2 className="text-xl font-black uppercase mb-6 flex items-center">
                            <Plus className="mr-2 text-green-400" />
                            Nueva Carrera
                        </h2>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Nombre del Evento</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white font-bold"
                                    placeholder="Ej: Torneo Viernes Noche"
                                    value={newRaceName}
                                    onChange={e => setNewRaceName(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">Circuito (opcional)</label>
                                <input
                                    type="text"
                                    className="w-full px-4 py-3 rounded-xl bg-gray-800 border border-gray-700 text-white"
                                    placeholder="Ej: Monza, Spa..."
                                    value={newTrack}
                                    onChange={e => setNewTrack(e.target.value)}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-bold text-gray-500 uppercase mb-2">
                                    Vueltas de Calentamiento
                                </label>
                                <div className="flex items-center space-x-4">
                                    <input
                                        type="range"
                                        min="1"
                                        max="3"
                                        className="flex-1 accent-orange-500"
                                        value={warmupLaps}
                                        onChange={e => setWarmupLaps(Number(e.target.value))}
                                    />
                                    <span className="text-2xl font-black text-orange-400 w-12 text-center">{warmupLaps}</span>
                                </div>
                                <p className="text-xs text-gray-500 mt-1">
                                    Las eliminaciones empiezan después de la vuelta {warmupLaps}
                                </p>
                            </div>
                            <button
                                onClick={() => createRace.mutate()}
                                disabled={!newRaceName}
                                className={cn(
                                    "w-full py-4 rounded-xl font-black uppercase transition-all",
                                    newRaceName
                                        ? "bg-gradient-to-r from-orange-500 to-red-500 hover:from-orange-400 hover:to-red-400"
                                        : "bg-gray-800 text-gray-600 cursor-not-allowed"
                                )}
                            >
                                Crear Carrera
                            </button>
                        </div>
                    </div>

                    {/* Race List */}
                    <div className="bg-gray-900 rounded-2xl p-6 border border-gray-800">
                        <h2 className="text-xl font-black uppercase mb-6 flex items-center">
                            <Trophy className="mr-2 text-yellow-400" />
                            Carreras Activas
                        </h2>

                        <div className="space-y-3 max-h-[400px] overflow-y-auto">
                            {races?.map(race => (
                                <div
                                    key={race.id}
                                    onClick={() => setSelectedRace(race.id)}
                                    className={cn(
                                        "p-4 rounded-xl border-2 cursor-pointer transition-all",
                                        selectedRace === race.id
                                            ? "bg-orange-900/30 border-orange-500"
                                            : "bg-gray-800 border-gray-700 hover:border-gray-600"
                                    )}
                                >
                                    <div className="flex justify-between items-center">
                                        <div>
                                            <div className="font-black text-lg uppercase">{race.name}</div>
                                            <div className="text-sm text-gray-400">Vuelta {race.current_lap}</div>
                                        </div>
                                        <div className="flex items-center space-x-2">
                                            <span className={cn(
                                                "px-3 py-1 rounded-full text-xs font-bold uppercase",
                                                race.status === 'waiting' && "bg-yellow-600",
                                                race.status === 'racing' && "bg-green-600",
                                                race.status === 'finished' && "bg-purple-600"
                                            )}>
                                                {race.status}
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            {(!races || races.length === 0) && (
                                <div className="text-center py-8 text-gray-600">
                                    No hay carreras creadas
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Selected Race Actions */}
                {selectedRace && (
                    <div className="mt-8 bg-gray-900 rounded-2xl p-6 border border-gray-800">
                        <h2 className="text-xl font-black uppercase mb-6 flex items-center">
                            <Users className="mr-2 text-blue-400" />
                            Gestionar Carrera #{selectedRace}
                        </h2>

                        <div className="grid grid-cols-3 gap-6">
                            {/* Register Driver */}
                            <div className="bg-gray-800 p-4 rounded-xl">
                                <h3 className="font-bold mb-3 flex items-center">
                                    <UserPlus className="mr-2" size={18} />
                                    Registrar Piloto
                                </h3>
                                <div className="flex space-x-2">
                                    <input
                                        type="text"
                                        className="flex-1 px-3 py-2 rounded-lg bg-gray-700 text-white"
                                        placeholder="Nombre del piloto"
                                        value={newDriver}
                                        onChange={e => setNewDriver(e.target.value)}
                                    />
                                    <button
                                        onClick={() => registerDriver.mutate()}
                                        disabled={!newDriver}
                                        className="px-4 py-2 bg-blue-600 rounded-lg font-bold hover:bg-blue-500 disabled:opacity-50"
                                    >
                                        Añadir
                                    </button>
                                </div>
                            </div>

                            {/* Start Race */}
                            <div className="bg-gray-800 p-4 rounded-xl">
                                <h3 className="font-bold mb-3 flex items-center">
                                    <Play className="mr-2" size={18} />
                                    Control
                                </h3>
                                <button
                                    onClick={() => startRace.mutate(selectedRace)}
                                    className="w-full py-3 bg-green-600 rounded-lg font-black uppercase hover:bg-green-500"
                                >
                                    🏁 Iniciar Carrera
                                </button>
                            </div>

                            {/* Actions */}
                            <div className="bg-gray-800 p-4 rounded-xl">
                                <h3 className="font-bold mb-3 flex items-center">
                                    <AlertTriangle className="mr-2" size={18} />
                                    Acciones
                                </h3>
                                <div className="flex space-x-2">
                                    <a
                                        href={`/elimination-tv/${selectedRace}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex-1 py-3 bg-purple-600 rounded-lg font-bold text-center hover:bg-purple-500 flex items-center justify-center"
                                    >
                                        <MonitorPlay className="mr-2" size={18} />
                                        TV
                                        <ExternalLink className="ml-1" size={14} />
                                    </a>
                                    <button
                                        onClick={() => deleteRace.mutate(selectedRace)}
                                        className="px-4 py-3 bg-red-600 rounded-lg hover:bg-red-500"
                                    >
                                        <Trash2 size={18} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
