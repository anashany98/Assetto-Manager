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
import { Wifi, Cpu, WifiOff, AlertCircle, Activity, Disc, Footprints } from 'lucide-react';
import { getScenarios } from '../api/scenarios';
import { getCars, getTracks } from '../api/content';
import { startSession } from '../api/sessions';
import StationPairing from '../components/StationPairing';
import {
    clearPairedStationId,
    getPairedKioskCode,
    getPairedStationId
} from '../utils/stationPairing';
import { RaceMode, ResultsStep } from './KioskSteps';

const baseClientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

export default function KioskRacing() {
    const { t } = useLanguage();
    const [step, setStep] = useState(0);
    const [isIdle, setIsIdle] = useState(true);
    const [selection, setSelection] = useState<KioskSelection | null>(null);
    const [duration, setDuration] = useState(10);
    const [difficulty, setDifficulty] = useState('amateur');
    const [transmission, setTransmission] = useState('automatic');
    const weather = 'sun' as const;
    const timeOfDay = 'noon' as const;

    const weatherMap: Record<string, string> = {
        sun: 'clear', cloud: 'windy', rain: 'rainy', fog: 'fog',
    };
    const [stationId, setStationId] = useState<number>(() => getPairedStationId() || 0);
    const [showPairing, setShowPairing] = useState<boolean>(() => !getPairedStationId());
    const [pairedKioskCode, setPairedKioskCode] = useState<string | null>(() => getPairedKioskCode());
    const [launchingNoPayment, setLaunchingNoPayment] = useState(false);
    const [driver, setDriver] = useState<{ id: number; name: string } | null>(null);
    const [driverName, setDriverName] = useState('');
    const [driverEmail, setDriverEmail] = useState('');
    const [isLaunched, setIsLaunched] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState<number>(duration * 60);
    const paymentHandledRef = useRef(false);
    const noPaymentHandledRef = useRef(false);

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
    const { data: cars = [] } = useQuery({
        queryKey: ['cars-racing', stationId],
        queryFn: () => getCars(stationId),
        enabled: !!stationId,
    });
    const { data: tracks = [] } = useQuery({
        queryKey: ['tracks-racing', stationId],
        queryFn: () => getTracks(stationId),
        enabled: !!stationId,
    });
    const { data: hardwareStatus, isLoading: hardwareFetching, refetch: refetchHardware, isError: isHardwareError } = useQuery({
        queryKey: ['hardware-racing', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders }).then((r) => r.data),
        enabled: !!stationId,
        refetchInterval: 5000,
        retry: false,
    });
    const activeDriver = useMemo(
        () => driver ?? { id: stationId || 0, name: `Racer ${stationId || 'Guest'}` },
        [driver, stationId],
    );

    const resetIdleTimer = () => {
        if (idleTimeoutRef.current) clearTimeout(idleTimeoutRef.current);
        if (!isIdle && !isLaunched) {
            idleTimeoutRef.current = setTimeout(() => {
                setStep(0);
                setIsIdle(true);
                setSelection(null);
                setDriver(null);
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
    }, [isIdle, isLaunched]);

    useEffect(() => {
        let interval: NodeJS.Timeout | undefined;
        if (isLaunched && remainingSeconds > 0) {
            interval = setInterval(() => {
                setRemainingSeconds((prev) => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isLaunched, remainingSeconds]);

    useEffect(() => {
        if (!isLaunched) {
            setRemainingSeconds(duration * 60);
        }
    }, [duration, isLaunched]);

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
        setDriver(null);
        setStep(0);
        setIsIdle(true);
        setIsLaunched(false);
    };

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: any) => axios.post(`${API_URL}/control/station/${stationId}/launch`, payload, { headers: clientTokenHeaders }),
        onSuccess: () => {
            setLaunchingNoPayment(false);
            setIsLaunched(true);
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
    const isServerUnavailable = isHardwareError;
    const isStationInactive = hardwareStatus?.is_active === false;
    const isKioskDisabled = hardwareStatus?.is_kiosk_mode === false;
    const hardwareWarning = Boolean(
        hardwareStatus && (
            hardwareStatus.is_online === false
            || !hardwareStatus.wheel_connected
            || !hardwareStatus.pedals_connected
        )
    );

    const resetKioskFlow = () => {
        setIsLaunched(false);
        setLaunchingNoPayment(false);
        setSelection(null);
        setDriver(null);
        setDriverName('');
        setDriverEmail('');
        setStep(0);
        setIsIdle(true);
        paymentHandledRef.current = false;
        noPaymentHandledRef.current = false;
    };

    const ensureSessionRecord = async () => {
        await startSession({
            station_id: stationId,
            driver_name: activeDriver.name,
            duration_minutes: duration,
            payment_method: 'cash',
            is_vr: false,
            notes: 'kiosk_racing',
        }, { headers: clientTokenHeaders });
    };

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                station_id: stationId,
                driver_name: activeDriver.name,
                name: `RACE LOBBY ${stationId}`,
                track: selection?.track,
                track_layout: selection?.track_layout,
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
            await axios.post(
                `${API_URL}/lobby/${selection.lobbyId}/join`,
                { station_id: stationId, driver_name: activeDriver.name },
                { headers: clientTokenHeaders }
            );
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
        if (launchingNoPayment) return;
        setLaunchingNoPayment(true);
        setDriver(activeDriver);
        try {
            await ensureSessionRecord();
        } catch (error) {
            alert(resolveApiError(error, 'No se pudo registrar la sesion del kiosko.'));
            setLaunchingNoPayment(false);
            return;
        }

        if (selection?.isLobby) {
            if (selection.isHost) createLobbyMutation.mutate();
            else joinLobbyMutation.mutate();
            return;
        }

        const payload = {
            car: selection?.car,
            track: selection?.track,
            weather: weatherMap[weather] ?? 'clear',
            time_of_day: timeOfDay,
            difficulty,
            transmission,
            duration_minutes: duration,
            driver_name: activeDriver.name,
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

    if (isServerUnavailable) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center max-w-xl px-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-500/20 text-gray-300 mb-6">
                        <WifiOff size={36} />
                    </div>
                    <h1 className="text-4xl font-black uppercase mb-3">Servidor sin conexion</h1>
                    <p className="text-gray-400 text-lg">No se puede contactar con el servidor. Revisa la red o espera unos segundos.</p>
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <button
                            onClick={() => refetchHardware()}
                            className="px-6 py-3 bg-red-500 hover:bg-red-400 text-black font-black uppercase tracking-widest rounded-xl"
                        >
                            {hardwareFetching ? 'Reintentando...' : 'Reintentar'}
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    if (isStationInactive) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center max-w-xl px-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-red-500/20 text-red-400 mb-6">
                        <AlertCircle size={36} />
                    </div>
                    <h1 className="text-4xl font-black uppercase mb-3">Servidor Inactivo</h1>
                    <p className="text-gray-400 text-lg">Esta estacion esta desactivada. Contacta al administrador para reactivarla.</p>
                </div>
            </div>
        );
    }

    if (isKioskDisabled) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center max-w-xl px-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-yellow-500/20 text-yellow-400 mb-6">
                        <AlertCircle size={36} />
                    </div>
                    <h1 className="text-4xl font-black uppercase mb-3">Kiosko desactivado</h1>
                    <p className="text-gray-400 text-lg">Esta estacion no esta en modo kiosko. Activalo desde Configuracion.</p>
                </div>
            </div>
        );
    }

    if (isLaunched) {
        return (
            <div className="h-screen w-screen overflow-hidden bg-[radial-gradient(140%_140%_at_0%_0%,rgba(15,23,42,0.7),transparent_55%),linear-gradient(180deg,#020617,#020b1c)] p-2 md:p-3">
                <RaceMode
                    remainingSeconds={remainingSeconds}
                    selection={selection}
                    driver={activeDriver}
                    transmission={transmission}
                    setIsLaunched={setIsLaunched}
                    setStep={(nextStep) => {
                        if (nextStep === 1) {
                            setStep(0);
                            setIsIdle(true);
                            return;
                        }
                        setStep(nextStep);
                    }}
                    setDriver={setDriver}
                    setDriverName={setDriverName}
                    setDriverEmail={setDriverEmail}
                    noPaymentHandledRef={noPaymentHandledRef}
                    paymentHandledRef={paymentHandledRef}
                    stationId={stationId}
                    clientTokenHeaders={clientTokenHeaders}
                    setSelection={setSelection}
                />
            </div>
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

                    {hardwareWarning && (
                        <div className="mx-4 md:mx-8 mt-3 rounded-2xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-xs font-bold text-red-100 flex items-center gap-3">
                            <div className={`p-2 rounded-lg ${hardwareStatus?.is_online ? 'bg-green-500/10 text-green-400' : 'bg-red-500/10 text-red-400'}`}>
                                <Activity size={16} />
                            </div>
                            <div className={`p-2 rounded-lg ${hardwareStatus?.wheel_connected ? 'bg-green-500/10 text-green-400' : 'bg-slate-900 text-slate-500'}`}>
                                <Disc size={16} />
                            </div>
                            <div className={`p-2 rounded-lg ${hardwareStatus?.pedals_connected ? 'bg-green-500/10 text-green-400' : 'bg-slate-900 text-slate-500'}`}>
                                <Footprints size={16} />
                            </div>
                            <span>
                                {!hardwareStatus?.is_online && 'Agente desconectado. '}
                                {hardwareStatus?.is_online && (!hardwareStatus?.wheel_connected || !hardwareStatus?.pedals_connected) && 'Hardware no detectado: '}
                                {hardwareStatus?.is_online && !hardwareStatus?.wheel_connected && 'volante '}
                                {hardwareStatus?.is_online && !hardwareStatus?.pedals_connected && 'pedales'}
                            </span>
                        </div>
                    )}

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
                                setIsLaunched={setIsLaunched}
                                onExitLobby={resetKioskFlow}
                            />
                        )}
                        {step === 7 && (
                            <ResultsStep
                                driver={activeDriver}
                                selection={selection}
                                t={t}
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
