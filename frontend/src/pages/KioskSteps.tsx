
import React, { useState, useEffect, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';

import axios from 'axios';
import { soundManager } from '../utils/sound';
import {
    ChevronLeft, ChevronRight, Trophy,
    Sun, Sunset, Cloud, CloudRain,
    Activity, ShieldCheck, Clock, Play, LogOut,
    Zap, TrendingUp, Gauge, CloudFog
} from 'lucide-react';
import { QRCodeCanvas } from 'qrcode.react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';
import { API_URL } from '../config';
import { cn } from '../lib/utils';
import type { Scenario } from '../api/scenarios';
import { getPaymentStatus, createPaymentCheckout } from '../api/payments';
import type { PaymentProvider, PaymentStatus } from '../api/payments';
import { startSession } from '../api/sessions';
import IdleVideoBackground from '../components/IdleVideoBackground';

// Wallpaper Background removed for Tablet Kiosk (now on StationDisplay)

// --- SHARED TYPES ---
export interface KioskSelection {
    car: string;
    track: string;
    isHost?: boolean;
    type?: 'practice' | 'qualify' | 'race' | 'drift' | 'hotlap' | 'trackday' | 'traffic' | 'overtake';
    aiCount?: number;
    tyreCompound?: string;
    lobbyId?: number;
    isLobby?: boolean;
    scenarioId?: number;
    time?: number;
    allowedCars?: string[];  // Cars allowed in this lobby/scenario
}

// --- ATTRACT MODE ---
// --- ATTRACT MODE ---
interface AttractModeProps {
    isIdle: boolean;
    scenarios: Scenario[];
    t: any;
    onUnpair?: () => void;
}

export const AttractMode: React.FC<AttractModeProps> = ({ isIdle, scenarios, t, onUnpair }) => {
    if (!isIdle) return null;
    const tx = (key: string, fallback: string) => {
        const value = t?.(key);
        return !value || value === key ? fallback : value;
    };

    return (
        <div
            onClick={() => soundManager.playConfirm()}
            className="fixed inset-0 z-50 bg-slate-950 text-white overflow-hidden animate-in fade-in duration-700 cursor-pointer"
        >
            <div className="absolute inset-0 bg-[radial-gradient(1200px_circle_at_10%_0%,rgba(251,191,36,0.18),transparent_60%),radial-gradient(800px_circle_at_90%_20%,rgba(20,184,166,0.18),transparent_55%)]" />
            <div className="absolute inset-0 bg-[linear-gradient(120deg,rgba(2,6,23,0.95),rgba(15,23,42,0.9),rgba(2,6,23,0.95))]" />
            <div className="absolute inset-0 opacity-30">
                <IdleVideoBackground className="w-full h-full object-cover" />
            </div>
            <div className="absolute inset-0 bg-[linear-gradient(0deg,rgba(2,6,23,0.9),transparent_45%)]" />

            {/* UNPAIR BUTTON (Hidden/Discreet) */}
            <div
                onClick={(e) => {
                    e.stopPropagation();
                    onUnpair?.();
                }}
                className="absolute top-0 left-0 p-4 md:p-8 z-50 opacity-0 active:opacity-100"
            >
                <div className="text-white text-xs bg-red-600 px-2 py-1 rounded">Desvincular</div>
            </div>

            <div className="absolute top-4 md:top-8 right-4 md:right-8 z-20 pointer-events-none">
                <img
                    src="/logo.png"
                    alt="Logo Bar"
                    className="w-28 md:w-44 h-auto drop-shadow-2xl opacity-90"
                />
            </div>
            <div className="relative z-10 h-full w-full p-4 md:p-16 grid grid-cols-1 lg:grid-cols-[1.2fr_1fr_1.1fr] gap-4 md:gap-8">
                <div className="flex flex-col justify-between">
                    <div className="space-y-6">
                        <div className="inline-flex items-center gap-3">
                            <div className="w-12 h-12 rounded-2xl bg-amber-400 text-black font-black flex items-center justify-center">AC</div>
                            <div className="text-xs uppercase tracking-[0.5em] text-amber-200/80">SIM STUDIO</div>
                        </div>
                        <div>
                            <h1 className="text-4xl md:text-8xl font-racing uppercase italic tracking-tight text-white drop-shadow-[0_10px_40px_rgba(0,0,0,0.45)]">
                                DRIVE LAB
                            </h1>
                            <p className="text-lg md:text-xl text-slate-300 max-w-md mt-3">
                                Ajusta tu setup, elige tu reto y entra a pista en segundos.
                            </p>
                        </div>
                        <div className="inline-flex items-center gap-3 rounded-full bg-white/10 px-6 py-3 border border-white/20 backdrop-blur">
                            <span className="text-xs uppercase tracking-[0.35em] text-amber-200">{t('kiosk.touchToStart') || 'TOCA PARA EMPEZAR'}</span>
                            <div className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
                        </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-xs text-slate-300 mt-8">
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-amber-200 uppercase tracking-widest text-[10px]">Sesion</div>
                            <div className="text-2xl font-mono font-bold text-white">LIVE</div>
                        </div>
                        <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                            <div className="text-emerald-200 uppercase tracking-widest text-[10px]">Control</div>
                            <div className="text-2xl font-mono font-bold text-white">OK</div>
                        </div>
                    </div>
                </div>

                <div className="rounded-[28px] border border-white/10 bg-white/5 backdrop-blur-md p-6 flex flex-col">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg uppercase tracking-[0.35em] text-slate-200">Eventos Rapidos</h2>
                        <span className="text-xs text-amber-200 uppercase">Hoy</span>
                    </div>
                    <div className="space-y-4">
                        {scenarios.slice(0, 3).map(sc => (
                            <div key={sc.id} className="rounded-2xl border border-white/10 bg-slate-950/40 p-4 flex items-center justify-between">
                                <div>
                                    <div className="text-white font-bold uppercase tracking-tight">{sc.name}</div>
                                    <div className="text-[11px] text-slate-400 mt-1">Duracion {sc.allowed_durations?.[0] || 10} min</div>
                                </div>
                                <div className="w-10 h-10 rounded-full bg-amber-400 text-black flex items-center justify-center">
                                    <ChevronRight size={18} />
                                </div>
                            </div>
                        ))}
                        {scenarios.length === 0 && (
                            <div className="text-sm text-slate-400">Sin eventos disponibles.</div>
                        )}
                    </div>
                </div>

                <div className="flex flex-col justify-between">
                    <div className="rounded-[32px] border border-amber-400/30 bg-gradient-to-b from-amber-300/10 via-slate-950/60 to-slate-950/90 p-5 md:p-8 shadow-[0_30px_80px_rgba(0,0,0,0.45)]">
                        <div className="text-amber-300 uppercase tracking-[0.35em] text-xs">{tx('attract.sessionRecord', 'RECORD')}</div>
                        <div className="text-4xl md:text-7xl font-mono font-black text-white tabular-nums mt-4">1:44.210</div>
                        <div className="text-xs text-slate-400 uppercase tracking-widest mt-3">{tx('attract.localRecord', 'LOCAL')}</div>
                        <div className="text-xs text-amber-200 uppercase tracking-wide mt-2">{tx('attract.anyCarAnyTrack', 'ANY CAR / ANY TRACK')}</div>
                    </div>
                    <div className="text-right text-sm text-slate-300 mt-6">
                        <div className="text-amber-200 uppercase tracking-[0.3em] text-xs">{tx('attract.canYouBeatIt', 'CAN YOU BEAT IT?')}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- SCENARIO STEP ---
interface ScenarioStepProps {
    t: any;
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

    const handleJoinLobby = (lobby: any) => {
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
        setStep(2); // Go to car selection first
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
                                className="h-10 md:h-11 px-3 md:px-4 rounded-xl border border-white/15 bg-slate-900/70 text-slate-100 font-black text-xs md:text-sm uppercase tracking-wider disabled:opacity-35 disabled:cursor-not-allowed active:scale-[0.98] transition-all flex items-center gap-2"
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
                        {visibleLobbies.length > 0 ? visibleLobbies.map((lobby: any) => {
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

// --- DIFFICULTY STEP ---
interface DifficultyStepProps {
    t: any;
    selection: KioskSelection | null;
    selectedCarObj: any;
    selectedTrackObj: any;
    leaderboard: any[];
    timeOfDay: string;
    setTimeOfDay: (t: any) => void;
    weather: string;
    setWeather: (w: any) => void;
    transmission: string;
    setTransmission: (t: any) => void;
    difficulty: string;
    setDifficulty: (d: any) => void;
    setSelection: (s: any) => void;
    duration: number;
    paymentEnabled: boolean;
    setStep: (s: number) => void;
    setPaymentInfo: (p: any) => void;
    setPaymentError: (e: any) => void;
    launchWithoutPayment: () => void;
    launchingNoPayment: boolean;
    paymentNote: string;
    paymentHandledRef: React.MutableRefObject<boolean>;
    noPaymentHandledRef: React.MutableRefObject<boolean>;
    resolveAssetUrl: (url?: string) => string | null;
    rainEnabled?: boolean;
}

export const DifficultyStep: React.FC<DifficultyStepProps> = ({
    t, selection, selectedCarObj, selectedTrackObj,
    timeOfDay, setTimeOfDay, weather, setWeather, transmission, setTransmission,
    difficulty, setDifficulty,
    paymentEnabled, setStep,
    setPaymentInfo, setPaymentError, launchWithoutPayment,
    launchingNoPayment, paymentNote, paymentHandledRef, noPaymentHandledRef, resolveAssetUrl,
    rainEnabled = false
}) => {

    const specs = selectedCarObj?.specs?.bhp ? selectedCarObj.specs : null;
    const carImageUrl = resolveAssetUrl(selectedCarObj?.image_url);
    const trackImageUrl = resolveAssetUrl(selectedTrackObj?.image_url);
    const mapUrl = resolveAssetUrl(selectedTrackObj?.map_url)
        || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png";

    return (
        <div className="h-full w-full min-h-0 flex flex-col animate-in zoom-in duration-300 max-w-6xl mx-auto px-3 md:px-5 py-2 md:py-3 overflow-y-auto pb-6 md:pb-8">
            <h2 className="text-3xl md:text-5xl font-racing uppercase tracking-[0.18em] text-amber-200 mb-4 md:mb-5 text-center shrink-0">
                CONFIGURA TU SESION
            </h2>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 text-left">
                <div className="bg-slate-950/65 border border-white/10 rounded-3xl p-4 md:p-5 flex flex-col relative overflow-hidden group min-h-[170px] md:min-h-[200px]">
                    <h4 className="text-slate-400 font-bold text-xs md:text-sm tracking-widest uppercase mb-2">VEHICULO</h4>
                    {carImageUrl && <img src={carImageUrl} className="w-full h-24 md:h-28 object-cover rounded-2xl mb-3 border border-gray-700/60" alt="" />}
                    <div className="text-xl md:text-2xl font-black text-white mb-3 truncate">{selectedCarObj?.name || selection?.car}</div>
                    {specs && (
                        <div className="grid grid-cols-3 gap-2.5 mt-auto">
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">{t('kiosk.power') !== 'kiosk.power' ? t('kiosk.power') : 'POTENCIA'}</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.bhp}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">Peso</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.weight}</div>
                            </div>
                            <div className="bg-black/30 rounded-xl p-2.5 md:p-3.5 text-center">
                                <div className="text-gray-500 text-[9px] md:text-[11px] uppercase">{t('kiosk.topSpeed') !== 'kiosk.topSpeed' ? t('kiosk.topSpeed') : 'VELOCIDAD MAX'}</div>
                                <div className="text-white font-black text-sm md:text-base">{specs.top_speed}</div>
                            </div>
                        </div>
                    )}
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-3xl p-4 md:p-5 flex flex-col relative overflow-hidden min-h-[170px] md:min-h-[200px]">
                    <h4 className="text-slate-400 font-bold text-xs md:text-sm tracking-widest uppercase mb-1">CIRCUITO</h4>
                    <div className="text-xl md:text-2xl font-black text-white mb-3 truncate">{selectedTrackObj?.name || selection?.track}</div>
                    {trackImageUrl && <img src={trackImageUrl} className="w-full h-24 md:h-28 object-cover rounded-2xl mb-3 border border-gray-700/60" alt="" />}
                    <div className="flex-1 flex items-center justify-center">
                        <img src={mapUrl} className="h-16 md:h-24 w-auto object-contain brightness-200 filter invert" alt="" />
                    </div>
                </div>
            </div>

            <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-4 text-left items-start">
                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">CONDICIONES</p>
                    <div className="grid grid-cols-2 gap-2.5 mb-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTimeOfDay('noon'); }}
                            className={`p-3 rounded-xl min-h-[52px] flex items-center justify-center gap-2 transition-all text-sm font-bold ${timeOfDay === 'noon' ? 'bg-amber-400 text-black shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'} `}
                        >
                            <Sun size={16} /> {t('weather.noon') !== 'weather.noon' ? t('weather.noon') : 'MEDIODIA'}
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTimeOfDay('evening'); }}
                            className={`p-3 rounded-xl min-h-[52px] flex items-center justify-center gap-2 transition-all text-sm font-bold ${timeOfDay === 'evening' ? 'bg-orange-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-300'} `}
                        >
                            <Sunset size={16} /> {t('weather.sunset') !== 'weather.sunset' ? t('weather.sunset') : 'OCASO'}
                        </button>
                    </div>
                    <div className="grid grid-cols-3 gap-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('sun'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'sun' ? 'bg-amber-400 text-black shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <Sun size={16} /> <span className="text-[11px] font-bold">{t('weather.clear') !== 'weather.clear' ? t('weather.clear') : 'DESPEJADO'}</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('cloud'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'cloud' ? 'bg-gray-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <Cloud size={16} /> <span className="text-[11px] font-bold">{t('weather.cloudy') !== 'weather.cloudy' ? t('weather.cloudy') : 'NUBLADO'}</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setWeather('fog'); }}
                            className={`p-2.5 md:p-3 rounded-xl min-h-[68px] flex flex-col items-center justify-center gap-1.5 transition-all ${weather === 'fog' ? 'bg-gray-400 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                        >
                            <CloudFog size={16} /> <span className="text-[11px] font-bold">{t('weather.fog') !== 'weather.fog' ? t('weather.fog') : 'NIEBLA'}</span>
                        </button>
                        {rainEnabled && (
                            <button
                                onMouseEnter={() => soundManager.playHover()}
                                onClick={() => { soundManager.playClick(); setWeather('rain'); }}
                                className={`p-2.5 md:p-3 rounded-xl min-h-[58px] flex flex-col items-center justify-center gap-1 transition-all col-span-3 ${weather === 'rain' ? 'bg-red-500 text-white shadow-lg' : 'bg-slate-900/60 hover:bg-slate-800 text-slate-400'} `}
                            >
                                <CloudRain size={16} /> <span className="text-[11px] font-bold">{t('weather.rain') !== 'weather.rain' ? t('weather.rain') : 'LLUVIA'}</span>
                            </button>
                        )}
                    </div>
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">TRANSMISION</p>
                    <div className="grid grid-cols-2 gap-2.5">
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTransmission('automatic'); }}
                            className={`p-4 rounded-xl min-h-[96px] border-2 flex flex-col items-center justify-center gap-2 transition-all ${transmission === 'automatic' ? 'border-amber-300 bg-amber-400 text-black' : 'border-white/10 bg-slate-900/60 text-slate-300'} `}
                        >
                            <Gauge className="w-5 h-5" />
                            <span className="font-black text-sm uppercase">AUTOMATICO</span>
                        </button>
                        <button
                            onMouseEnter={() => soundManager.playHover()}
                            onClick={() => { soundManager.playClick(); setTransmission('manual'); }}
                            className={`p-4 rounded-xl min-h-[96px] border-2 flex flex-col items-center justify-center gap-2 transition-all ${transmission === 'manual' ? 'border-amber-300 bg-amber-400 text-black' : 'border-white/10 bg-slate-900/60 text-slate-300'} `}
                        >
                            <Zap className="w-5 h-5" />
                            <span className="font-black text-sm uppercase">MANUAL</span>
                        </button>
                    </div>
                    <p className="text-sm text-slate-500 mt-3">
                        {transmission === 'manual' ? 'Cambios por levas/palanca.' : 'Cambios automaticos activados.'}
                    </p>
                </div>

                <div className="bg-slate-950/65 border border-white/10 rounded-2xl p-4 min-h-[210px] md:min-h-[245px]">
                    <p className="text-slate-400 font-bold mb-3 uppercase text-xs tracking-widest">AYUDAS</p>
                    <div className="grid grid-cols-3 gap-2.5">
                        {['novice', 'amateur', 'pro'].map(lv => (
                            <button
                                key={lv}
                                onMouseEnter={() => soundManager.playHover()}
                                onClick={() => { soundManager.playClick(); setDifficulty(lv as any); }}
                                className={`p-3.5 min-h-[96px] rounded-xl border-2 flex flex-col items-center justify-center gap-2 transition-all ${difficulty === lv ? 'border-red-400 bg-red-500/10 text-white' : 'border-gray-700 bg-gray-800/50 text-slate-300'} `}
                            >
                                {lv === 'novice' ? <ShieldCheck className="w-5 h-5" /> : lv === 'amateur' ? <Activity className="w-5 h-5" /> : <Trophy className="w-5 h-5" />}
                                <span className="font-black text-xs uppercase">{lv}</span>
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            <div className="w-full pt-4 md:pt-5">
                <button
                    onClick={() => {
                        soundManager.playClick();
                        paymentHandledRef.current = false;
                        noPaymentHandledRef.current = false;
                        setPaymentInfo(null);
                        setPaymentError(null);
                        if (paymentEnabled) setStep(5);
                        else launchWithoutPayment();
                    }}
                    disabled={launchingNoPayment}
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-xl md:text-3xl py-4 md:py-5 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3 disabled:opacity-50 touch-manipulation"
                >
                    {paymentEnabled ? t('kiosk.payAndLaunch') : 'LANZAR'} <Play fill="currentColor" size={24} />
                </button>
                <p className="text-center text-gray-500 mt-2.5 text-xs md:text-sm">{paymentNote}</p>
            </div>
        </div>
    );
};


// --- PAYMENT STEP ---
interface PaymentStepProps {
    t: any;
    stationId: number;
    duration: number;
    driver: { id: number, name: string } | null;
    selection: KioskSelection | null;
    setSelection: (s: any) => void;
    paymentProvider: PaymentProvider;
    setPaymentProvider: (p: PaymentProvider) => void;
    paymentInfo: any;
    setPaymentInfo: (p: any) => void;
    paymentError: string | null;
    setPaymentError: (e: string | null) => void;
    clientTokenHeaders: Record<string, string>;
    sessionPrice: number;
    paymentHandledRef: React.MutableRefObject<boolean>;
    setStep: (s: number) => void;
    launchSessionMutation: any;
    buildLaunchPayload: () => any;
}

export const PaymentStep: React.FC<PaymentStepProps> = ({
    t, stationId, duration, driver, selection, setSelection, paymentProvider, setPaymentProvider,
    paymentInfo, setPaymentInfo, paymentError, setPaymentError,
    clientTokenHeaders, sessionPrice, paymentHandledRef, setStep,
    launchSessionMutation, buildLaunchPayload
}) => {
    const [isPaidAccessRunning, setIsPaidAccessRunning] = useState(false);
    const paidAccessInFlightRef = useRef(false);
    const resolveApiError = (error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const detail = (error.response?.data as any)?.detail;
            if (typeof detail === 'string' && detail.trim()) return detail;
        }
        return fallback;
    };

    const createCheckout = useMutation({
        mutationFn: async (provider: PaymentProvider) => {
            return createPaymentCheckout({
                provider,
                station_id: stationId,
                duration_minutes: duration,
                driver_name: driver?.name,
                scenario_id: selection?.scenarioId,
                is_vr: false
            }, clientTokenHeaders);
        },
        onSuccess: (data) => {
            setPaymentInfo(data);
            setPaymentError(null);
        },
        onError: () => setPaymentError('No se pudo iniciar el pago. Revisa la configuracion.')
    });

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.post(`${API_URL}/lobby/create`, {
                station_id: stationId,
                driver_name: driver?.name || undefined,
                name: `GRUPO DE ${driver?.name?.toUpperCase() || 'INVITADO'} `,
                track: selection?.track,
                car: selection?.car,
                duration: duration,
                max_players: 10
            }, { headers: clientTokenHeaders });
            return res.data;
        },
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
        onSuccess: (data) => {
            const lobbyId = Number(data?.id ?? data?.lobby_id);
            setSelection((prev: any) => ({ ...prev, lobbyId: Number.isFinite(lobbyId) ? lobbyId : prev?.lobbyId }));
            setPaymentError(null);
            setStep(6);
        },
        onError: (err) => {
            console.error("Failed to create lobby:", err);
            setPaymentError(resolveApiError(err, 'No se pudo crear la sala multijugador.'));
        }
    });

    const joinLobbyMutation = useMutation({
        mutationFn: async () => {
            await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/join`, {
                station_id: stationId,
                driver_name: driver?.name || undefined
            }, { headers: clientTokenHeaders });
        },
        retry: 2,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 4000),
        onSuccess: () => {
            setPaymentError(null);
            setStep(6);
        },
        onError: (err) => {
            console.error("Failed to join lobby:", err);
            setPaymentError(resolveApiError(err, 'No se pudo acceder a la sala multijugador.'));
        }
    });

    useEffect(() => {
        createCheckout.mutate(paymentProvider);
    }, [paymentProvider, stationId, duration, driver?.name, selection?.scenarioId]);

    const { data: paymentStatus } = useQuery({
        queryKey: ['payment-status', paymentInfo?.id],
        queryFn: () => getPaymentStatus(paymentInfo!.id, clientTokenHeaders),
        enabled: !!paymentInfo?.id,
        refetchInterval: (query) => query.state.data?.status === 'paid' ? false : 2000
    });

    const handlePaidAccess = async (paidPayment: PaymentStatus | null | undefined) => {
        if (!paidPayment || paidAccessInFlightRef.current) return;

        paidAccessInFlightRef.current = true;
        setIsPaidAccessRunning(true);
        setPaymentError(null);

        try {
            await startSession({
                station_id: stationId,
                driver_name: driver?.name || undefined,
                duration_minutes: duration,
                price: paidPayment.amount,
                payment_method: paidPayment.provider,
                is_vr: false,
                notes: 'kiosk_paid',
            }, { headers: clientTokenHeaders });

            if (selection?.isLobby) {
                if (selection.isHost) {
                    await createLobbyMutation.mutateAsync();
                } else {
                    await joinLobbyMutation.mutateAsync();
                }
                return;
            }

            await launchSessionMutation.mutateAsync(buildLaunchPayload());
        } catch (err) {
            console.error('Error handling paid access:', err);
            paymentHandledRef.current = false;
            setPaymentError(resolveApiError(err, 'Pago confirmado, pero no se pudo completar el acceso.'));
        } finally {
            paidAccessInFlightRef.current = false;
            setIsPaidAccessRunning(false);
        }
    };

    useEffect(() => {
        if (paymentStatus) {
            setPaymentInfo(paymentStatus);
        }
        if (paymentStatus?.status === 'paid' && !paymentHandledRef.current && !paymentError) {
            paymentHandledRef.current = true;
            void handlePaidAccess(paymentStatus);
        }
    }, [paymentStatus, paymentError]);

    const displayAmount = paymentInfo?.amount ?? sessionPrice;
    const currency = paymentInfo?.currency || 'EUR';
    const effectivePayment = paymentStatus ?? paymentInfo;
    const isPaid = effectivePayment?.status === 'paid';

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">{t('kiosk.paymentTitle')}</h2>
            <p className="text-slate-400 mb-6 text-center">{t('kiosk.paymentSubtitle')}</p>

            <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-6 w-full mb-6 text-left">
                <div className="flex items-center justify-between text-sm text-slate-400 uppercase font-bold">
                    <span>{t('kiosk.durationLabel')}</span>
                    <span className="text-white">{duration} min</span>
                </div>
                <div className="flex items-center justify-between text-sm text-slate-400 uppercase font-bold mt-2">
                    <span>{t('kiosk.totalLabel')}</span>
                    <span className="text-white text-2xl">EUR {displayAmount} {currency}</span>
                </div>
            </div>

            <div className="flex gap-4 mb-6 w-full">
                {(['stripe_qr', 'bizum'] as PaymentProvider[]).map((p) => (
                    <button
                        key={p}
                        onClick={() => {
                            soundManager.playClick();
                            setPaymentProvider(p);
                            setPaymentInfo(null);
                            setPaymentError(null);
                        }}
                        onMouseEnter={() => soundManager.playHover()}
                        className={`flex-1 px-4 py-3 md:px-6 md:py-4 rounded-xl font-black border transition-all text-sm md:text-base ${paymentProvider === p ? 'bg-red-500 border-red-400 text-black' : 'bg-slate-950/60 border-white/10 text-slate-300 hover:border-red-400/50'}`}
                    >
                        {p === 'stripe_qr' ? 'Stripe QR' : 'Bizum'}
                    </button>
                ))}
            </div>

            <div className="bg-slate-950/50 border border-white/10 rounded-2xl p-6 w-full flex flex-col items-center gap-4">
                {paymentError && <div className="text-red-400 font-bold">{paymentError}</div>}
                {!paymentError && paymentProvider === 'stripe_qr' && paymentInfo?.checkout_url && (
                    <>
                        <QRCodeCanvas value={paymentInfo.checkout_url} size={200} level="H" />
                        <p className="text-xs text-slate-400">{t('kiosk.scanToPay')}</p>
                    </>
                )}
                {!paymentError && paymentProvider === 'bizum' && (
                    <div className="text-center text-gray-300 space-y-2">
                        <p className="font-bold">{t('kiosk.payWithBizum')}</p>
                        <p className="text-sm text-slate-400">{paymentInfo?.instructions || t('kiosk.bizumPending')}</p>
                        {paymentInfo?.reference && <div className="text-lg font-black text-white">{paymentInfo.reference}</div>}
                    </div>
                )}
                {!paymentError && paymentInfo?.status === 'pending' && <p className="text-xs text-gray-500">{t('kiosk.waitingPayment')}</p>}
            </div>

            <div className="w-full mt-6 flex gap-4">
                <button
                    onMouseEnter={() => soundManager.playHover()}
                    onClick={() => { soundManager.playClick(); setStep(4); }}
                    className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700 touch-manipulation"
                >
                    {t('common.back')}
                </button>
                <button
                    onMouseEnter={() => soundManager.playHover()}
                    onClick={() => {
                        soundManager.playClick();
                        setPaymentError(null);
                        if (isPaid) {
                            paymentHandledRef.current = false;
                            void handlePaidAccess(effectivePayment);
                            return;
                        }
                        createCheckout.mutate(paymentProvider);
                    }}
                    disabled={createCheckout.isPending || isPaidAccessRunning}
                    className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-60 disabled:cursor-not-allowed text-white font-bold py-4 rounded-xl touch-manipulation"
                >
                    {isPaid
                        ? (isPaidAccessRunning ? 'Reintentando acceso...' : 'Reintentar acceso a sala')
                        : t('kiosk.retryPayment')}
                </button>
            </div>
        </div>
    );
};

// --- NO PAYMENT STEP ---
interface NoPaymentStepProps {
    paymentEnabled: boolean;
    launchWithoutPayment: () => void;
    selection: KioskSelection | null;
    stationId: number;
}

export const NoPaymentStep: React.FC<NoPaymentStepProps> = ({
    paymentEnabled, launchWithoutPayment, selection, stationId
}) => {
    useEffect(() => {
        if (!paymentEnabled) launchWithoutPayment();
    }, [paymentEnabled, selection?.car, selection?.track, stationId]);

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-3xl mx-auto w-full text-center px-4">
            <h2 className="text-3xl font-black text-white mb-3">Iniciando sesion</h2>
            <p className="text-slate-400">El pago esta desactivado. Lanzando la sesion...</p>
        </div>
    );
};

// --- WAITING ROOM ---
interface WaitingRoomProps {
    selection: KioskSelection | null;
    stationId: number;
    setIsLaunched: (l: boolean) => void;
    clientTokenHeaders: Record<string, string>;
    onExitLobby?: () => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ selection, stationId, setIsLaunched, clientTokenHeaders, onExitLobby }) => {
    const [lobbyError, setLobbyError] = useState<string | null>(null);
    const [isAbandoning, setIsAbandoning] = useState(false);
    const navigate = useNavigate();
    
    // K-002: Timeout configuration - 5 minutes max
    const LOBBY_TIMEOUT_SECONDS = 300; // 5 minutes
    const WARNING_THRESHOLD_SECONDS = 60; // Show warning at 1 minute
    
    const resolveApiError = (error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const detail = (error.response?.data as any)?.detail;
            if (typeof detail === 'string' && detail.trim()) return detail;
        }
        return fallback;
    };
    const exitWaitingRoom = React.useCallback(() => {
        if (onExitLobby) {
            onExitLobby();
            return;
        }
        navigate('/');
    }, [navigate, onExitLobby]);
    
    const lobbyId = selection?.lobbyId && selection.lobbyId > 0 ? selection.lobbyId : null;
    const { data: fetchedLobbyData, refetch, isError: isLobbyError } = useQuery({
        queryKey: ['lobby', lobbyId],
        queryFn: () => axios.get(`${API_URL}/lobby/${lobbyId}`, { headers: clientTokenHeaders }).then(res => res.data),
        refetchInterval: 1000,
        enabled: !!selection?.isLobby && !!lobbyId,
        // K-001: Add retry logic for network errors
        retry: 3,
        retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
    });
    const lobbyData = fetchedLobbyData;
    const { data: hardwareStatus } = useQuery({
        queryKey: ['waiting-room-hardware', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders }).then(res => res.data),
        enabled: !!stationId,
        refetchInterval: 1500,
        retry: false,
    });

    useEffect(() => {
        if (selection?.isLobby && !lobbyId) {
            setLobbyError('Sala no valida. Vuelve a seleccionar una sala en vivo.');
        }
    }, [selection?.isLobby, lobbyId]);

    // K-001: Improved mutation with retry
    const StartRaceMutation = useMutation({
        mutationFn: async () => {
            if (!lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${lobbyId}/start`, {}, {
                params: { requesting_station_id: stationId },
                headers: clientTokenHeaders
            });
        },
        retry: 2,
        retryDelay: 1000,
        onSuccess: () => setLobbyError(null),
        onError: (error) => setLobbyError(resolveApiError(error, 'No se pudo iniciar la carrera.'))
    });

    // K-001: Improved mutation with retry and debounce
    const ReadyMutation = useMutation({
        mutationFn: async (isReady: boolean) => {
            if (!lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${lobbyId}/ready`, {}, {
                params: { station_id: stationId, is_ready: isReady },
                headers: clientTokenHeaders
            });
            refetch();
        },
        retry: 2,
        retryDelay: 1000,
        onSuccess: () => setLobbyError(null),
        onError: (error) => setLobbyError(resolveApiError(error, 'No se pudo actualizar tu estado LISTO.'))
    });

    const LeaveLobbyMutation = useMutation({
        mutationFn: async () => {
            if (!lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${lobbyId}/leave`, {
                station_id: stationId
            }, {
                headers: clientTokenHeaders
            });
        },
        retry: 1,
        onSuccess: () => {
            setLobbyError(null);
            if (onExitLobby) {
                onExitLobby();
                return;
            }
            navigate('/');
        },
        onError: (error) => {
            setIsAbandoning(false);
            setLobbyError(resolveApiError(error, 'No se pudo abandonar la sala.'));
        }
    });

    useEffect(() => {
        if (lobbyData?.status === 'running' && hardwareStatus?.ac_running) {
            setIsLaunched(true);
        }
    }, [hardwareStatus?.ac_running, lobbyData?.status, setIsLaunched]);

    const isHost = stationId === lobbyData?.host_station_id;
    const myPlayer = lobbyData?.players?.find((p: any) => p.station_id === stationId);
    const isReady = myPlayer?.ready || false;
    const players = Array.isArray(lobbyData?.players) ? lobbyData.players : [];
    const canHostStart = isReady;

    const timeLeft = typeof lobbyData?.timeout_remaining_seconds === 'number'
        ? lobbyData.timeout_remaining_seconds
        : LOBBY_TIMEOUT_SECONDS;

    useEffect(() => {
        if (lobbyData?.status === 'cancelled') {
            setLobbyError('La sala ha sido cancelada.');
            if (!isAbandoning) {
                setIsAbandoning(true);
                const timeoutId = window.setTimeout(() => exitWaitingRoom(), 2000);
                return () => window.clearTimeout(timeoutId);
            }
        }
    }, [exitWaitingRoom, isAbandoning, lobbyData?.status]);

    useEffect(() => {
        if (!isLobbyError) return;
        setLobbyError((current) => current ?? 'No se pudo actualizar la sala.');
    }, [isLobbyError]);

    useEffect(() => {
        if (!lobbyData || !selection?.isLobby || lobbyData.status === 'running' || isAbandoning) return;
        if (players.some((player: any) => player?.station_id === stationId)) return;

        setLobbyError('Tu simulador ya no forma parte de esta sala.');
        setIsAbandoning(true);
        const timeoutId = window.setTimeout(() => exitWaitingRoom(), 2000);
        return () => window.clearTimeout(timeoutId);
    }, [exitWaitingRoom, isAbandoning, lobbyData, players, selection?.isLobby, stationId]);

    useEffect(() => {
        if (lobbyData?.status !== 'waiting' || timeLeft > 0) return;
        if (isAbandoning) return;

        setLobbyError('Tiempo de espera agotado. La sala se ha cerrado.');
        setIsAbandoning(true);
        const timeoutId = window.setTimeout(() => exitWaitingRoom(), 2000);
        return () => window.clearTimeout(timeoutId);
    }, [exitWaitingRoom, isAbandoning, lobbyData?.status, timeLeft]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    const visiblePlayers = players.slice(0, 6);

    return (
        <div className="h-full min-h-0 flex flex-col items-center p-3 md:p-5 animate-in zoom-in duration-300 max-w-6xl mx-auto w-full text-left overflow-hidden">
            <div className="w-full flex justify-between items-end mb-4 border-b border-gray-800 pb-3">
                <div>
                    <span className="bg-purple-600 text-white px-3 py-1 rounded-full font-bold text-[11px] tracking-widest mb-2 inline-block shadow-lg shadow-purple-900/50">SALA DE ESPERA</span>
                    <h2 className="text-2xl md:text-3xl font-black text-white line-clamp-1">{lobbyData?.name || 'Cargando...'}</h2>
                    <p className="text-slate-400 mt-1 font-mono text-xs md:text-sm line-clamp-1">{lobbyData?.track} | {lobbyData?.car}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                    <p className="text-gray-500 font-bold uppercase tracking-widest mb-1 text-[10px] md:text-xs">
                        {timeLeft <= WARNING_THRESHOLD_SECONDS ? 'SE ACABA' : 'INICIO EN'}
                    </p>
                    <p className={`text-2xl md:text-4xl font-black font-mono ${
                        timeLeft <= 10 ? 'text-red-500 animate-pulse' :
                        timeLeft <= WARNING_THRESHOLD_SECONDS ? 'text-orange-500 animate-pulse' : 'text-white'
                    }`}>{formatTime(timeLeft)}</p>
                </div>
            </div>

            {/* K-002: Timeout warning banner */}
            {timeLeft <= WARNING_THRESHOLD_SECONDS && (
                <div className="w-full mb-3 p-2 bg-orange-500/20 border border-orange-500/50 rounded-lg text-center">
                    <p className="text-orange-400 text-xs font-bold">
                        {isHost ? 'La sala se cerrara pronto.' : 'Tiempo de espera agotandose. La sala se cerrara pronto.'}
                    </p>
                </div>
            )}
            {lobbyData?.status === 'running' && !hardwareStatus?.ac_running && (
                <div className="w-full mb-3 p-2 bg-blue-500/15 border border-blue-400/40 rounded-lg text-center">
                    <p className="text-blue-200 text-xs font-bold">
                        Carrera iniciada. Abriendo Assetto Corsa en este simulador...
                    </p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 w-full flex-1 min-h-0 mb-4 content-start">
                {visiblePlayers.map((player: any, idx: number) => {
                    const isMe = player.station_id === stationId;
                    return (
                        <div key={player.station_id} className={`p-3 md:p-4 rounded-2xl border-2 flex items-center justify-between ${isMe ? 'bg-red-950/30 border-red-400' : 'bg-gray-800/50 border-gray-700'}`}>
                            <div className="flex items-center gap-3">
                                <div className={`w-9 h-9 rounded-full flex items-center justify-center font-black text-sm ${player.ready ? 'bg-green-500 text-black' : 'bg-gray-700 text-slate-400'}`}>{idx + 1}</div>
                                <div>
                                    <p className={`font-bold text-sm md:text-base ${isMe ? 'text-white' : 'text-gray-300'}`}>{player.station_name} {isMe && '(YO)'}</p>
                                    <p className="text-[11px] text-gray-500">Slot {player.slot}</p>
                                </div>
                            </div>
                            {player.ready ? (
                                <span className="bg-green-500/20 text-green-400 px-2.5 py-1.5 rounded-lg font-bold border border-green-500/50 flex items-center gap-2 text-xs"><ShieldCheck size={14} /> LISTO</span>
                            ) : (
                                <span className="bg-gray-700/50 text-gray-500 px-2.5 py-1.5 rounded-lg font-bold border border-gray-600 flex items-center gap-2 text-xs"><Clock size={14} /> ESPERANDO</span>
                            )}
                        </div>
                    );
                })}
                {players.length > visiblePlayers.length && (
                    <div className="md:col-span-2 text-center text-xs text-slate-500 border border-white/10 rounded-xl py-2 bg-black/20">
                        +{players.length - visiblePlayers.length} pilotos adicionales conectados.
                    </div>
                )}
            </div>

            <div className="w-full flex gap-3">
                {!isReady ? (
                    <button
                        onMouseEnter={() => soundManager.playHover()}
                        onClick={() => {
                            soundManager.playClick();
                            setLobbyError(null);
                            ReadyMutation.mutate(true);
                        }}
                        disabled={ReadyMutation.isPending || isAbandoning}
                        className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base md:text-xl shadow-xl shadow-green-600/20 transition-all flex items-center justify-center gap-2"
                    >
                        ESTOY LISTO <ShieldCheck size={20} />
                    </button>
                ) : (
                    <button
                        onMouseEnter={() => soundManager.playHover()}
                        onClick={() => {
                            soundManager.playClick();
                            setLobbyError(null);
                            ReadyMutation.mutate(false);
                        }}
                        disabled={ReadyMutation.isPending || isAbandoning}
                        className="flex-1 bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base md:text-xl shadow-xl shadow-orange-600/20 transition-all flex items-center justify-center gap-2"
                    >
                        CANCELAR LISTO <Clock size={20} />
                    </button>
                )}
                {isHost && (
                    <button
                        onMouseEnter={() => soundManager.playHover()}
                        onClick={() => {
                            soundManager.playClick();
                            setLobbyError(null);
                            StartRaceMutation.mutate();
                        }}
                        disabled={!canHostStart || StartRaceMutation.isPending || isAbandoning}
                        className="flex-1 bg-red-500 hover:bg-red-400 disabled:opacity-50 text-white font-black py-4 rounded-2xl text-base md:text-xl shadow-xl shadow-red-500/30 transition-all flex items-center justify-center gap-2"
                    >
                        COMENZAR CARRERA <Play size={20} fill="currentColor" />
                    </button>
                )}
                {/* K-002: Abandon lobby button */}
                {!isHost && (
                    <button
                        onMouseEnter={() => soundManager.playHover()}
                        onClick={() => {
                            if (window.confirm('Estas seguro de abandonar la sala?')) {
                                soundManager.playClick();
                                setLobbyError(null);
                                setIsAbandoning(true);
                                LeaveLobbyMutation.mutate();
                            }
                        }}
                        disabled={isAbandoning || LeaveLobbyMutation.isPending}
                        className="px-4 bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2"
                        title="Abandonar sala"
                    >
                        <LogOut size={20} />
                        <span className="hidden md:inline">{isAbandoning ? 'Saliendo...' : 'Salir'}</span>
                    </button>
                )}
            </div>
            {isHost && !canHostStart && (
                <p className="w-full text-center text-xs text-slate-500 mt-2">
                    Necesitas 2 pilotos listos y el host en LISTO para iniciar.
                </p>
            )}
            {lobbyError && (
                <p className="w-full text-center text-xs md:text-sm text-red-400 mt-2">{lobbyError}</p>
            )}
        </div >
    );
};

// --- DRIVER STEP ---
interface DriverStepProps {
    t: any;
    driverName: string;
    setDriverName: (name: string) => void;
    driverEmail: string;
    setDriverEmail: (email: string) => void;
    onLogin: (driver: { id: number, name: string }) => void;
    selection: KioskSelection | null;
    leaderboardData: any[];
}

export const DriverStep: React.FC<DriverStepProps> = ({
    t, driverName, setDriverName, driverEmail, setDriverEmail, onLogin, leaderboardData
}) => {
    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(3);
        return `${minutes}:${seconds.padStart(6, '0')}`;
    };

    const topTimes = (leaderboardData || []).map((entry: any, idx: number) => ({
        pos: idx + 1,
        name: entry.driver_name || 'Unknown',
        time: formatTime(entry.best_time || 0),
        car: entry.car_model || 'Unknown Car'
    })).slice(0, 8);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        soundManager.playConfirm();
        onLogin({ id: 1, name: (driverName || "Guest Driver").trim() });
    };

    return (
        <div className="h-full min-h-0 flex items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 px-2 md:px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-6xl h-full min-h-0 text-left">
                <div className="flex flex-col justify-center min-h-0">
                    <h1 className="text-3xl md:text-5xl font-racing uppercase tracking-[0.16em] md:tracking-[0.2em] text-amber-200 mb-2">{t('kiosk.welcomeDriver')}</h1>
                    <p className="text-sm md:text-lg text-slate-300 mb-4 md:mb-6">{t('kiosk.identifyToSave')}</p>
                    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4">
                        <div className="space-y-1.5">
                            <label className="text-slate-400 font-bold ml-1">{t('kiosk.driverName')}</label>
                            <input
                                type="text"
                                className="w-full bg-slate-950/70 border border-white/10 focus:border-amber-400/60 rounded-2xl px-4 py-3 text-lg md:text-2xl text-white font-bold outline-none transition-all focus:scale-[1.01] placeholder:text-slate-600"
                                placeholder="Ej. Max Verstappen"
                                value={driverName}
                                onChange={e => setDriverName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-slate-400 font-bold ml-1">{t('kiosk.emailOptional')}</label>
                            <input
                                type="email"
                                className="w-full bg-slate-950/70 border border-white/10 focus:border-amber-400/60 rounded-2xl px-4 py-3 text-lg md:text-2xl text-white font-bold outline-none transition-all focus:scale-[1.01] placeholder:text-slate-600"
                                placeholder="max@redbull.com"
                                value={driverEmail}
                                onChange={e => setDriverEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            onMouseEnter={() => soundManager.playHover()}
                            className="w-full bg-amber-400 hover:bg-amber-300 text-black font-black text-lg md:text-2xl py-4 md:py-5 rounded-2xl shadow-xl shadow-amber-500/30 active:scale-95 hover:scale-[1.01] transition-all flex items-center justify-center gap-3"
                        >
                            {t('kiosk.start')} <ChevronRight size={24} />
                        </button>
                    </form>
                </div>
                <div className="bg-slate-950/60 rounded-3xl border border-white/10 p-4 md:p-5 backdrop-blur-sm animate-in slide-in-from-right-8 duration-700 min-h-0 overflow-hidden">
                    <h3 className="text-base md:text-xl font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-widest">
                        <Trophy className="text-amber-300" /> {t('kiosk.topTimes')}
                    </h3>
                    <div className="space-y-2 text-left">
                        {topTimes.length === 0 && (
                            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-sm text-slate-400">
                                Aun no hay tiempos registrados para esta combinacion.
                            </div>
                        )}
                        {topTimes.map((entry, idx) => (
                            <div key={entry.pos} className={`flex items-center gap-3 p-2.5 rounded-xl transition-all ${idx === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50'}`}>
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : idx === 2 ? 'bg-orange-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                    {entry.pos}
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-white text-sm truncate">{entry.name}</p>
                                    <p className="text-xs text-gray-500">{entry.car}</p>
                                </div>
                                <div className={`font-mono font-bold text-sm md:text-base ${idx === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {entry.time}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- COACH SECTION COMPONENT ---
interface CoachSectionProps {
    lapId?: number;
}

export const CoachSection: React.FC<CoachSectionProps> = ({ lapId }) => {
    const { data: coachAnalysis, isLoading } = useQuery({
        queryKey: ['coach-analysis', lapId],
        queryFn: async () => {
            if (!lapId) return null;
            const res = await axios.get(`${API_URL}/telemetry/coach/${lapId}`);
            return res.data;
        },
        enabled: !!lapId
    });

    if (isLoading) return <div className="bg-gray-800/20 p-8 rounded-3xl border border-gray-700 animate-pulse text-center text-slate-400">Analizando telemetria...</div>;
    if (!coachAnalysis || coachAnalysis.tips.length === 0) return (
        <div className="bg-gray-800/20 p-6 rounded-3xl border border-gray-700 text-center">
            <p className="text-slate-400 italic">No hay suficientes datos para el analisis comparativo todavia.</p>
        </div>
    );

    const telemetryChartData = coachAnalysis.ghost_telemetry.map((g: any, i: number) => {
        const u = coachAnalysis.user_telemetry[i] || {};
        return {
            n: g.n,
            ghost: g.s,
            user: u.s
        };
    });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coachAnalysis.tips.map((tip: any, idx: number) => (
                    <div key={idx} className={`p-4 rounded-2xl border flex gap-4 items-start ${tip.severity === 'high' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
                        <div className={`p-2 rounded-lg ${tip.severity === 'high' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                            {tip.type === 'braking' ? <Zap size={20} /> : tip.type === 'apex' ? <TrendingUp size={20} /> : <Zap size={20} />}
                        </div>
                        <div>
                            <h5 className="font-bold text-white uppercase text-xs mb-1 tracking-wider">
                                {tip.type === 'braking' ? 'Punto de frenada' : tip.type === 'apex' ? 'Velocidad en el vertice' : 'Traccion/Salida'}
                            </h5>
                            <p className="text-sm text-gray-300 leading-tight">{tip.message}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-gray-900/50 p-6 rounded-3xl border border-gray-800">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-white font-bold flex items-center gap-2">
                        <Activity size={18} className="text-green-400" /> VELOCIDAD VS GHOST ({coachAnalysis.reference_driver_name})
                    </h4>
                    <div className="flex gap-4 text-xs font-bold">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-400 rounded-full"></div> TU</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-full"></div> GHOST</div>
                    </div>
                </div>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={telemetryChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="n" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '8px' }}
                                itemStyle={{ fontSize: '12px' }}
                            />
                            <Line type="monotone" dataKey="user" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="ghost" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};

// --- RACE MODE ---
interface RaceModeProps {
    remainingSeconds: number;
    selection: KioskSelection | null;
    driver: { name: string } | null;
    transmission?: string;
    setIsLaunched: (l: boolean) => void;
    setStep: (s: number) => void;
    setDriver: (d: any) => void;
    setDriverName: (n: string) => void;
    setDriverEmail: (e: string) => void;
    noPaymentHandledRef: React.MutableRefObject<boolean>;
    paymentHandledRef: React.MutableRefObject<boolean>;
    stationId: number;
    clientTokenHeaders: Record<string, string>;
    setSelection: (s: any) => void;
}

export const RaceMode: React.FC<RaceModeProps> = ({
    remainingSeconds, selection, driver, transmission, setIsLaunched, setStep, setDriver, setDriverName, setDriverEmail,
    noPaymentHandledRef, paymentHandledRef, stationId, clientTokenHeaders, setSelection
}) => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const isLowTime = remainingSeconds < 60;

    // Fetch live telemetry for user feedback
    const { data: telemetry } = useQuery({
        queryKey: ['telemetry-live', stationId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/live/${stationId}`);
            return res.data;
        },
        refetchInterval: 500, // Poll every 500ms
        retry: false
    });

    const bestLapRaw = telemetry?.laps?.best ?? '--:--.---';
    const lastLapRaw = telemetry?.laps?.last ?? '--:--.---';
    const fuelRaw = telemetry?.physics?.fuel ?? telemetry?.fuel ?? 0;

    const toMs = (value: any): number | null => {
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value <= 0) return null;
            if (value >= 1000) return value;
            if (value >= 20) return Math.round(value * 1000);
            return null;
        }
        if (typeof value === 'string') {
            const raw = value.trim();
            if (!raw || raw === '--:--.---') return null;
            if (/^\d+(\.\d+)?$/.test(raw)) {
                const num = Number(raw);
                if (!Number.isFinite(num) || num <= 0) return null;
                return num >= 1000 ? num : Math.round(num * 1000);
            }
            const match = raw.match(/^(\d+):(\d{1,2})(?:\.(\d{1,3}))?$/);
            if (match) {
                const mins = Number(match[1]);
                const secs = Number(match[2]);
                const millis = Number((match[3] || '0').padEnd(3, '0'));
                if (!Number.isFinite(mins) || !Number.isFinite(secs) || !Number.isFinite(millis)) return null;
                return (mins * 60 * 1000) + (secs * 1000) + millis;
            }
        }
        return null;
    };

    const toSectorMs = (value: any): number | null => {
        if (typeof value === 'number') {
            if (!Number.isFinite(value) || value <= 0) return null;
            return value >= 1000 ? value : Math.round(value * 1000);
        }
        if (typeof value === 'string') {
            const numeric = Number(value);
            if (!Number.isFinite(numeric) || numeric <= 0) return null;
            return numeric >= 1000 ? numeric : Math.round(numeric * 1000);
        }
        return null;
    };

    const pickSectors = (source: any): (number | null)[] | null => {
        if (!source) return null;
        if (Array.isArray(source)) {
            const parsed = source.slice(0, 3).map((v) => toSectorMs(v));
            if (parsed.some((v) => v !== null)) return parsed;
            return null;
        }
        if (typeof source === 'object') {
            const parsed = [
                toSectorMs(source.s1 ?? source.sector1 ?? source.sector_1 ?? source[0]),
                toSectorMs(source.s2 ?? source.sector2 ?? source.sector_2 ?? source[1]),
                toSectorMs(source.s3 ?? source.sector3 ?? source.sector_3 ?? source[2])
            ];
            if (parsed.some((v) => v !== null)) return parsed;
        }
        return null;
    };

    const formatLapMs = (ms: number | null): string => {
        if (ms === null) return '--:--.---';
        const minutesPart = Math.floor(ms / 60000);
        const secondsPart = ((ms % 60000) / 1000).toFixed(3);
        return `${minutesPart}:${secondsPart.padStart(6, '0')}`;
    };

    const formatSectorMs = (ms: number | null): string => {
        if (ms === null) return '--.---';
        return `${(ms / 1000).toFixed(3)}s`;
    };

    const formatDeltaMs = (ms: number | null): string => {
        if (ms === null) return '--.---';
        const sign = ms >= 0 ? '+' : '-';
        return `${sign}${Math.abs(ms / 1000).toFixed(3)}s`;
    };

    const normalizeLapDisplay = (raw: any, parsedMs: number | null): string => {
        if (typeof raw === 'string') {
            const trimmed = raw.trim();
            if (!trimmed || trimmed === '--:--.---') return '--:--.---';
            if (/^\d+(\.\d+)?$/.test(trimmed)) {
                return formatLapMs(toMs(trimmed));
            }
            return trimmed;
        }
        return formatLapMs(parsedMs);
    };

    const bestLapMs = toMs(bestLapRaw);
    const lastLapMs = toMs(lastLapRaw);
    const currentLapMs = [
        telemetry?.laps?.current_time,
        telemetry?.laps?.current_lap_time,
        telemetry?.laps?.current_ms,
        telemetry?.physics?.lap_time_ms,
        telemetry?.lap_time_ms,
        telemetry?.laps?.current
    ].map((v) => toMs(v)).find((v) => v !== null) ?? null;

    const bestLapDisplay = normalizeLapDisplay(bestLapRaw, bestLapMs);
    const lastLapDisplay = normalizeLapDisplay(lastLapRaw, lastLapMs);
    const deltaMs = (bestLapMs !== null && currentLapMs !== null) ? (currentLapMs - bestLapMs) : null;
    const deltaClass = deltaMs === null ? 'text-slate-500' : deltaMs <= 0 ? 'text-emerald-400' : 'text-red-400';

    const currentSectors = pickSectors(
        telemetry?.laps?.current_sectors
        || telemetry?.laps?.sectors_current
        || telemetry?.laps?.sectors
        || telemetry?.sectors
        || telemetry?.physics?.sectors
        || telemetry?.laps?.last_sectors
        || telemetry?.laps?.splits
    ) || [null, null, null];

    const bestSectors = pickSectors(
        telemetry?.laps?.best_sectors
        || telemetry?.laps?.sectors_best
        || telemetry?.best_sectors
        || telemetry?.bestSectors
    ) || [null, null, null];

    const fuelValue = typeof fuelRaw === 'number' ? fuelRaw : Number.parseFloat(String(fuelRaw));
    const safeFuel = Number.isFinite(fuelValue) ? fuelValue : 0;
    const referenceLapMs = lastLapMs ?? bestLapMs;
    const explicitFuelPerLap = [
        telemetry?.physics?.fuel_per_lap,
        telemetry?.physics?.fuelPerLap,
        telemetry?.fuel_per_lap
    ].map((v) => Number(v)).find((v) => Number.isFinite(v) && v > 0) ?? null;
    const fuelRatePerSec = [
        telemetry?.physics?.fuel_rate_l_per_s,
        telemetry?.physics?.fuelRateLps,
        telemetry?.physics?.fuel_rate,
        telemetry?.fuel_rate_l_per_s
    ].map((v) => Number(v)).find((v) => Number.isFinite(v) && v > 0) ?? null;
    const estimatedFuelPerLap = explicitFuelPerLap
        ?? ((fuelRatePerSec && referenceLapMs) ? fuelRatePerSec * (referenceLapMs / 1000) : null)
        ?? 2.6;
    const estimatedLapsLeft = safeFuel > 0 && estimatedFuelPerLap > 0
        ? safeFuel / estimatedFuelPerLap
        : null;

    const HOLD_TO_CANCEL_MS = 1300;
    const [cancelHoldProgress, setCancelHoldProgress] = useState(0);
    const [isHoldingCancel, setIsHoldingCancel] = useState(false);
    const [isCancelling, setIsCancelling] = useState(false);
    const [isEndingSession, setIsEndingSession] = useState(false);
    const holdIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const holdStartRef = useRef<number | null>(null);
    const holdTriggeredRef = useRef(false);

    useEffect(() => {
        return () => {
            if (holdIntervalRef.current) {
                clearInterval(holdIntervalRef.current);
                holdIntervalRef.current = null;
            }
        };
    }, []);

    const clearCancelHold = () => {
        if (holdIntervalRef.current) {
            clearInterval(holdIntervalRef.current);
            holdIntervalRef.current = null;
        }
    };

    const performCancelSession = async () => {
        if (isCancelling || isEndingSession) return;
        setIsCancelling(true);
        soundManager.playConfirm();
        try {
            if (selection?.isLobby && selection.lobbyId) {
                if (selection.isHost) {
                    await axios.delete(`${API_URL}/lobby/${selection.lobbyId}`, {
                        params: { requesting_station_id: stationId },
                        headers: clientTokenHeaders,
                    });
                } else {
                    await axios.post(
                        `${API_URL}/lobby/${selection.lobbyId}/leave`,
                        { station_id: stationId },
                        { headers: clientTokenHeaders },
                    );
                }
            } else {
                await axios.post(`${API_URL}/control/station/${stationId}/panic`, null, { headers: clientTokenHeaders });
            }
        } catch (e) {
            console.error('Error stopping session:', e);
        } finally {
            setIsLaunched(false);
            setStep(1);
            setSelection(null);
            setDriver(null);
            setDriverName('');
            setDriverEmail('');
            noPaymentHandledRef.current = false;
            paymentHandledRef.current = false;
            setIsCancelling(false);
        }
    };

    useEffect(() => {
        if (remainingSeconds > 0 || isEndingSession) return;

        let cancelled = false;
        setIsEndingSession(true);

        const finalizeSession = async () => {
            try {
                if (selection?.isLobby && selection.lobbyId) {
                    if (selection.isHost) {
                        await axios.delete(`${API_URL}/lobby/${selection.lobbyId}`, {
                            params: { requesting_station_id: stationId },
                            headers: clientTokenHeaders,
                        });
                    } else {
                        await axios.post(
                            `${API_URL}/lobby/${selection.lobbyId}/leave`,
                            { station_id: stationId },
                            { headers: clientTokenHeaders },
                        );
                    }
                } else {
                    await axios.post(`${API_URL}/control/station/${stationId}/stop`, null, { headers: clientTokenHeaders });
                }
            } catch (error) {
                console.error('Error ending session automatically:', error);
            } finally {
                if (cancelled) return;
                setIsLaunched(false);
                setStep(7);
                setIsEndingSession(false);
            }
        };

        void finalizeSession();

        return () => {
            cancelled = true;
        };
    }, [clientTokenHeaders, isEndingSession, remainingSeconds, selection, setIsLaunched, setStep, stationId]);

    const startCancelHold = () => {
        if (isCancelling || holdIntervalRef.current) return;
        holdTriggeredRef.current = false;
        holdStartRef.current = Date.now();
        setIsHoldingCancel(true);
        setCancelHoldProgress(0);

        holdIntervalRef.current = setInterval(() => {
            const startedAt = holdStartRef.current;
            if (!startedAt) return;
            const elapsed = Date.now() - startedAt;
            const progress = Math.min(100, (elapsed / HOLD_TO_CANCEL_MS) * 100);
            setCancelHoldProgress(progress);

            if (progress >= 100 && !holdTriggeredRef.current) {
                holdTriggeredRef.current = true;
                clearCancelHold();
                setIsHoldingCancel(false);
                setCancelHoldProgress(100);
                void performCancelSession();
            }
        }, 40);
    };

    const stopCancelHold = () => {
        if (holdTriggeredRef.current) return;
        clearCancelHold();
        setIsHoldingCancel(false);
        setCancelHoldProgress(0);
    };

    return (
        <div className="h-full w-full min-h-0 grid grid-rows-[auto_auto_1fr_auto] gap-3 md:gap-4 animate-in fade-in duration-500 text-white bg-[radial-gradient(120%_120%_at_0%_0%,rgba(30,41,59,0.45),transparent_55%),radial-gradient(120%_140%_at_100%_0%,rgba(127,29,29,0.24),transparent_50%),linear-gradient(180deg,#020617,#020b1c)] p-3 md:p-4 rounded-2xl border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.45)]">
            <div className={`text-center py-2.5 rounded-2xl transition-all duration-500 ${isLowTime ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_infinite]' : 'bg-slate-950/70 border border-red-500/35'}`}>
                <div className={`text-4xl md:text-6xl font-numeric font-black ${isLowTime ? 'text-white' : 'text-amber-300'}`}>
                    <Clock className={cn("inline-block mr-2 -mt-1", isLowTime ? "text-white" : "text-amber-300")} size={34} />
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <p className={`text-[11px] md:text-xs font-black uppercase tracking-[0.25em] mt-1 ${isLowTime ? 'text-white' : 'text-gray-500'}`}>
                    {isLowTime ? 'ULTIMO MINUTO' : 'TIEMPO RESTANTE'}
                </p>
            </div>

            <div className="flex justify-between items-center gap-3 border-b border-gray-800 pb-2">
                <div className="min-w-0">
                    <h2 className="text-xl md:text-2xl font-black text-white truncate">{selection?.track?.toUpperCase() || 'CIRCUITO'}</h2>
                    <p className="text-sm md:text-base text-amber-300 font-bold truncate">{driver?.name || 'PILOTO'}</p>
                </div>
                <div className="shrink-0 text-right">
                    <p className="text-[10px] md:text-xs uppercase tracking-[0.22em] text-slate-500">Sesion activa</p>
                    <p className="text-[11px] md:text-xs font-bold text-emerald-300">Salida segura con pulsacion larga</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 min-h-0">
                <div className="grid grid-rows-2 gap-3 md:gap-4 min-h-0">
                    <div className="bg-slate-950/75 rounded-3xl border border-slate-700/70 p-4 md:p-5 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center z-10">
                            <h3 className="text-3xl md:text-5xl font-numeric text-white mb-1">{bestLapDisplay}</h3>
                            <p className="text-green-400 font-bold text-sm md:text-base uppercase tracking-widest">Mejor Vuelta</p>
                        </div>
                    </div>
                    <div className="bg-slate-950/75 rounded-3xl border border-slate-700/70 p-4 md:p-5 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center z-10">
                            <h3 className="text-3xl md:text-4xl font-numeric text-gray-300 mb-1">{lastLapDisplay}</h3>
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Ultima Vuelta</p>
                        </div>
                    </div>
                </div>

                <div className="grid grid-rows-[auto_auto_auto_1fr] gap-3 md:gap-4 min-h-0">
                    <div className="bg-slate-950/70 p-3 md:p-4 rounded-2xl border border-slate-700/70 flex justify-between items-center">
                        <div>
                            <h3 className="text-sm md:text-base font-bold text-slate-400 mb-1">COMBUSTIBLE</h3>
                            <div className="text-2xl md:text-3xl font-black text-white">{safeFuel.toFixed(1)} L</div>
                            <p className="text-[11px] md:text-xs text-slate-500 mt-1">
                                {estimatedLapsLeft !== null ? `~ ${estimatedLapsLeft.toFixed(1)} vueltas restantes` : 'Sin estimacion de consumo'}
                            </p>
                        </div>
                        <button className="px-3 py-2 bg-slate-800 rounded-lg text-[10px] md:text-xs font-bold text-slate-400 border border-slate-600/60" disabled>
                            REQUEST PIT
                        </button>
                    </div>

                    <div className="bg-slate-950/70 p-3 md:p-4 rounded-2xl border border-slate-700/70 flex items-center justify-between gap-3">
                        <div>
                            <h3 className="text-sm md:text-base font-bold text-slate-400 mb-1">TRANSMISION</h3>
                            <div className="text-lg md:text-xl font-black text-white">
                                {transmission === 'manual' ? 'MANUAL' : 'AUTOMATICO'}
                            </div>
                        </div>
                        <div className="text-right text-xs text-slate-500">
                            <div>{selection?.car || 'CAR'}</div>
                        </div>
                    </div>

                    <div className="bg-slate-950/70 p-3 md:p-4 rounded-2xl border border-slate-700/70">
                        <div className="flex items-center justify-between gap-2">
                            <h3 className="text-sm md:text-base font-bold text-slate-400">RITMO EN VIVO</h3>
                            <div className={`text-sm md:text-base font-black font-mono ${deltaClass}`}>
                                {formatDeltaMs(deltaMs)}
                            </div>
                        </div>
                        <p className="text-[10px] md:text-xs text-slate-500 mt-0.5">DELTA VS MEJOR</p>
                        <div className="grid grid-cols-3 gap-2 mt-2.5">
                            {[0, 1, 2].map((idx) => {
                                const current = currentSectors[idx] ?? null;
                                const best = bestSectors[idx] ?? null;
                                const sectorClass = current === null || best === null
                                    ? 'text-slate-400 border-slate-700'
                                    : current <= best
                                        ? 'text-emerald-400 border-emerald-500/40'
                                        : (current - best) < 200
                                            ? 'text-amber-300 border-amber-500/40'
                                            : 'text-red-400 border-red-500/40';
                                return (
                                    <div key={idx} className={`rounded-xl border bg-black/25 px-2.5 py-2 text-center ${sectorClass}`}>
                                        <div className="text-[10px] font-black tracking-widest">S{idx + 1}</div>
                                        <div className="text-xs md:text-sm font-mono font-black">{formatSectorMs(current)}</div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div className="min-h-0">
                        <h3 className="text-sm md:text-base font-bold text-slate-400 mb-2">INGENIERO DE PISTA (SIMULADO)</h3>
                        <div className="grid grid-cols-2 gap-2 md:gap-3">
                            <button className="bg-red-900/20 border border-red-600/30 text-red-400/50 p-2.5 md:p-3 rounded-xl font-black text-xs md:text-sm cursor-not-allowed">SOFT</button>
                            <button className="bg-yellow-900/20 border border-yellow-600/30 text-yellow-400/50 p-2.5 md:p-3 rounded-xl font-black text-xs md:text-sm cursor-not-allowed">MEDIUM</button>
                            <button className="bg-white/10 border border-gray-500/30 text-gray-500 p-2.5 md:p-3 rounded-xl font-black text-xs md:text-sm cursor-not-allowed">HARD</button>
                            <button className="bg-red-950/30 border border-red-500/30 text-amber-300/50 p-2.5 md:p-3 rounded-xl font-black text-xs md:text-sm cursor-not-allowed">WET</button>
                        </div>
                        <p className="text-center text-[10px] text-gray-600 mt-2">Controles de boxes deshabilitados en modo kiosko simplificado.</p>
                    </div>
                </div>
            </div>

            <div>
                <button
                    onPointerDown={startCancelHold}
                    onPointerUp={stopCancelHold}
                    onPointerLeave={stopCancelHold}
                    onPointerCancel={stopCancelHold}
                    onContextMenu={(e) => e.preventDefault()}
                    disabled={isCancelling || isEndingSession}
                    className="relative w-full overflow-hidden bg-red-900/40 hover:bg-red-600 border-2 border-red-500/60 text-red-200 hover:text-white font-black text-base md:text-xl py-3 md:py-4 rounded-2xl transition-all flex items-center justify-center gap-3 disabled:opacity-60"
                >
                    <div
                        className="absolute inset-y-0 left-0 bg-red-500/50 transition-[width] duration-75"
                        style={{ width: `${cancelHoldProgress}%` }}
                    />
                    <span className="relative z-10 flex items-center justify-center gap-3">
                        <LogOut size={20} />
                        {isCancelling ? 'CANCELANDO...' : isEndingSession ? 'FINALIZANDO...' : 'CANCELAR SESION'}
                    </span>
                </button>
                <p className="text-center text-[10px] md:text-xs text-slate-500 mt-1.5">
                    {isEndingSession ? 'Cerrando la sesion y preparando resultados...' : isHoldingCancel ? 'Manten pulsado para confirmar cancelacion...' : 'Manten pulsado 1.3s para cancelar la sesion'}
                </p>
            </div>
        </div>
    );
};

// --- RESULTS STEP ---
interface ResultsStepProps {
    driver: { name: string } | null;
    selection: KioskSelection | null;
    t: any;
}

export const ResultsStep: React.FC<ResultsStepProps> = ({ driver, selection }) => {
    const { data: recentSessions, isLoading } = useQuery({
        queryKey: ['recent-sessions', driver?.name, selection?.track],
        queryFn: async () => {
            await new Promise(r => setTimeout(r, 2000));
            const res = await axios.get(`${API_URL}/telemetry/sessions`, {
                params: {
                    driver_name: driver?.name,
                    track_name: selection?.track,
                    limit: 1
                }
            });
            return res.data;
        },
        refetchInterval: (query) => {
            const data = query.state.data as any[];
            if (!data || data.length === 0) return 2000;
            const sessTime = new Date(data[0].date).getTime();
            const now = new Date().getTime();
            if (now - sessTime > 10 * 60 * 1000) return 2000;
            return false;
        }
    });

    const session = recentSessions?.[0];
    const isFresh = session && (new Date().getTime() - new Date(session.date).getTime() < 15 * 60 * 1000);

    const { data: driverStats } = useQuery({
        queryKey: ['driver-details', driver?.name, selection?.track],
        queryFn: () => axios.get(`${API_URL}/telemetry/details/${selection?.track}/${driver?.name}`).then(r => r.data),
        enabled: !!session
    });

    const chartData = driverStats?.lap_history?.map((time: number, i: number) => ({
        lap: i + 1,
        time: time / 1000,
    })) || [];

    const formatTime = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = ((ms % 60000) / 1000).toFixed(3);
        return `${m}:${s.padStart(6, '0')}`;
    };

    if (isLoading || !isFresh) {
        return (
            <div className="h-full flex flex-col items-center justify-center animate-pulse">
                <Trophy size={80} className="text-gray-600 mb-6" />
                <h2 className="text-4xl font-black text-white">PROCESANDO RESULTADOS...</h2>
                <p className="text-slate-400 mt-2">Recibiendo telemetria del coche...</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-4 md:p-8 animate-in zoom-in duration-500 max-w-7xl mx-auto w-full">
            <div className="text-center mb-8">
                <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter mb-2">RESULTADOS DE SESION</h2>
                <p className="text-xl text-slate-400">{session?.track_name} - {session?.car_model}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 text-center">
                        <div className="text-slate-400 font-bold mb-2">MEJOR VUELTA</div>
                        <div className="text-6xl font-numeric text-white">{formatTime(session?.best_lap || 0)}</div>
                    </div>
                    <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 flex flex-col items-center">
                        <h4 className="text-slate-400 font-bold mb-4">CONSISTENCIA</h4>
                        <div className="relative w-40 h-40 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="80" cy="80" r="70" stroke="#374151" strokeWidth="12" fill="none" />
                                <circle cx="80" cy="80" r="70" stroke="#ef4444" strokeWidth="12" fill="none" strokeDasharray="440" strokeDashoffset={440 - (440 * (session?.consistency || 85)) / 100} strokeLinecap="round" className="transition-all duration-1000" />
                            </svg>
                            <div className="absolute inset-0 flex flex-col items-center justify-center">
                                <span className="text-4xl font-black text-white">{session?.consistency || 85}%</span>
                            </div>
                        </div>
                    </div>
                </div>
                <div className="lg:col-span-2 space-y-8 flex flex-col">
                    <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 flex-1">
                        <h4 className="text-white font-bold mb-6 flex items-center gap-2">
                            <TrendingUp className="text-amber-300" /> PROGRESO DE VUELTAS
                        </h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis dataKey="lap" stroke="#9ca3af" />
                                    <YAxis stroke="#9ca3af" domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '12px', color: '#fff' }} />
                                    <Line type="monotone" dataKey="time" stroke="#ef4444" strokeWidth={4} dot={{ r: 6, fill: '#ef4444' }} activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/30 p-8 rounded-3xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-red-500 p-3 rounded-2xl"><Activity className="text-white" size={32} /></div>
                            <div>
                                <h3 className="text-2xl font-black text-white">AI COACH ANALYSIS</h3>
                                <p className="text-amber-300 font-bold uppercase tracking-widest text-xs">Comparativa con el record del circuito</p>
                            </div>
                        </div>
                        <CoachSection lapId={session?.best_lap_id} />
                    </div>
                </div>
            </div>
            <div className="mt-8 flex flex-col md:flex-row gap-6 md:gap-8 items-start md:items-center bg-gray-900 border border-gray-800 p-4 md:p-6 rounded-3xl">
                <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QRCodeCanvas
                        value={`${window.location.origin}/p/${encodeURIComponent(driver?.name || '')}`}
                        size={120}
                        level="H"
                        includeMargin
                    />
                </div>
                <div className="flex-1">
                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">!LLEVATE TUS DATOS!</h3>
                    <p className="text-slate-400 text-lg mb-4">Escanea este codigo para guardar tu telemetria, comparar con tus amigos y ver tu nivel de piloto en tu movil.</p>
                    <div className="flex gap-4">
                        <button onClick={() => window.location.reload()} className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl border border-gray-600 transition-all">
                            Cerrar Sesion
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
