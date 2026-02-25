import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { soundManager } from '../utils/sound';
import { useLanguage } from '../contexts/useLanguage';
import type { KioskSelection } from './KioskStepsModern';
import {
    AttractModeRacing,
    ScenarioStepRacing,
    ContentStepRacing,
    DifficultyStepRacing,
    WaitingRoomRacing
} from './KioskStepsRacing';
import { Wifi, Cpu } from 'lucide-react';
import { getScenarios } from '../api/scenarios';
import { getAllGlobalCars, getAllGlobalTracks } from '../api/content';
import StationPairing from '../components/StationPairing';
import {
    clearPairedStationId,
    getPairedKioskCode,
    getPairedStationId
} from '../utils/stationPairing';

const baseClientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

export default function KioskRacing() {
    const { t } = useLanguage();
    const [step, setStep] = useState(0);
    const [isIdle, setIsIdle] = useState(true);
    const [selection, setSelection] = useState<KioskSelection | null>(null);
    const [duration, setDuration] = useState(10);
    const [difficulty, setDifficulty] = useState('amateur');
    const [transmission, setTransmission] = useState('automatic');
    const [stationId, setStationId] = useState<number>(() => getPairedStationId() || 0);
    const [showPairing, setShowPairing] = useState<boolean>(() => !getPairedStationId());
    const [pairedKioskCode, setPairedKioskCode] = useState<string | null>(() => getPairedKioskCode());
    const [launchingNoPayment, setLaunchingNoPayment] = useState(false);

    const idleTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    const clientTokenHeaders = useMemo<Record<string, string>>(() => {
        const headers: Record<string, string> = { ...baseClientTokenHeaders };
        const normalizedCode = pairedKioskCode?.trim().toUpperCase();
        if (normalizedCode) {
            headers['X-Kiosk-Code'] = normalizedCode;
        }
        return headers;
    }, [pairedKioskCode]);

    const { data: scenarios = [] } = useQuery({
        queryKey: ['scenarios'],
        queryFn: getScenarios
    });
    const activeScenarios = useMemo(
        () => (Array.isArray(scenarios) ? scenarios.filter((scenario: any) => scenario?.is_active !== false) : []),
        [scenarios]
    );
    const { data: cars = [] } = useQuery({ queryKey: ['cars'], queryFn: getAllGlobalCars });
    const { data: tracks = [] } = useQuery({ queryKey: ['tracks'], queryFn: getAllGlobalTracks });

    const resetIdleTimer = () => {
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        if (!isIdle) {
            idleTimeoutRef.current = setTimeout(() => {
                setStep(0);
                setIsIdle(true);
                setSelection(null);
            }, 60000);
        }
    };

    useEffect(() => {
        window.addEventListener('click', resetIdleTimer);
        window.addEventListener('touchstart', resetIdleTimer);
        return () => {
            window.removeEventListener('click', resetIdleTimer);
            window.removeEventListener('touchstart', resetIdleTimer);
            if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        };
    }, [isIdle]);

    const handleStart = () => {
        soundManager.playConfirm();
        if (!stationId) {
            setShowPairing(true);
            return;
        }
        setIsIdle(false);
        setStep(1);
    };

    const handleUnpair = () => {
        if (!window.confirm('SYSTEM OVERRIDE: UNPAIR STATION?')) return;
        clearPairedStationId();
        setPairedKioskCode(null);
        setStationId(0);
        setShowPairing(true);
        setSelection(null);
        setStep(0);
        setIsIdle(true);
    };

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: any) => axios.post(`${API_URL}/control/station/${stationId}/launch`, payload, { headers: clientTokenHeaders }),
        onSuccess: () => {
            setLaunchingNoPayment(false);
            setSelection(null);
            setStep(0);
            setIsIdle(true);
        },
        onError: (error) => {
            const message = resolveApiError(error, 'SESSION LAUNCH FAILED');
            alert(message);
            setLaunchingNoPayment(false);
        }
    });

    const resolveApiError = (error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const detail = (error.response?.data as any)?.detail;
            if (typeof detail === 'string' && detail.trim()) return detail;
        }
        return fallback;
    };

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                station_id: stationId,
                name: `RACE LOBBY ${stationId}`,
                track: selection?.track,
                car: selection?.car,
                duration,
                max_players: 10
            };
            const res = await axios.post(`${API_URL}/lobby/create`, payload, { headers: clientTokenHeaders });
            return res.data;
        },
        onSuccess: (data) => {
            const lobbyId = Number(data?.id ?? data?.lobby_id);
            setSelection((prev: any) => ({ ...prev, lobbyId: Number.isFinite(lobbyId) ? lobbyId : prev?.lobbyId }));
            setStep(6);
            setLaunchingNoPayment(false);
        },
        onError: (error) => {
            alert(resolveApiError(error, 'No se pudo crear la sala multijugador.'));
            setLaunchingNoPayment(false);
        }
    });

    const joinLobbyMutation = useMutation({
        mutationFn: async () => {
            if (!selection?.lobbyId) throw new Error('Missing lobby id');
            await axios.post(`${API_URL}/lobby/${selection.lobbyId}/join`, { station_id: stationId }, { headers: clientTokenHeaders });
        },
        onSuccess: () => {
            setStep(6);
            setLaunchingNoPayment(false);
        },
        onError: (error) => {
            alert(resolveApiError(error, 'No se pudo acceder a la sala multijugador.'));
            setLaunchingNoPayment(false);
        }
    });

    const launchWithoutPayment = async () => {
        setLaunchingNoPayment(true);
        if (selection?.isLobby) {
            if (selection.isHost) createLobbyMutation.mutate();
            else joinLobbyMutation.mutate();
            return;
        }

        const payload = {
            car: selection?.car,
            track: selection?.track,
            weather: 'sun',
            time_of_day: 'noon',
            difficulty,
            transmission,
            duration_minutes: duration,
            driver_name: `Racer ${stationId}`,
            session_type: selection?.type || 'practice'
        };

        launchSessionMutation.mutate(payload);
    };

    if (showPairing || !stationId) {
        return (
            <StationPairing
                onPaired={(id, kioskCode) => {
                    setStationId(id);
                    setPairedKioskCode(kioskCode?.trim().toUpperCase() || null);
                    setShowPairing(false);
                }}
            />
        );
    }

    return (
        <div className="kiosk-shell min-h-screen text-white font-racing overflow-hidden relative">
            <div className="absolute inset-0 kiosk-bg z-0" />
            <div className="absolute inset-0 kiosk-grid opacity-20 z-0" />
            <div className="absolute inset-0 racing-stripe opacity-5 z-0" />

            <AttractModeRacing isIdle={isIdle} t={t} onUnpair={handleUnpair} />

            {!isIdle && (
                <div className="relative z-10 w-full h-screen flex flex-col">
                    <header className="h-14 md:h-16 bg-slate-950/80 border-b border-white/10 flex items-center justify-between px-4 md:px-8 backdrop-blur-md">
                        <div className="flex items-center gap-4">
                            <img src="/logo.png" alt="Logo" className="h-7 md:h-8 brightness-0 invert" />
                            <div className="h-8 w-px bg-white/20" />
                            <div className="text-xs text-neon-blue font-mono tracking-widest flex items-center gap-2">
                                <Wifi size={14} className="animate-pulse" /> NETWORK_ONLINE
                            </div>
                        </div>

                        <div className="hidden md:flex items-center gap-8">
                            <div className="text-right">
                                <div className="text-[10px] text-gray-500 font-mono">STATION_ID</div>
                                <div className="text-xl font-bold italic leading-none text-white">#{stationId.toString().padStart(2, '0')}</div>
                            </div>
                            <div className="h-8 w-px bg-white/20" />
                            <div className="text-right">
                                <div className="text-[10px] text-gray-500 font-mono">CPU_LOAD</div>
                                <div className="text-xl font-bold italic leading-none text-racing-green flex items-center gap-2">
                                    <Cpu size={16} /> 12%
                                </div>
                            </div>
                        </div>
                    </header>

                    <main className="flex-1 relative overflow-hidden">
                        {step === 0 && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                <div className="text-gray-800 text-9xl font-black italic opacity-20">SYSTEM STANDBY</div>
                            </div>
                        )}
                        {step === 1 && (
                            <ScenarioStepRacing
                                t={t}
                                scenarios={activeScenarios}
                                setSelection={setSelection}
                                setStep={setStep}
                                setDuration={setDuration}
                            />
                        )}
                        {step === 2 && (
                            <ContentStepRacing
                                cars={cars}
                                tracks={tracks}
                                selection={selection}
                                setSelection={setSelection}
                                setStep={setStep}
                            />
                        )}
                        {step === 4 && (
                            <DifficultyStepRacing
                                difficulty={difficulty}
                                setDifficulty={setDifficulty}
                                transmission={transmission}
                                setTransmission={setTransmission}
                                setStep={setStep}
                                launchWithoutPayment={launchWithoutPayment}
                                launchingNoPayment={launchingNoPayment}
                            />
                        )}
                        {step === 6 && (
                            <WaitingRoomRacing
                                selection={selection}
                                stationId={stationId}
                                clientTokenHeaders={clientTokenHeaders}
                                setIsLaunched={(launched) => {
                                    if (!launched) return;
                                    setSelection(null);
                                    setStep(0);
                                    setIsIdle(true);
                                }}
                            />
                        )}
                    </main>

                    <footer className="h-10 md:h-12 bg-slate-950/85 border-t border-racing-red/20 flex items-center justify-between px-4 md:px-8 text-[9px] md:text-[10px] text-gray-600 font-mono uppercase tracking-widest">
                        <div>AC_MANAGER_V2.0 // RACING_KERNEL_ACTIVE</div>
                        <div className="flex gap-4">
                            <span>TIRE_TEMP: COLD</span>
                            <span>TRACK_TEMP: 24C</span>
                        </div>
                    </footer>
                </div>
            )}

            {isIdle && (
                <div className="absolute inset-0 z-50 cursor-pointer" onClick={handleStart} />
            )}
        </div>
    );
}
