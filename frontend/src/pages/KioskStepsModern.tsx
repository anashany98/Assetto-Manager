import React from 'react';
import { useNavigate } from 'react-router-dom';
import { soundManager } from '../utils/sound';
import {
    ChevronRight, Trophy,
    Sun, Sunset, Cloud, CloudRain,
    Activity, ShieldCheck, Play, Clock, Users, LogOut
} from 'lucide-react';
import type { Scenario } from '../api/scenarios';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import IdleVideoBackground from '../components/IdleVideoBackground';
// Reuse types from original Kiosk
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
}

// --- ATTRACT MODE ---
// Modern: Minimalist, Full Screen Video/Image, "Touch to Start"
interface AttractModeProps {
    isIdle: boolean;
    t: any;
    onUnpair?: () => void;
}

export const AttractModeModern: React.FC<AttractModeProps> = ({ isIdle, t, onUnpair }) => {
    if (!isIdle) return null;

    return (
        <div
            onClick={() => soundManager.playConfirm()}
            className="fixed inset-0 z-50 bg-black flex flex-col items-center justify-center overflow-hidden cursor-pointer"
        >
            {/* Background Layer */}
            <div className="absolute inset-0 z-0">
                <div className="absolute inset-0 bg-gradient-to-t from-black via-transparent to-black opacity-80 z-10" />
                <IdleVideoBackground className="w-full h-full object-cover animate-zoom-slow" />
            </div>

            {/* Unpair Trigger (Hidden) */}
            <div
                onClick={(e) => { e.stopPropagation(); onUnpair?.(); }}
                className="absolute top-0 left-0 p-4 md:p-8 z-50 opacity-0 active:opacity-100"
            >
                <div className="text-white text-xs bg-red-600 px-2 py-1 rounded">Desvincular</div>
            </div>

            {/* Content */}
            <div className="relative z-20 text-center animate-fade-in-up">
                <h1 className="text-[6rem] md:text-[10rem] font-black text-white italic tracking-tighter leading-none opacity-10">CARRERA</h1>
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <img src="/logo.png" alt="Logo" className="h-24 md:h-32 mb-6 md:mb-8 drop-shadow-2xl" />
                    <p className="text-lg md:text-2xl text-white font-light tracking-[0.35em] md:tracking-[0.5em] uppercase animate-pulse">
                        {t('kiosk.touchToStart') || 'TOCA PARA EMPEZAR'}
                    </p>
                </div>
            </div>
        </div>
    );
};

// --- SCENARIO STEP ---
// Modern: Horizontal Scroll Cards
interface ScenarioStepProps {
    t: any;
    scenarios: Scenario[];
    setSelection: (s: KioskSelection | null) => void;
    setStep: (s: number) => void;
    setSelectedScenario: (s: Scenario | null) => void;
    setDuration: (d: number) => void;
}

export const ScenarioStepModern: React.FC<ScenarioStepProps> = ({
    scenarios, setSelection, setStep, setSelectedScenario, setDuration
}) => {

    // Fetch Lobbies
    const { data: activeLobbies = [] } = useQuery({
        queryKey: ['lobbies', 'active'],
        queryFn: () => axios.get(`${API_URL}/lobby/list?status=active`).then(r => r.data),
        refetchInterval: 5000
    });
    const displayLobbies = Array.isArray(activeLobbies) ? activeLobbies : [];

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
        setSelection({
            type: 'race',
            track: lobby.track || '',
            car: lobby.car || '',
            isLobby: true,
            isHost: false,
            lobbyId: lobby.id,
            time: duration
        });
        setDuration(duration);
        setStep(3); // Driver Step
    };

    // Quick Launch Helper
    const handleSelect = (scenario: Scenario, time: number) => {
        soundManager.playClick();
        setSelectedScenario(scenario);
        const sessionType = (scenario.session_type as any) || 'practice';

        setSelection({
            type: sessionType,
            scenarioId: scenario.id!,
            track: '',
            car: '',
            time: time,
            isLobby: true,
            isHost: true
        });
        setDuration(time);
        setStep(2);
    };

    const scenarioCards = scenarios.slice(0, 4);
    const lobbyCards = displayLobbies.slice(0, 4);
    const getDurationLabel = (scenario: Scenario) => {
        const durations = scenario.allowed_durations?.slice(0, 3);
        if (!durations || durations.length === 0) return '10/15 MIN';
        return `${durations.join('/')} MIN`;
    };

    return (
        <div className="h-full min-h-0 flex flex-col pt-4 md:pt-6 pb-3 px-3 md:px-6 animate-in fade-in slide-in-from-right-8 duration-500 overflow-hidden">
            <h2 className="text-2xl md:text-3xl font-thin text-white uppercase tracking-widest mb-1 border-l-4 border-red-400 pl-3 md:pl-5">
                Selecciona tu <span className="font-black italic">Experiencia</span>
            </h2>
            <p className="text-xs md:text-sm text-slate-400 mb-3 md:mb-4 pl-3 md:pl-5">
                Flujo rapido para tablet: todo visible sin scroll.
            </p>

            <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1.45fr_1fr] gap-3 md:gap-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 min-h-0">
                    {scenarioCards.map((scenario) => (
                        <button
                        key={scenario.id}
                        className="text-left rounded-3xl border border-white/10 bg-slate-950/65 hover:bg-slate-900/75 hover:border-red-400/50 p-3 md:p-4 transition-all flex flex-col justify-between min-h-[170px] md:min-h-[190px]"
                        onClick={() => handleSelect(scenario, scenario.allowed_durations?.[0] || 15)}
                        onMouseEnter={() => soundManager.playHover()}
                    >
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <span className="text-[10px] uppercase tracking-widest text-amber-200 font-bold">
                                    {getDurationLabel(scenario)}
                                </span>
                                <ChevronRight size={18} className="text-amber-300" />
                            </div>
                            <h3 className="text-lg md:text-xl font-black text-white uppercase leading-tight line-clamp-2">{scenario.name}</h3>
                            <p className="text-xs md:text-sm text-slate-400 mt-2 line-clamp-3">
                                {scenario.description || 'Modo de competicion estandar.'}
                            </p>
                        </div>
                        <div className="mt-3 flex gap-2">
                            {(scenario.allowed_durations?.length ? scenario.allowed_durations : [10, 15]).slice(0, 2).map((mins) => (
                                <span key={mins} className="inline-flex items-center rounded-lg border border-white/10 bg-black/25 px-2.5 py-1 text-[11px] text-slate-300 font-bold">
                                    {mins} MIN
                                </span>
                            ))}
                        </div>
                    </button>
                    ))}

                    {scenarioCards.length === 0 && (
                        <div className="sm:col-span-2 rounded-3xl border border-white/10 bg-slate-950/60 p-6 text-center text-slate-400">
                            No hay eventos disponibles.
                        </div>
                    )}

                </div>

                <div className="rounded-3xl border border-red-500/30 bg-gradient-to-b from-red-950/20 to-slate-950/70 p-3 md:p-4 flex flex-col min-h-0">
                    <h3 className="text-sm md:text-lg font-black text-white mb-3 flex items-center gap-2 uppercase tracking-widest">
                        <Activity className="text-emerald-400 animate-pulse" size={18} /> SALAS EN VIVO
                    </h3>
                    <div className="space-y-2.5">
                        {lobbyCards.length > 0 ? lobbyCards.map((lobby: any) => {
                            return (
                                <button
                                    key={lobby.id}
                                    onClick={() => handleJoinLobby(lobby)}
                                    className="w-full text-left bg-black/40 hover:bg-red-600/20 border border-white/10 hover:border-red-400/50 p-3 rounded-xl transition-all group"
                                >
                                    <div className="flex justify-between items-start mb-1">
                                        <span className="font-bold text-white group-hover:text-amber-300 text-xs md:text-sm line-clamp-1">
                                            {lobby.name}
                                        </span>
                                        <span className="text-[10px] bg-white/10 px-1.5 py-0.5 rounded text-gray-400">{lobby.player_count ?? lobby.players_count ?? 0}/{lobby.max_players ?? 10}</span>
                                    </div>
                                    <div className="text-xs text-gray-500 truncate">{lobby.track}</div>
                                </button>
                            );
                        }) : (
                            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                                No hay salas abiertas.
                            </div>
                        )}
                    </div>
                    <div className="mt-auto pt-3 text-[11px] text-slate-500">
                        Disenado para iPad 10": vista completa sin desplazamiento.
                    </div>
                </div>
            </div>
        </div>
    );
};

// --- CONTENT STEP ---
// Modern: Clean lists with large previews
// Reuse logic, but we might want to restyle it. 
// For now, let's wrap it or just use it. The logic is complex (filtering cars/tracks).
// Let's assume KioskContentStep is flexible enough or we override CSS. 
// Actually, KioskContentStep uses a grid which is "Arcade". 
// To make it truly modern, we should probably refactor it, but given time constraints, 
// let's wrap it in a clean container or override styles via CSS modules if possible.
// For this plan, I'll stick to using ContentStep but maybe wrap it to match the aesthetic.


// --- DIFFICULTY STEP ---
interface DifficultyStepProps {
    t: any;
    selection: KioskSelection | null;
    difficulty: string;
    setDifficulty: (d: any) => void;
    transmission: string;
    setTransmission: (t: any) => void;
    setStep: (s: number) => void;
    launchWithoutPayment: () => void;
    paymentEnabled: boolean;
    setPaymentInfo: (p: any) => void;
    setPaymentError: (e: any) => void;
    launchingNoPayment: boolean;
    weather: string;
    setWeather: (w: any) => void;
    timeOfDay: string;
    setTimeOfDay: (t: any) => void;
    rainEnabled?: boolean;
}

export const DifficultyStepModern: React.FC<DifficultyStepProps> = ({
    difficulty, setDifficulty, transmission, setTransmission,
    setStep, launchWithoutPayment, paymentEnabled, setPaymentInfo, setPaymentError,
    launchingNoPayment, weather, setWeather, timeOfDay, setTimeOfDay, rainEnabled
}) => {
    return (
        <div className="h-full flex flex-col max-w-5xl mx-auto px-4 md:px-8 py-6 md:py-10 animate-in fade-in slide-in-from-right-8 duration-500">
            <h2 className="text-3xl md:text-4xl font-thin text-white uppercase tracking-widest mb-8 md:mb-12 border-l-4 border-yellow-500 pl-4 md:pl-6">
                Configuracion <span className="font-black italic">Final</span>
            </h2>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 h-full">
                {/* Left Column: Conditions */}
                <div className="space-y-10">
                    {/* Transmission */}
                    <div>
                        <h3 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4">Transmision</h3>
                        <div className="flex gap-4">
                            {['automatic', 'manual'].map((mode) => (
                                <button
                                    key={mode}
                                    onClick={() => { soundManager.playClick(); setTransmission(mode); }}
                                    className={`flex-1 py-4 rounded-xl font-bold uppercase tracking-wider transition-all ${transmission === mode
                                        ? 'bg-white text-black shadow-lg shadow-white/10'
                                        : 'bg-white/5 text-gray-400 hover:bg-white/10'
                                        }`}
                                >
                                    {mode === 'automatic' ? 'Automatica' : 'Manual'}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Difficulty */}
                    <div>
                        <h3 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4">Dificultad (Ayudas)</h3>
                        <div className="grid grid-cols-3 gap-3">
                            {['novice', 'amateur', 'pro'].map((level) => (
                                <button
                                    key={level}
                                    onClick={() => { soundManager.playClick(); setDifficulty(level); }}
                                    className={`py-4 rounded-xl flex flex-col items-center justify-center gap-2 transition-all border ${difficulty === level
                                        ? 'border-yellow-500 bg-yellow-500/10 text-yellow-500'
                                        : 'border-white/10 bg-white/5 text-gray-400 hover:border-white/30'
                                        }`}
                                >
                                    {level === 'novice' && <ShieldCheck size={20} />}
                                    {level === 'amateur' && <Activity size={20} />}
                                    {level === 'pro' && <Trophy size={20} />}
                                    <span className="text-xs font-bold uppercase">{level}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Weather & Time */}
                    <div>
                        <h3 className="text-gray-500 font-bold text-xs uppercase tracking-widest mb-4">Ambiente</h3>
                        <div className="grid grid-cols-2 gap-3 mb-3">
                            <button onClick={() => setTimeOfDay('noon')} className={`p-3 rounded-lg flex items-center justify-center gap-2 ${timeOfDay === 'noon' ? 'bg-orange-400 text-black' : 'bg-white/5 text-gray-400'}`}>
                                <Sun size={16} /> Mediodia
                            </button>
                            <button onClick={() => setTimeOfDay('evening')} className={`p-3 rounded-lg flex items-center justify-center gap-2 ${timeOfDay === 'evening' ? 'bg-red-500 text-white' : 'bg-white/5 text-gray-400'}`}>
                                <Sunset size={16} /> Tarde
                            </button>
                        </div>
                        <div className="grid grid-cols-3 gap-3">
                            <button onClick={() => setWeather('sun')} className={`p-3 rounded-lg flex items-center justify-center ${weather === 'sun' ? 'bg-amber-400 text-white' : 'bg-white/5 text-gray-400'}`}><Sun size={16} /></button>
                            <button onClick={() => setWeather('cloud')} className={`p-3 rounded-lg flex items-center justify-center ${weather === 'cloud' ? 'bg-gray-500 text-white' : 'bg-white/5 text-gray-400'}`}><Cloud size={16} /></button>
                            {rainEnabled && (
                                <button onClick={() => setWeather('rain')} className={`p-3 rounded-lg flex items-center justify-center ${weather === 'rain' ? 'bg-red-600 text-white' : 'bg-white/5 text-gray-400'}`}><CloudRain size={16} /></button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Launch Action */}
                <div className="flex items-end justify-end">
                    <button
                        onClick={() => {
                            soundManager.playClick();
                            setPaymentInfo(null);
                            setPaymentError(null);
                            if (paymentEnabled) setStep(5);
                            else launchWithoutPayment();
                        }}
                        disabled={launchingNoPayment}
                        className="group relative w-full aspect-square max-h-[300px] rounded-full bg-white text-black flex flex-col items-center justify-center hover:scale-105 transition-transform duration-300 shadow-2xl shadow-white/20"
                    >
                        <span className="text-sm font-bold tracking-[0.2em] uppercase mb-2">
                            {paymentEnabled ? 'Ir al Pago' : 'Iniciar'}
                        </span>
                        <Play fill="black" size={64} className="group-hover:translate-x-1 transition-transform" />
                        {launchingNoPayment && (
                            <div className="absolute inset-0 rounded-full border-4 border-black/10 border-t-black animate-spin" />
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
};

interface WaitingRoomModernProps {
    selection: KioskSelection | null;
    stationId: number;
    setIsLaunched: (l: boolean) => void;
    clientTokenHeaders: Record<string, string>;
    onExitLobby?: () => void;
}

export const WaitingRoomModern: React.FC<WaitingRoomModernProps> = ({ selection, stationId, setIsLaunched, clientTokenHeaders, onExitLobby }) => {
    const [lobbyError, setLobbyError] = React.useState<string | null>(null);
    const [isAbandoning, setIsAbandoning] = React.useState(false);
    const navigate = useNavigate();
    const LOBBY_TIMEOUT_SECONDS = 300;
    const WARNING_THRESHOLD_SECONDS = 60;
    const resolveApiError = (error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const detail = (error.response?.data as any)?.detail;
            if (typeof detail === 'string' && detail.trim()) return detail;
        }
        return fallback;
    };
    const lobbyId = selection?.lobbyId && selection.lobbyId > 0 ? selection.lobbyId : null;
    const exitWaitingRoom = React.useCallback(() => {
        if (onExitLobby) {
            onExitLobby();
            return;
        }
        navigate('/');
    }, [navigate, onExitLobby]);
    const { data: lobbyData, refetch, isError: isLobbyError } = useQuery({
        queryKey: ['lobby', lobbyId],
        queryFn: () => axios.get(`${API_URL}/lobby/${lobbyId}`, { headers: clientTokenHeaders }).then(res => res.data),
        refetchInterval: 1000,
        enabled: !!selection?.isLobby && !!lobbyId
    });
    const { data: hardwareStatus } = useQuery({
        queryKey: ['waiting-room-modern-hardware', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders }).then(res => res.data),
        refetchInterval: 1500,
        enabled: !!stationId,
        retry: false,
    });

    React.useEffect(() => {
        if (selection?.isLobby && !lobbyId) {
            setLobbyError('Sala no valida. Vuelve a seleccionar una sala en vivo.');
        }
    }, [selection?.isLobby, lobbyId]);

    const StartRaceMutation = useMutation({
        mutationFn: async () => {
            if (!lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${lobbyId}/start`, {}, {
                params: { requesting_station_id: stationId },
                headers: clientTokenHeaders
            });
        },
        onSuccess: () => setLobbyError(null),
        onError: (error) => setLobbyError(resolveApiError(error, 'No se pudo iniciar la carrera.'))
    });

    const ReadyMutation = useMutation({
        mutationFn: async (isReady: boolean) => {
            if (!lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${lobbyId}/ready`, {}, {
                params: { station_id: stationId, is_ready: isReady },
                headers: clientTokenHeaders
            });
            refetch();
        },
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
            exitWaitingRoom();
        },
        onError: (error) => {
            setIsAbandoning(false);
            setLobbyError(resolveApiError(error, 'No se pudo abandonar la sala.'));
        }
    });

    React.useEffect(() => {
        if (lobbyData?.status === 'running' && hardwareStatus?.ac_running) setIsLaunched(true);
    }, [hardwareStatus?.ac_running, lobbyData?.status, setIsLaunched]);

    const isHost = stationId === lobbyData?.host_station_id;
    const myPlayer = lobbyData?.players?.find((p: any) => p.station_id === stationId);
    const isReady = myPlayer?.ready || false;
    const players = Array.isArray(lobbyData?.players) ? lobbyData.players : [];
    const readyPlayersCount = players.filter((p: any) => p?.ready).length;
    const canHostStart = isReady && readyPlayersCount >= 2;

    React.useEffect(() => {
        if (lobbyData?.status === 'cancelled') {
            setLobbyError('La sala ha sido cancelada.');
            if (!isAbandoning) {
                setIsAbandoning(true);
                const timeoutId = window.setTimeout(() => exitWaitingRoom(), 2000);
                return () => window.clearTimeout(timeoutId);
            }
        }
    }, [exitWaitingRoom, isAbandoning, lobbyData?.status]);

    React.useEffect(() => {
        if (!isLobbyError) return;
        setLobbyError((current) => current ?? 'No se pudo actualizar la sala.');
    }, [isLobbyError]);

    React.useEffect(() => {
        if (!lobbyData || !selection?.isLobby || lobbyData.status === 'running' || isAbandoning) return;
        if (players.some((player: any) => player?.station_id === stationId)) return;

        setLobbyError('Tu simulador ya no forma parte de esta sala.');
        setIsAbandoning(true);
        const timeoutId = window.setTimeout(() => exitWaitingRoom(), 2000);
        return () => window.clearTimeout(timeoutId);
    }, [exitWaitingRoom, isAbandoning, lobbyData, players, selection?.isLobby, stationId]);

    const timeLeft = typeof lobbyData?.timeout_remaining_seconds === 'number'
        ? lobbyData.timeout_remaining_seconds
        : LOBBY_TIMEOUT_SECONDS;

    React.useEffect(() => {
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
        <div className="h-full min-h-0 flex flex-col p-3 md:p-5 animate-in zoom-in duration-300 w-full max-w-7xl mx-auto overflow-hidden">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:justify-between md:items-end gap-3 mb-4 border-b border-white/10 pb-3">
                <div>
                    <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-300 px-3 py-1 rounded-full font-bold text-xs uppercase tracking-widest mb-2 border border-amber-400/30">
                        <Users size={16} /> Sala de Espera
                    </div>
                    <h2 className="text-2xl md:text-3xl font-black text-white uppercase tracking-tighter line-clamp-1">
                        {lobbyData?.name || 'Cargando Sala...'}
                    </h2>
                    <p className="text-gray-400 mt-1 text-xs md:text-sm font-light line-clamp-1">
                        {lobbyData?.track} <span className="text-gray-600">|</span> {lobbyData?.car}
                    </p>
                </div>
                <div className="text-right">
                    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">Inicio Automatico</div>
                    <div className={`text-2xl md:text-4xl font-mono font-black ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {formatTime(timeLeft)}
                    </div>
                </div>
            </div>

            {timeLeft <= WARNING_THRESHOLD_SECONDS && (
                <div className="mb-4 rounded-2xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-center text-xs font-bold uppercase tracking-widest text-amber-200">
                    {isHost ? 'La sala se cerrara pronto.' : 'Tiempo de espera agotandose.'}
                </div>
            )}

            {/* Players Grid */}
            <div className="flex-1 min-h-0 mb-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 content-start">
                {visiblePlayers.map((player: any, idx: number) => {
                    const isMe = player.station_id === stationId;
                    return (
                        <div
                            key={player.station_id}
                            className={`relative overflow-hidden rounded-2xl p-4 md:p-6 border-2 transition-all ${isMe
                                ? 'bg-red-500/10 border-red-400'
                                : 'bg-white/5 border-white/5'
                                }`}
                        >
                            <div className="flex items-center justify-between relative z-10">
                                <div className="flex items-center gap-4">
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg ${player.ready ? 'bg-green-500 text-black' : 'bg-gray-800 text-gray-500'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <div className={`font-bold text-lg leading-none mb-1 ${isMe ? 'text-white' : 'text-gray-300'}`}>
                                            {player.station_name} {isMe && '(YO)'}
                                        </div>
                                        <div className="text-xs text-gray-500 font-mono uppercase">Puesto {player.slot}</div>
                                    </div>
                                </div>
                                {player.ready ? (
                                    <ShieldCheck className="text-green-500" size={24} />
                                ) : (
                                    <Clock className="text-gray-600" size={24} />
                                )}
                            </div>
                            {/* Status Bar */}
                            <div className={`absolute bottom-0 left-0 h-1 transition-all duration-500 ${player.ready ? 'w-full bg-green-500' : 'w-0 bg-gray-700'}`} />
                        </div>
                    );
                })}
                {players.length > visiblePlayers.length && (
                    <div className="lg:col-span-3 md:col-span-2 text-center text-xs text-slate-500 border border-white/10 rounded-xl py-2 bg-black/20">
                        +{players.length - visiblePlayers.length} jugadores adicionales en la sala.
                    </div>
                )}
            </div>

            {/* Actions Footer */}
            <div className="grid grid-cols-2 gap-3 md:gap-4 h-16 md:h-24">
                <button
                    onClick={() => {
                        soundManager.playClick();
                        setLobbyError(null);
                        ReadyMutation.mutate(!isReady);
                    }}
                    disabled={ReadyMutation.isPending || isAbandoning}
                    className={`rounded-2xl font-black text-sm md:text-xl flex items-center justify-center gap-2 transition-all touch-manipulation hover:scale-[1.02] active:scale-95 ${isReady
                        ? 'bg-orange-500 hover:bg-orange-400 text-black shadow-[0_0_30px_rgba(249,115,22,0.3)]'
                        : 'bg-green-600 hover:bg-green-500 text-white shadow-[0_0_30px_rgba(22,163,74,0.3)]'
                        }`}
                >
                    {isReady ? (
                        <>CANCELAR <Clock size={18} /></>
                    ) : (
                        <>ESTOY LISTO <ShieldCheck size={18} /></>
                    )}
                </button>

                {isHost && (
                    <button
                        onClick={() => {
                            soundManager.playClick();
                            setLobbyError(null);
                            StartRaceMutation.mutate();
                        }}
                        disabled={!canHostStart || StartRaceMutation.isPending || isAbandoning}
                        className="bg-white hover:bg-gray-100 disabled:opacity-50 disabled:hover:bg-white text-black rounded-2xl font-black text-sm md:text-xl flex items-center justify-center gap-2 transition-all touch-manipulation hover:scale-[1.02] active:scale-95 shadow-[0_0_30px_rgba(255,255,255,0.3)]"
                    >
                        COMENZAR <Play size={18} fill="black" />
                    </button>
                )}
                {!isHost && (
                    <button
                        onClick={() => {
                            if (window.confirm('Estas seguro de abandonar la sala?')) {
                                soundManager.playClick();
                                setLobbyError(null);
                                setIsAbandoning(true);
                                LeaveLobbyMutation.mutate();
                            }
                        }}
                        disabled={isAbandoning || LeaveLobbyMutation.isPending}
                        className="bg-white/5 hover:bg-white/10 disabled:opacity-50 text-gray-300 rounded-2xl font-black text-sm md:text-xl flex items-center justify-center gap-2 transition-all touch-manipulation border border-white/10"
                    >
                        <LogOut size={18} />
                        {isAbandoning ? 'SALIENDO' : 'ABANDONAR'}
                    </button>
                )}
            </div>
            {isHost && !canHostStart && (
                <p className="text-center text-xs text-slate-500 mt-2">
                    Necesitas 2 pilotos listos y el host en LISTO para iniciar.
                </p>
            )}
            {lobbyError && (
                <p className="text-center text-xs md:text-sm text-red-400 mt-2">{lobbyError}</p>
            )}
        </div>
    );
};



