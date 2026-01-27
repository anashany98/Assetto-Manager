import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { soundManager } from '../utils/sound';
import {
    ChevronRight, Trophy,
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
import type { PaymentProvider } from '../api/payments';
import { startSession } from '../api/sessions';

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
}

// --- ATTRACT MODE ---
interface AttractModeProps {
    isIdle: boolean;
    scenarios: Scenario[];
}

export const AttractMode: React.FC<AttractModeProps> = ({ isIdle, scenarios }) => {
    const [slide, setSlide] = useState(0);

    useEffect(() => {
        if (!isIdle) return;
        const timer = setInterval(() => {
            setSlide(prev => (prev + 1) % 3); // Now 3 slides
        }, 6000);
        return () => clearInterval(timer);
    }, [isIdle]);

    if (!isIdle) return null;

    return (
        <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden animate-in fade-in duration-1000">
            <div className="absolute inset-0 opacity-60">
                <video
                    autoPlay
                    loop
                    muted
                    className="w-full h-full object-cover"
                    src="https://assets.mixkit.co/videos/preview/mixkit-asphalt-road-with-white-lines-loop-2273-large.mp4"
                    poster="https://images.unsplash.com/photo-1594787318286-3d835c1d207f?q=80&w=2070&auto=format&fit=crop"
                />
            </div>
            <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto px-4">
                {slide === 0 ? (
                    <div className="animate-in slide-in-from-bottom-10 duration-700 fade-in">
                        <h1 className="text-9xl font-black text-white italic tracking-tighter drop-shadow-2xl mb-4">RACE READY</h1>
                        <p className="text-4xl text-blue-400 font-bold tracking-[1em] uppercase mb-12">Kiosk Mode</p>
                        <div className="bg-white/10 backdrop-blur-md px-12 py-6 rounded-full border border-white/20 inline-block animate-pulse">
                            <p className="text-2xl text-white font-bold">TOCA LA PANTALLA PARA EMPEZAR</p>
                        </div>
                    </div>
                ) : slide === 1 ? (
                    <div className="animate-in slide-in-from-bottom-10 duration-700 fade-in">
                        <h2 className="text-6xl font-black text-white italic mb-12 drop-shadow-lg">EVENTOS DE HOY</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                            {scenarios.slice(0, 4).map(sc => (
                                <div key={sc.id} className="bg-black/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex items-center justify-between">
                                    <div>
                                        <h3 className="text-2xl font-bold text-white mb-2">{sc.name}</h3>
                                        <span className="text-blue-400 font-mono text-xl font-bold">{sc.allowed_durations?.[0]} min</span>
                                    </div>
                                    <div className="bg-white/20 p-3 rounded-full">
                                        <ChevronRight className="text-white" size={32} />
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : (
                    <div className="animate-in zoom-in duration-700 fade-in">
                        <h2 className="text-5xl font-black text-yellow-400 italic mb-4 drop-shadow-lg">RÉCORD DEL DÍA</h2>
                        <div className="bg-black/60 backdrop-blur-xl p-8 rounded-[3rem] border-2 border-yellow-500/50 inline-block shadow-[0_0_50px_rgba(234,179,8,0.3)]">
                            <div className="text-8xl font-black text-white tabular-nums mb-2 font-mono">1:42.580</div>
                            <div className="text-2xl font-bold text-gray-300 uppercase tracking-widest">Carlos Sainz</div>
                            <div className="text-sm text-yellow-500 mt-2 font-bold">FERRARI 488 GT3 @ SPA</div>
                        </div>
                        <p className="text-white font-bold mt-8 text-xl animate-pulse">¿PUEDES SUPERARLO?</p>
                    </div>
                )}
            </div>
        </div>
    );
};

import { Flag } from 'lucide-react';

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
    t, scenarios, setSelection, setStep, setSelectedScenario, setDuration
}) => {
    // 1. Fetch Active Lobbies
    const { data: lobbies = [] } = useQuery({
        queryKey: ['lobbies'],
        queryFn: () => axios.get(`${API_URL}/lobby/list?status=active`).then(r => r.data),
        refetchInterval: 5000
    });

    const handleSurpriseMe = () => {
        if (scenarios.length > 0) {
            const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
            const randomCar = randomScenario.allowed_cars?.[Math.floor(Math.random() * randomScenario.allowed_cars.length)] || 'ks_mercedes_amg_gt3';
            const randomTrack = randomScenario.allowed_tracks?.[Math.floor(Math.random() * randomScenario.allowed_tracks.length)] || 'spa';
            const sessionType = (randomScenario.session_type as any) || 'practice';

            setSelection({
                type: sessionType,
                scenarioId: randomScenario.id,
                track: randomTrack,
                car: randomCar,
                time: 10,
                isLobby: true,
                isHost: true
            });
            setDuration(10);
            setStep(2);
        } else {
            alert("No hay escenarios disponibles para aleatorizar.");
        }
    };

    const getDailyChallenge = () => {
        if (scenarios.length === 0) return null;
        const today = new Date();
        const seed = today.getFullYear() * 1000 + (today.getMonth() + 1) * 31 + today.getDate();
        const scenario = scenarios[seed % scenarios.length];
        const carIndex = seed % (scenario.allowed_cars?.length || 1);
        const trackIndex = seed % (scenario.allowed_tracks?.length || 1);

        return {
            ...scenario,
            selectedCar: scenario.allowed_cars?.[carIndex] || 'ks_mercedes_amg_gt3',
            selectedTrack: scenario.allowed_tracks?.[trackIndex] || 'spa'
        };
    };
    const dailyScenario = getDailyChallenge();

    const [expandedId, setExpandedId] = useState<number | null>(null);

    const handleSelect = (scenario: Scenario, time: number) => {
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



    const handleJoinLobby = (lobby: any) => {
        soundManager.playClick();
        setSelection({
            type: 'race',
            track: lobby.track,
            car: lobby.car,
            isLobby: true,
            isHost: false,
            lobbyId: lobby.id,
            time: lobby.duration
        });
        setDuration(lobby.duration);
        setStep(3); // Go to Driver Registration directly
    };

    return (
        <div className="h-full flex flex-col animate-in zoom-in duration-300">
            <h2 className="text-3xl md:text-5xl font-black text-white italic tracking-tighter mb-4 md:mb-8 text-center drop-shadow-lg">
                {t('kiosk.chooseCompetition')}
            </h2>

            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-8 md:space-y-12 custom-scrollbar">
                <div className="mb-8">
                    <h3 className="text-xl md:text-2xl font-black text-blue-400 mb-4 md:mb-6 flex items-center gap-3 border-b border-blue-900/50 pb-2">
                        <Activity className="animate-pulse" /> {t('kiosk.liveLobbies')}
                    </h3>
                    {lobbies.length > 0 ? (
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                            {lobbies.map((l: any) => (
                                <button
                                    key={l.id}
                                    onClick={() => handleJoinLobby(l)}
                                    className="bg-blue-900/20 border-2 border-blue-500/30 hover:bg-blue-900/40 hover:border-blue-500 transition-all p-4 rounded-2xl text-left group"
                                >
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="bg-blue-600 text-white text-[10px] uppercase font-bold px-2 py-1 rounded-md">{l.name}</span>
                                        <span className="text-blue-300 font-mono text-xs">{l.players_count}/10</span>
                                    </div>
                                    <h4 className="font-bold text-white text-lg">{l.track}</h4>
                                    <p className="text-sm text-gray-400">{l.car}</p>
                                </button>
                            ))}
                        </div>
                    ) : (
                        <div className="w-full bg-blue-900/10 border border-blue-900/30 rounded-2xl p-6 text-center">
                            <p className="text-blue-300/50 font-bold italic">No hay torneos activos en este momento.</p>
                            <p className="text-xs text-blue-400/30 mt-1">¡Crea uno nuevo abajo!</p>
                        </div>
                    )}
                </div>


                <div className="mb-8">
                    <h3 className="text-xl md:text-2xl font-black text-yellow-500 mb-4 md:mb-6 flex items-center gap-3 border-b border-yellow-900/30 pb-2">
                        <Trophy className="text-yellow-500" /> {t('kiosk.specialEvents')}
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
                        {dailyScenario && (
                            <div
                                onClick={() => {
                                    setSelection({
                                        type: (dailyScenario.session_type as any) || 'practice',
                                        scenarioId: dailyScenario.id!,
                                        track: dailyScenario.selectedTrack,
                                        car: dailyScenario.selectedCar,
                                        time: 10,
                                        isLobby: true,
                                        isHost: true
                                    });
                                    setDuration(10);
                                    setStep(2);
                                }}
                                className="group relative bg-gradient-to-br from-yellow-600 to-orange-700 rounded-3xl p-4 md:p-6 cursor-pointer border-4 border-yellow-400/50 hover:border-white shadow-2xl hover:scale-[1.03] transition-all overflow-hidden flex flex-col justify-between h-64 md:h-80"
                            >
                                <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black text-xs px-3 py-1 rounded-bl-xl z-20">RETO DEL DÍA</div>
                                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all z-0" />
                                <div className="relative z-10 text-center mt-4 flex-1 flex flex-col items-center justify-center">
                                    <Trophy size={48} className="mx-auto text-yellow-200 mb-4 drop-shadow-lg animate-bounce md:w-16 md:h-16" />
                                    <h3 className="text-2xl md:text-3xl font-black text-white leading-none uppercase">RETO<br />DIARIO</h3>
                                    <p className="mt-2 text-yellow-200 font-bold uppercase text-sm md:text-base">{dailyScenario.selectedTrack} • {dailyScenario.selectedCar}</p>
                                </div>
                            </div>
                        )}

                        <div
                            onClick={handleSurpriseMe}
                            className="group relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-4 md:p-6 cursor-pointer border-4 border-white/10 hover:border-white shadow-2xl hover:scale-[1.03] transition-all overflow-hidden flex flex-col justify-between h-64 md:h-80"
                        >
                            <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 z-0">
                                <div className="text-7xl md:text-9xl font-black text-white">?</div>
                            </div>
                            <div className="relative z-10 flex flex-col items-center justify-center h-full text-center">
                                <Gauge size={64} className="text-white mb-6 drop-shadow-lg group-hover:rotate-180 transition-transform duration-700 md:w-20 md:h-20" />
                                <h3 className="text-3xl md:text-4xl font-black text-white leading-tight">¡SORPRÉNDEME!</h3>
                            </div>
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-xl md:text-2xl font-black text-gray-400 mb-4 md:mb-6 flex items-center gap-3 border-b border-gray-800 pb-2">
                        <Flag /> PRÁCTICA LIBRE
                    </h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 md:gap-8">
                        {scenarios.map(scenario => {
                            const isExpanded = expandedId === scenario.id;
                            return (
                                <div
                                    key={scenario.id}
                                    onClick={() => !isExpanded && setExpandedId(scenario.id!)}
                                    className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-6 md:p-8 border-4 transition-all shadow-2xl group overflow-hidden ${isExpanded ? 'border-blue-500 scale-105 z-10 cursor-default' : 'border-gray-700 hover:border-gray-500 hover:scale-[1.02] cursor-pointer'}`}
                                >
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="bg-gray-700 p-2 md:p-3 rounded-2xl">
                                            <Flag size={24} className={`md:w-8 md:h-8 ${isExpanded ? "text-blue-400" : "text-gray-400"}`} />
                                        </div>
                                    </div>
                                    <h3 className="text-2xl md:text-3xl font-black text-white mb-2 uppercase leading-none">{scenario.name}</h3>
                                    <p className="text-gray-400 mb-6 min-h-[3rem] text-sm line-clamp-2">{scenario.description || 'Competición abierta'}</p>
                                    {isExpanded ? (
                                        <div
                                            className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300 cursor-default"
                                            onClick={(e) => e.stopPropagation()}
                                        >
                                            <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{t('kiosk.pickDuration')}</p>
                                            <div className="grid grid-cols-2 gap-3">
                                                {(scenario.allowed_durations?.length ? scenario.allowed_durations : [10, 15, 20]).map((mins: number) => (
                                                    <button
                                                        key={mins}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleSelect(scenario, mins);
                                                        }}
                                                        className="relative z-50 pointer-events-auto bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl border border-blue-400/30 flex items-center justify-center gap-2 transition-transform active:scale-95 text-sm md:text-base hover:shadow-lg hover:shadow-blue-500/20"
                                                    >
                                                        <Clock size={16} /> {mins}m
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="mt-4 flex items-center gap-2 text-gray-500 font-bold group-hover:text-white transition-colors">
                                            <span>{t('kiosk.select')}</span> <ChevronRight />
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div >
        </div >
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
    timeOfDay, setTimeOfDay, weather, setWeather,
    difficulty, setDifficulty,
    paymentEnabled, setStep,
    setPaymentInfo, setPaymentError, launchWithoutPayment,
    launchingNoPayment, paymentNote, paymentHandledRef, noPaymentHandledRef, resolveAssetUrl,
    rainEnabled = false
}) => {

    const getMockSpecs = (id: string = '') => {
        const seed = id.charCodeAt(0) || 0;
        return {
            bhp: `${400 + (seed % 20) * 10} HP`,
            weight: `${1100 + (seed % 10) * 20} kg`,
            top_speed: `${260 + (seed % 15) * 5} km/h`
        };
    };
    const specs = selectedCarObj?.specs?.bhp ? selectedCarObj.specs : getMockSpecs(selectedCarObj?.id);
    const carImageUrl = resolveAssetUrl(selectedCarObj?.image_url);
    const trackImageUrl = resolveAssetUrl(selectedTrackObj?.image_url);
    const mapUrl = resolveAssetUrl(selectedTrackObj?.map_url)
        || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png";

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full custom-scrollbar overflow-y-auto px-4 py-8">
            <h2 className="text-3xl md:text-5xl font-black text-white mb-6 md:mb-8 uppercase tracking-tighter text-center">
                CONFIGURA TU SESIÓN
            </h2>

            <div className="w-full grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 mb-6 md:mb-8 text-left">
                <div className="bg-gray-800/60 border border-gray-700 rounded-3xl p-4 md:p-6 flex flex-col relative overflow-hidden group">
                    <h4 className="text-gray-400 font-bold text-xs tracking-widest uppercase mb-4">VEHÍCULO</h4>
                    {carImageUrl && <img src={carImageUrl} className="w-full h-32 md:h-40 object-cover rounded-2xl mb-4 border border-gray-700/60" alt="" />}
                    <div className="text-xl md:text-2xl font-black text-white mb-1 truncate">{selectedCarObj?.name || selection?.car}</div>
                    <div className="grid grid-cols-3 gap-2 md:gap-4 mt-auto">
                        <div className="bg-black/30 rounded-xl p-2 md:p-3 text-center">
                            <div className="text-gray-500 text-[8px] md:text-[10px] uppercase">Potencia</div>
                            <div className="text-white font-black text-sm md:text-base">{specs.bhp}</div>
                        </div>
                        <div className="bg-black/30 rounded-xl p-2 md:p-3 text-center">
                            <div className="text-gray-500 text-[8px] md:text-[10px] uppercase">Peso</div>
                            <div className="text-white font-black text-sm md:text-base">{specs.weight}</div>
                        </div>
                        <div className="bg-black/30 rounded-xl p-2 md:p-3 text-center">
                            <div className="text-gray-500 text-[8px] md:text-[10px] uppercase">Top Speed</div>
                            <div className="text-white font-black text-sm md:text-base">{specs.top_speed}</div>
                        </div>
                    </div>
                </div>

                <div className="bg-gray-800/60 border border-gray-700 rounded-3xl p-4 md:p-6 flex flex-col relative overflow-hidden">
                    <h4 className="text-gray-400 font-bold text-xs tracking-widest uppercase mb-1">CIRCUITO</h4>
                    <div className="text-lg md:text-xl font-black text-white mb-4 truncate">{selectedTrackObj?.name || selection?.track}</div>
                    {trackImageUrl && <img src={trackImageUrl} className="w-full h-24 md:h-32 object-cover rounded-2xl mb-4 border border-gray-700/60" alt="" />}
                    <div className="flex-1 flex items-center justify-center">
                        <img src={mapUrl} className="h-16 md:h-24 w-auto object-contain brightness-200 filter invert" alt="" />
                    </div>
                </div>
            </div>

            <div className="w-full mb-6 md:mb-8 text-left">
                <p className="text-gray-400 font-bold mb-4 uppercase text-xs tracking-widest">CONDICIONES</p>
                <div className={`bg-gray-800/50 p-2 rounded-2xl grid grid-cols-3 gap-2`}>
                    <button onClick={() => setTimeOfDay('noon')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${timeOfDay === 'noon' ? 'bg-yellow-500 text-black shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                        <Sun size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">MEDIODÍA</span>
                    </button>
                    <button onClick={() => setTimeOfDay('evening')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${timeOfDay === 'evening' ? 'bg-orange-500 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                        <Sunset size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">OCASO</span>
                    </button>

                    {/* WEATHER OPTIONS */}
                    <button onClick={() => setWeather('sun')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'sun' ? 'bg-blue-400 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                        <Sun size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">DESPEJADO</span>
                    </button>
                    <button onClick={() => setWeather('cloud')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'cloud' ? 'bg-gray-500 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                        <Cloud size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">NUBLADO</span>
                    </button>
                    <button onClick={() => setWeather('fog')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'fog' ? 'bg-gray-400 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                        <CloudFog size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">NIEBLA</span>
                    </button>
                    {rainEnabled && (
                        <button onClick={() => setWeather('rain')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'rain' ? 'bg-blue-600 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                            <CloudRain size={20} className="md:w-6 md:h-6" /> <span className="text-[10px] md:text-xs font-bold">LLUVIA</span>
                        </button>
                    )}
                </div>
            </div>

            <div className="w-full mb-8 text-left">
                <p className="text-gray-400 font-bold mb-4 uppercase text-xs tracking-widest">AYUDAS</p>
                <div className="grid grid-cols-3 gap-4">
                    {['novice', 'amateur', 'pro'].map(lv => (
                        <button key={lv} onClick={() => setDifficulty(lv)} className={`p-4 rounded-2xl border-2 flex flex-col items-center gap-2 transition-all ${difficulty === lv ? 'border-blue-500 bg-blue-500/10' : 'border-gray-700 bg-gray-800/50'}`}>
                            {lv === 'novice' ? <ShieldCheck className="md:w-8 md:h-8" /> : lv === 'amateur' ? <Activity className="md:w-8 md:h-8" /> : <Trophy className="md:w-8 md:h-8" />}
                            <span className="font-black text-xs md:text-sm uppercase">{lv}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="w-full pb-8">
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
                    className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-xl md:text-2xl py-4 md:py-6 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50 touch-manipulation"
                >
                    {paymentEnabled ? t('kiosk.payAndLaunch') : 'LANZAR'} <Play fill="currentColor" size={24} />
                </button>
                <p className="text-center text-gray-500 mt-4 text-xs">{paymentNote}</p>
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
        onError: () => setPaymentError('No se pudo iniciar el pago. Revisa la configuración.')
    });

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.post(`${API_URL}/lobby/create`, {
                station_id: stationId,
                name: `GRUPO DE ${driver?.name?.toUpperCase() || 'INVITADO'}`,
                track: selection?.track,
                car: selection?.car,
                duration: duration,
                max_players: 10
            });
            return res.data;
        },
        onSuccess: (data) => {
            setSelection((prev: any) => ({ ...prev, lobbyId: data.id }));
            setStep(6);
        },
        onError: (err) => {
            console.error("Failed to create lobby:", err);
            alert("Error al crear la sala.");
            setStep(1);
        }
    });

    const joinLobbyMutation = useMutation({
        mutationFn: async () => {
            await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/join`, {
                station_id: stationId
            });
        },
        onSuccess: () => setStep(6),
        onError: (err) => {
            console.error("Failed to join lobby:", err);
            alert("Error al unirse a la sala. Puede que esté llena o ya no exista.");
            setStep(1);
        }
    });

    useEffect(() => {
        createCheckout.mutate(paymentProvider);
    }, [paymentProvider, stationId, duration, driver?.name, selection?.scenarioId]);

    const { data: paymentStatus } = useQuery({
        queryKey: ['payment-status', paymentInfo?.id],
        queryFn: () => getPaymentStatus(paymentInfo!.id, clientTokenHeaders),
        enabled: !!paymentInfo?.id,
        refetchInterval: 2000
    });

    useEffect(() => {
        if (paymentStatus) {
            setPaymentInfo(paymentStatus);
        }
        if (paymentStatus?.status === 'paid' && !paymentHandledRef.current) {
            paymentHandledRef.current = true;
            (async () => {
                try {
                    await startSession({
                        station_id: stationId,
                        driver_name: driver?.name || undefined,
                        duration_minutes: duration,
                        price: paymentStatus.amount,
                        payment_method: paymentStatus.provider,
                        is_vr: false
                    });
                } catch (err) {
                    console.error('Error creating session:', err);
                }

                if (selection?.isLobby) {
                    if (selection.isHost) {
                        createLobbyMutation.mutate();
                    } else {
                        joinLobbyMutation.mutate();
                    }
                    return;
                }

                try {
                    await launchSessionMutation.mutateAsync(buildLaunchPayload());
                } catch (err) {
                    console.error('Error launching session:', err);
                }
            })();
        }
    }, [paymentStatus]);

    const displayAmount = paymentInfo?.amount ?? sessionPrice;
    const currency = paymentInfo?.currency || 'EUR';

    return (
        <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full">
            <h2 className="text-3xl md:text-4xl font-black text-white mb-4">{t('kiosk.paymentTitle')}</h2>
            <p className="text-gray-400 mb-6 text-center">{t('kiosk.paymentSubtitle')}</p>

            <div className="bg-gray-900/60 border border-gray-700 rounded-2xl p-6 w-full mb-6 text-left">
                <div className="flex items-center justify-between text-sm text-gray-400 uppercase font-bold">
                    <span>{t('kiosk.durationLabel')}</span>
                    <span className="text-white">{duration} min</span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-400 uppercase font-bold mt-2">
                    <span>{t('kiosk.totalLabel')}</span>
                    <span className="text-white text-2xl">€{displayAmount} {currency}</span>
                </div>
            </div>

            <div className="flex gap-4 mb-6 w-full">
                {(['stripe_qr', 'bizum'] as PaymentProvider[]).map((p) => (
                    <button
                        key={p}
                        onClick={() => {
                            setPaymentProvider(p);
                            setPaymentInfo(null);
                            setPaymentError(null);
                        }}
                        className={`flex-1 px-4 py-3 md:px-6 md:py-4 rounded-xl font-black border-2 transition-all text-sm md:text-base ${paymentProvider === p ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                    >
                        {p === 'stripe_qr' ? 'Stripe QR' : 'Bizum'}
                    </button>
                ))}
            </div>

            <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-6 w-full flex flex-col items-center gap-4">
                {paymentError && <div className="text-red-400 font-bold">{paymentError}</div>}
                {!paymentError && paymentProvider === 'stripe_qr' && paymentInfo?.checkout_url && (
                    <>
                        <QRCodeCanvas value={paymentInfo.checkout_url} size={200} level="H" />
                        <p className="text-xs text-gray-400">{t('kiosk.scanToPay')}</p>
                    </>
                )}
                {!paymentError && paymentProvider === 'bizum' && (
                    <div className="text-center text-gray-300 space-y-2">
                        <p className="font-bold">{t('kiosk.payWithBizum')}</p>
                        <p className="text-sm text-gray-400">{paymentInfo?.instructions || t('kiosk.bizumPending')}</p>
                        {paymentInfo?.reference && <div className="text-lg font-black text-white">{paymentInfo.reference}</div>}
                    </div>
                )}
                {!paymentError && paymentInfo?.status === 'pending' && <p className="text-xs text-gray-500">{t('kiosk.waitingPayment')}</p>}
            </div>

            <div className="w-full mt-6 flex gap-4">
                <button onClick={() => setStep(4)} className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700 touch-manipulation">{t('common.back')}</button>
                <button onClick={() => createCheckout.mutate(paymentProvider)} className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl touch-manipulation">{t('kiosk.retryPayment')}</button>
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
            <h2 className="text-3xl font-black text-white mb-3">Iniciando sesión</h2>
            <p className="text-gray-400">El pago está desactivado. Lanzando la sesión...</p>
        </div>
    );
};

// --- WAITING ROOM ---
interface WaitingRoomProps {
    selection: KioskSelection | null;
    stationId: number;
    setIsLaunched: (l: boolean) => void;
}

export const WaitingRoom: React.FC<WaitingRoomProps> = ({ selection, stationId, setIsLaunched }) => {
    const { data: lobbyData, refetch } = useQuery({
        queryKey: ['lobby', selection?.lobbyId],
        queryFn: () => axios.get(`${API_URL}/lobby/${selection?.lobbyId}`).then(res => res.data),
        refetchInterval: 1000,
        enabled: !!selection?.isLobby && !!selection?.lobbyId
    });

    const StartRaceMutation = useMutation({
        mutationFn: async () => {
            await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/start`, {}, {
                params: { requesting_station_id: stationId }
            });
        }
    });

    const ReadyMutation = useMutation({
        mutationFn: async (isReady: boolean) => {
            await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/ready`, {}, {
                params: { station_id: stationId, is_ready: isReady }
            });
            refetch();
        }
    });

    useEffect(() => {
        if (lobbyData?.status === 'running') setIsLaunched(true);
    }, [lobbyData?.status]);

    const isHost = stationId === lobbyData?.host_station_id;
    const myPlayer = lobbyData?.players?.find((p: any) => p.station_id === stationId);
    const isReady = myPlayer?.ready || false;

    const [timeLeft, setTimeLeft] = useState(180);

    useEffect(() => {
        if (!lobbyData?.created_at) return;
        const createdTime = new Date(lobbyData.created_at).getTime();
        const elapsed = Math.floor((new Date().getTime() - createdTime) / 1000);
        const remaining = Math.max(0, 180 - elapsed);
        setTimeLeft(remaining);

        if (remaining === 0 && isHost && lobbyData.status === 'waiting' && !StartRaceMutation.isPending) {
            StartRaceMutation.mutate();
        }
    }, [lobbyData?.created_at, lobbyData?.status, isHost]);

    const formatTime = (seconds: number) => {
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        return `${m}:${s.toString().padStart(2, '0')}`;
    };

    return (
        <div className="h-full flex flex-col items-center p-8 animate-in zoom-in duration-300 max-w-6xl mx-auto w-full text-left">
            <div className="w-full flex justify-between items-end mb-8 border-b border-gray-800 pb-6">
                <div>
                    <span className="bg-purple-600 text-white px-4 py-1 rounded-full font-bold text-sm tracking-widest mb-4 inline-block animate-pulse">SALA DE ESPERA</span>
                    <h2 className="text-5xl font-black text-white">{lobbyData?.name || 'Cargando...'}</h2>
                    <p className="text-gray-400 mt-2 font-mono text-xl">{lobbyData?.track} | {lobbyData?.car}</p>
                </div>
                <div className="text-right flex flex-col items-end">
                    <p className="text-gray-500 font-bold uppercase tracking-widest mb-1">INICIO AUTOMÁTICO EN</p>
                    <p className={`text-4xl font-black font-mono ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>{formatTime(timeLeft)}</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full flex-1 overflow-y-auto mb-8 min-h-[200px]">
                {lobbyData?.players?.map((player: any, idx: number) => {
                    const isMe = player.station_id === stationId;
                    return (
                        <div key={player.station_id} className={`p-6 rounded-2xl border-2 flex items-center justify-between ${isMe ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-800/50 border-gray-700'}`}>
                            <div className="flex items-center gap-4">
                                <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${player.ready ? 'bg-green-500 text-black' : 'bg-gray-700 text-gray-400'}`}>{idx + 1}</div>
                                <div>
                                    <p className={`font-bold text-xl ${isMe ? 'text-white' : 'text-gray-300'}`}>{player.station_name} {isMe && '(YO)'}</p>
                                    <p className="text-sm text-gray-500">Slot {player.slot}</p>
                                </div>
                            </div>
                            {player.ready ? (
                                <span className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-bold border border-green-500/50 flex items-center gap-2"><ShieldCheck size={20} /> LISTO</span>
                            ) : (
                                <span className="bg-gray-700/50 text-gray-500 px-4 py-2 rounded-lg font-bold border border-gray-600 flex items-center gap-2"><Clock size={20} /> ESPERANDO</span>
                            )}
                        </div>
                    );
                })}
            </div>

            <div className="w-full flex gap-4">
                {!isReady ? (
                    <button onClick={() => ReadyMutation.mutate(true)} className="flex-1 bg-green-600 hover:bg-green-500 text-white font-black py-6 rounded-2xl text-2xl shadow-xl shadow-green-600/20 transition-all flex items-center justify-center gap-3">
                        ESTOY LISTO <ShieldCheck size={32} />
                    </button>
                ) : (
                    <button onClick={() => ReadyMutation.mutate(false)} className="flex-1 bg-orange-600 hover:bg-orange-500 text-white font-black py-6 rounded-2xl text-2xl shadow-xl shadow-orange-600/20 transition-all flex items-center justify-center gap-3">
                        CANCELAR LISTO <Clock size={32} />
                    </button>
                )}
                {isHost && (
                    <button
                        onClick={() => StartRaceMutation.mutate()}
                        disabled={(lobbyData?.players?.length || 0) < 2}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black py-6 rounded-2xl text-2xl shadow-xl shadow-blue-600/20 transition-all flex items-center justify-center gap-3"
                    >
                        COMENZAR CARRERA <Play size={32} fill="currentColor" />
                    </button>
                )}
            </div>
        </div>
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
    }));

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        onLogin({ id: 1, name: (driverName || "Guest Driver").trim() });
    };

    return (
        <div className="flex items-center justify-center h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-5xl text-left">
                <div className="flex flex-col items-center justify-center">
                    <h1 className="text-5xl font-black text-white italic mb-2 tracking-tighter">{t('kiosk.welcomeDriver')}</h1>
                    <p className="text-xl text-gray-400 mb-8">{t('kiosk.identifyToSave')}</p>
                    <form onSubmit={handleSubmit} className="w-full max-w-lg space-y-6">
                        <div className="space-y-2">
                            <label className="text-gray-400 font-bold ml-1">{t('kiosk.driverName')}</label>
                            <input
                                type="text"
                                className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                placeholder="Ej. Max Verstappen"
                                value={driverName}
                                onChange={e => setDriverName(e.target.value)}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-gray-400 font-bold ml-1">{t('kiosk.emailOptional')}</label>
                            <input
                                type="email"
                                className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                placeholder="max@redbull.com"
                                value={driverEmail}
                                onChange={e => setDriverEmail(e.target.value)}
                            />
                        </div>
                        <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-2xl py-6 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                            {t('kiosk.start')} <ChevronRight size={32} />
                        </button>
                    </form>
                </div>
                <div className="bg-black/40 rounded-3xl border border-gray-800 p-6 backdrop-blur-sm animate-in slide-in-from-right-8 duration-700">
                    <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
                        <Trophy className="text-yellow-400" /> {t('kiosk.topTimes')}
                    </h3>
                    <div className="space-y-3 text-left">
                        {topTimes.map((entry, idx) => (
                            <div key={entry.pos} className={`flex items-center gap-4 p-3 rounded-xl transition-all ${idx === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50'}`}>
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : idx === 2 ? 'bg-orange-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                    {entry.pos}
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-white">{entry.name}</p>
                                    <p className="text-xs text-gray-500">{entry.car}</p>
                                </div>
                                <div className={`font-mono font-bold text-lg ${idx === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
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

    if (isLoading) return <div className="bg-gray-800/20 p-8 rounded-3xl border border-gray-700 animate-pulse text-center text-gray-400">Analizando telemetría...</div>;
    if (!coachAnalysis || coachAnalysis.tips.length === 0) return (
        <div className="bg-gray-800/20 p-6 rounded-3xl border border-gray-700 text-center">
            <p className="text-gray-400 italic">No hay suficientes datos para el análisis comparativo todavía.</p>
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
                                {tip.type === 'braking' ? 'Punto de frenada' : tip.type === 'apex' ? 'Velocidad en el vértice' : 'Tracción / Salida'}
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
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-blue-500 rounded-full"></div> TÚ</div>
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
    remainingSeconds, selection, driver, setIsLaunched, setStep, setDriver, setDriverName, setDriverEmail,
    noPaymentHandledRef, paymentHandledRef, stationId, clientTokenHeaders, setSelection
}) => {
    const minutes = Math.floor(remainingSeconds / 60);
    const seconds = remainingSeconds % 60;
    const isLowTime = remainingSeconds < 60;

    return (
        <div className="h-full flex flex-col animate-in fade-in duration-500">
            <div className={`text-center py-4 rounded-2xl mb-6 transition-all duration-500 ${isLowTime ? 'bg-red-600 shadow-[0_0_30px_rgba(220,38,38,0.4)] animate-[pulse_1s_cubic-bezier(0.4,0,0.6,1)_infinite]' : 'bg-blue-500/10'}`}>
                <div className={`text-7xl font-numeric font-black ${isLowTime ? 'text-white' : 'text-blue-400'}`}>
                    <Clock className={cn("inline-block mr-3 -mt-2", isLowTime ? "text-white" : "text-blue-400")} size={56} />
                    {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                </div>
                <p className={`text-sm font-black uppercase tracking-[0.3em] mt-2 ${isLowTime ? 'text-white' : 'text-gray-500'}`}>
                    {isLowTime ? '¡ÚLTIMO MINUTO - FINALIZANDO SESIÓN!' : 'TIEMPO RESTANTE'}
                </p>
            </div>

            <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h2 className="text-3xl font-black text-white">{selection?.track.toUpperCase()}</h2>
                    <p className="text-xl text-blue-400 font-bold">{driver?.name}</p>
                </div>
                <button
                    onClick={() => {
                        if (confirm("¿Finalizar sesión y volver al menú?")) {
                            setIsLaunched(false);
                            setStep(1);
                            setDriver(null);
                            setDriverName('');
                            setDriverEmail('');
                            noPaymentHandledRef.current = false;
                            paymentHandledRef.current = false;
                        }
                    }}
                    className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-6 py-3 rounded-xl border border-red-500/50 font-bold flex items-center gap-2 transition-all"
                >
                    <LogOut size={20} /> SALIR
                </button>
            </div>

            <div className="grid grid-cols-2 gap-8 flex-1">
                <div className="bg-black/40 rounded-3xl border border-gray-800 p-8 flex items-center justify-center relative overflow-hidden">
                    <div className="text-center">
                        <h3 className="text-6xl font-numeric text-white mb-2">1:45.302</h3>
                        <p className="text-green-400 font-bold text-xl uppercase tracking-widest">Mejor Vuelta</p>
                    </div>
                    <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-blue-500/10 to-transparent">
                        <svg className="w-full h-full" preserveAspectRatio="none">
                            <path d="M0,100 C150,50 300,80 450,20 L450,150 L0,150 Z" fill="rgba(59, 130, 246, 0.2)" />
                        </svg>
                    </div>
                </div>

                <div className="space-y-4">
                    <h3 className="text-xl font-bold text-gray-400 mb-2">INGENIERO DE PISTA</h3>
                    <div className="grid grid-cols-2 gap-4">
                        <button className="bg-red-900/40 border-2 border-red-600/50 hover:bg-red-600 hover:text-white text-red-400 p-6 rounded-2xl font-black text-xl transition-all">SOFT</button>
                        <button className="bg-yellow-900/40 border-2 border-yellow-600/50 hover:bg-yellow-600 hover:text-white text-yellow-400 p-6 rounded-2xl font-black text-xl transition-all">MEDIUM</button>
                        <button className="bg-white/10 border-2 border-gray-500/50 hover:bg-gray-100 hover:text-black text-gray-300 p-6 rounded-2xl font-black text-xl transition-all">HARD</button>
                        <button className="bg-blue-900/40 border-2 border-blue-600/50 hover:bg-blue-600 hover:text-white text-blue-400 p-6 rounded-2xl font-black text-xl transition-all">WET</button>
                    </div>
                    <div className="mt-8">
                        <h3 className="text-xl font-bold text-gray-400 mb-2">COMBUSTIBLE</h3>
                        <div className="flex gap-4">
                            <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700">+ 10L</button>
                            <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700">LLENAR</button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-8 border-t border-gray-800 pt-6">
                <button
                    onClick={async () => {
                        if (confirm('¿Seguro que quieres CANCELAR la sesión? El juego se cerrará.')) {
                            try {
                                await axios.post(`${API_URL}/control/station/${stationId}/panic`, null, { headers: clientTokenHeaders });
                            } catch (e) {
                                console.error('Error sending panic:', e);
                            }
                            setIsLaunched(false);
                            setStep(1);
                            setSelection(null);
                            setDriver(null);
                            setDriverName('');
                            setDriverEmail('');
                            noPaymentHandledRef.current = false;
                            paymentHandledRef.current = false;
                        }
                    }}
                    className="w-full bg-red-600/20 hover:bg-red-600 border-2 border-red-600/50 text-red-400 hover:text-white font-black text-2xl py-6 rounded-2xl transition-all flex items-center justify-center gap-4"
                >
                    <LogOut size={28} /> CANCELAR SESIÓN
                </button>
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
                <p className="text-gray-400 mt-2">Recibiendo telemetría del coche...</p>
            </div>
        );
    }

    return (
        <div className="h-full flex flex-col p-8 animate-in zoom-in duration-500 max-w-7xl mx-auto w-full">
            <div className="text-center mb-8">
                <h2 className="text-5xl font-black text-white italic tracking-tighter mb-2">RESULTADOS DE SESIÓN</h2>
                <p className="text-xl text-gray-400">{session?.track_name} • {session?.car_model}</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 flex-1 min-h-0">
                <div className="lg:col-span-1 space-y-6">
                    <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 text-center">
                        <div className="text-gray-400 font-bold mb-2">MEJOR VUELTA</div>
                        <div className="text-6xl font-numeric text-white">{formatTime(session?.best_lap || 0)}</div>
                    </div>
                    <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 flex flex-col items-center">
                        <h4 className="text-gray-400 font-bold mb-4">CONSISTENCIA</h4>
                        <div className="relative w-40 h-40 flex items-center justify-center">
                            <svg className="w-full h-full transform -rotate-90">
                                <circle cx="80" cy="80" r="70" stroke="#374151" strokeWidth="12" fill="none" />
                                <circle cx="80" cy="80" r="70" stroke="#3b82f6" strokeWidth="12" fill="none" strokeDasharray="440" strokeDashoffset={440 - (440 * (session?.consistency || 85)) / 100} strokeLinecap="round" className="transition-all duration-1000" />
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
                            <TrendingUp className="text-blue-400" /> PROGRESO DE VUELTAS
                        </h4>
                        <div className="h-64 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                    <XAxis dataKey="lap" stroke="#9ca3af" />
                                    <YAxis stroke="#9ca3af" domain={['auto', 'auto']} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '12px', color: '#fff' }} />
                                    <Line type="monotone" dataKey="time" stroke="#3b82f6" strokeWidth={4} dot={{ r: 6, fill: '#3b82f6' }} activeDot={{ r: 8 }} />
                                </LineChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                    <div className="bg-blue-600/10 border border-blue-500/30 p-8 rounded-3xl">
                        <div className="flex items-center gap-4 mb-6">
                            <div className="bg-blue-600 p-3 rounded-2xl"><Activity className="text-white" size={32} /></div>
                            <div>
                                <h3 className="text-2xl font-black text-white">AI COACH ANALYSIS</h3>
                                <p className="text-blue-400 font-bold uppercase tracking-widest text-xs">Comparativa con el récord del circuito</p>
                            </div>
                        </div>
                        <CoachSection lapId={session?.best_lap_id} />
                    </div>
                </div>
            </div>
            <div className="mt-8 flex gap-8 items-center bg-gray-900 border border-gray-800 p-6 rounded-3xl">
                <div className="bg-white p-4 rounded-xl shadow-lg">
                    <QRCodeCanvas
                        value={`${window.location.origin}/p/${encodeURIComponent(driver?.name || '')}`}
                        size={120}
                        level="H"
                        includeMargin
                    />
                </div>
                <div className="flex-1">
                    <h3 className="text-3xl font-black text-white italic uppercase tracking-tighter mb-2">¡LLEVATE TUS DATOS!</h3>
                    <p className="text-gray-400 text-lg mb-4">Escanea este código para guardar tu telemetría, comparar con tus amigos y ver tu nivel de piloto en tu móvil.</p>
                    <div className="flex gap-4">
                        <button onClick={() => window.location.reload()} className="px-8 py-4 bg-gray-800 hover:bg-gray-700 text-white font-bold rounded-2xl border border-gray-600 transition-all">
                            Cerrar Sesión
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
