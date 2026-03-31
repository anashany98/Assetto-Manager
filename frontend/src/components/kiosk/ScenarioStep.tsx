import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ChevronLeft, ChevronRight, Activity } from 'lucide-react';
import { soundManager } from '../../utils/sound';
import { API_URL } from '../../config';
import type { Scenario } from '../../api/scenarios';
import type { KioskSelection, TranslationFunction, Lobby } from './types';

interface ScenarioStepProps {
    t: TranslationFunction;
    scenarios: Scenario[];
    setSelection: (s: KioskSelection | null) => void;
    setStep: (s: number) => void;
    setSelectedScenario: (s: Scenario | null) => void;
    setDuration: (d: number) => void;
}

export const ScenarioStep: React.FC<ScenarioStepProps> = ({
    scenarios, setSelection, setStep, setSelectedScenario, setDuration
}) => {
    const { data: lobbies = [] } = useQuery({
        queryKey: ['lobbies'],
        queryFn: () => axios.get(`${API_URL}/lobby/list?status=active`).then(r => r.data),
        refetchInterval: 5000
    });
    const displayLobbies = Array.isArray(lobbies) ? lobbies : [];
    const SCENARIOS_PER_PAGE = 4;
    const LOBBIES_PER_PAGE = 4;

    const [scenarioPage, setScenarioPage] = useState(0);
    const [lobbyPage, setLobbyPage] = useState(0);

    const scenarioPages = Math.max(1, Math.ceil(scenarios.length / SCENARIOS_PER_PAGE));
    const lobbyPages = Math.max(1, Math.ceil(displayLobbies.length / LOBBIES_PER_PAGE));

    useEffect(() => {
        setScenarioPage((prev) => Math.min(prev, scenarioPages - 1));
    }, [scenarioPages]);

    useEffect(() => {
        setLobbyPage((prev) => Math.min(prev, lobbyPages - 1));
    }, [lobbyPages]);

    const scenarioStart = scenarioPage * SCENARIOS_PER_PAGE;
    const lobbyStart = lobbyPage * LOBBIES_PER_PAGE;

    const quickScenarios = scenarios.slice(scenarioStart, scenarioStart + SCENARIOS_PER_PAGE);
    const visibleLobbies = displayLobbies.slice(lobbyStart, lobbyStart + LOBBIES_PER_PAGE);

    const handleSelect = (scenario: Scenario, time: number) => {
        soundManager.playClick();
        const sessionType = (scenario.session_type as any) || 'practice';

        setSelectedScenario(scenario);
        setSelection({
            type: sessionType,
            scenarioId: scenario.id!,
            track: scenario.allowed_tracks?.[0] || '',
            car: '',
            time: time,
            isLobby: true,
            isHost: true,
            allowedCars: scenario.allowed_cars || [],
        });
        setDuration(time);
        setStep(2);
    };

    const handleJoinLobby = (lobby: Lobby) => {
        if (!lobby?.id || lobby.id <= 0) {
            window.alert('Sala no valida. Recarga la lista de salas en vivo.');
            return;
        }
        const playerCount = lobby.player_count ?? lobby.players_count ?? 0;
        const maxPlayers = lobby.max_players ?? 10;
        if (playerCount >= maxPlayers) {
            window.alert('La sala está llena. Por favor elige otra.');
            return;
        }
        soundManager.playClick();
        const duration = Number(lobby?.duration_minutes ?? lobby?.duration) || 10;
        const allowedCars: string[] = Array.isArray(lobby.allowed_cars) && lobby.allowed_cars.length > 0
            ? lobby.allowed_cars
            : (lobby.car ? [lobby.car] : []);
        setSelection({
            type: 'race',
            track: lobby.track || '',
            car: '',
            isLobby: true,
            isHost: false,
            lobbyId: lobby.id,
            time: duration,
            allowedCars,
        });
        setDuration(duration);
        setStep(2);
    };

    const getDurationLabel = (scenario: Scenario) => {
        const durations = scenario.allowed_durations?.slice(0, 3);
        if (!durations || durations.length === 0) return '10/15 min';
        return `${durations.join('/')} min`;
    };

    return (
        <div className="h-full min-h-0 flex flex-col px-3 md:px-5 py-2 md:py-3 animate-in fade-in duration-500 overflow-hidden">
            <h2 className="text-xl md:text-3xl font-racing uppercase tracking-[0.15em] text-amber-200 text-center mb-1">
                SELECCIONA TU EXPERIENCIA
            </h2>
            <p className="text-center text-xs md:text-sm text-slate-400 mb-3 md:mb-4">
                Elige un evento rapido o entra en una sala en vivo.
            </p>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3 md:gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 min-h-0">
                    <div className="sm:col-span-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-slate-950/50 px-3 py-2">
                        <div className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-300">
                            Eventos {scenarioPage + 1}/{scenarioPages}
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                type="button"
                                onClick={() => {
                                    if (scenarioPage <= 0) return;
                                    soundManager.playClick();
                                    setScenarioPage((prev) => Math.max(0, prev - 1));
                                }}
                                disabled={scenarioPage <= 0}
                                className="h-10 md:h-11 px-3 md:px-4 rounded-xl border border-white/15 bg-slate-900/70 text-slate-100 font-black text-xs md:text-sm uppercase tracking-wider disabled:opacity35 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center gap-2"
                            >
                                <ChevronLeft size={16} />
                                Anterior
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    if (scenarioPage >= scenarioPages - 1) return;
                                    soundManager.playClick();
                                    setScenarioPage((prev) => Math.min(scenarioPages - 1, prev + 1));
                                }}
                                disabled={scenarioPage >= scenarioPages - 1}
                                className="h-10 md:h-11 px-3 md:px-4 rounded-xl border border-amber-300/35 bg-amber-500/20 text-amber-100 font-black text-xs md:text-sm uppercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center gap-2"
                            >
                                Siguiente
                                <ChevronRight size={16} />
                            </button>
                        </div>
                    </div>

                    {quickScenarios.map((scenario) => {
                        const preferredDuration = scenario.allowed_durations?.[0] || 10;
                        return (
                            <button
                                key={scenario.id}
                                onMouseEnter={() => soundManager.playHover()}
                                onClick={() => handleSelect(scenario, preferredDuration)}
                                className="text-left rounded-3xl border border-white/10 bg-slate-950/65 hover:bg-slate-900/70 hover:border-amber-300/50 p-3 md:p-4 transition-all flex flex-col justify-between min-h-[170px] md:min-h-[190px]"
                            >
                                <div>
                                    <div className="flex items-center justify-between gap-2 mb-2">
                                        <span className="text-[10px] uppercase tracking-widest text-amber-200 font-black">
                                            {getDurationLabel(scenario)}
                                        </span>
                                        <ChevronRight size={18} className="text-amber-300" />
                                    </div>
                                    <h3 className="text-lg md:text-xl font-black text-white uppercase leading-tight line-clamp-2">
                                        {scenario.name}
                                    </h3>
                                    <p className="text-xs md:text-sm text-slate-400 mt-2 line-clamp-3">
                                        {scenario.description || 'Competicion estandar de alto ritmo.'}
                                    </p>
                                </div>
                                <div className="mt-3 flex gap-2">
                                    {(scenario.allowed_durations?.length ? scenario.allowed_durations : [10, 15]).slice(0, 2).map((mins: number) => (
                                        <span key={mins} className="inline-flex items-center rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-slate-300 font-bold">
                                            {mins} min
                                        </span>
                                    ))}
                                </div>
                            </button>
                        );
                    })}

                    {quickScenarios.length === 0 && (
                        <div className="sm:col-span-2 rounded-3xl border border-white/10 bg-slate-950/60 p-6 text-center text-slate-400">
                            No hay eventos configurados todavia.
                        </div>
                    )}

                </div>

                <div className="rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/20 to-slate-950/70 p-3 md:p-4 flex flex-col min-h-0">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h3 className="text-sm md:text-lg font-black text-white flex items-center gap-2 uppercase tracking-widest">
                            <Activity className="text-emerald-400" size={16} />
                            SALAS EN VIVO
                        </h3>
                        <div className="text-[11px] md:text-xs font-black uppercase tracking-[0.2em] text-slate-300">
                            {lobbyPage + 1}/{lobbyPages}
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                        <button
                            type="button"
                            onClick={() => {
                                if (lobbyPage <= 0) return;
                                soundManager.playClick();
                                setLobbyPage((prev) => Math.max(0, prev - 1));
                            }}
                            disabled={lobbyPage <= 0}
                            className="h-10 rounded-xl border border-white/15 bg-slate-900/70 text-slate-100 font-black text-[11px] md:text-xs uppercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            <ChevronLeft size={15} />
                            Anterior
                        </button>
                        <button
                            type="button"
                            onClick={() => {
                                if (lobbyPage >= lobbyPages - 1) return;
                                soundManager.playClick();
                                setLobbyPage((prev) => Math.min(lobbyPages - 1, prev + 1));
                            }}
                            disabled={lobbyPage >= lobbyPages - 1}
                            className="h-10 rounded-xl border border-amber-300/35 bg-amber-500/20 text-amber-100 font-black text-[11px] md:text-xs uppercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                            Siguiente
                            <ChevronRight size={15} />
                        </button>
                    </div>
                    <div className="space-y-2.5">
                        {visibleLobbies.length > 0 ? visibleLobbies.map((lobby: Lobby) => {
                            return (
                                <button
                                    key={lobby.id}
                                    onMouseEnter={() => soundManager.playHover()}
                                    onClick={() => handleJoinLobby(lobby)}
                                    className="w-full text-left rounded-xl border border-white/10 bg-black/35 hover:bg-black/55 hover:border-amber-300/50 p-3 transition-all"
                                >
                                    <div className="flex items-center justify-between gap-2 mb-1">
                                        <span className="text-xs md:text-sm font-black text-white line-clamp-1">
                                            {lobby.name}
                                        </span>
                                        <span className="text-[10px] text-amber-300 font-mono">{lobby.player_count ?? lobby.players_count ?? 0}/{lobby.max_players ?? 10}</span>
                                    </div>
                                    <div className="text-xs text-slate-400 line-clamp-1">{lobby.track}</div>
                                    {Array.isArray(lobby.allowed_cars) && lobby.allowed_cars.length > 0 ? (
                                        <div className="flex flex-wrap items-center gap-1 mt-1.5">
                                            <span className="text-[9px] uppercase tracking-widest text-slate-600 mr-0.5">Coches:</span>
                                            {lobby.allowed_cars.slice(0, 3).map((carId: string) => (
                                                <span
                                                    key={carId}
                                                    className="text-[9px] bg-amber-500/15 border border-amber-500/25 text-amber-300/80 px-1.5 py-0.5 rounded font-mono capitalize leading-none"
                                                >
                                                    {carId.replace(/^[a-z0-9]+_/, '').replace(/_/g, ' ')}
                                                </span>
                                            ))}
                                            {lobby.allowed_cars.length > 3 && (
                                                <span className="text-[9px] text-slate-600">+{lobby.allowed_cars.length - 3} más</span>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">{lobby.car}</div>
                                    )}
                                </button>
                            );
                        }) : (
                            <div className="rounded-xl border border-white/10 bg-black/25 p-4 text-sm text-slate-400">
                                No hay salas activas ahora mismo.
                            </div>
                        )}
                    </div>
                    <div className="mt-auto pt-3 text-[11px] text-slate-500">
                        Flujo optimizado para tablet 10". Sin scroll y botones grandes.
                    </div>
                </div>
            </div>
        </div>
    );
};
