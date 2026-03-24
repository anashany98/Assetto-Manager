import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useIdleTimer } from 'react-idle-timer';
import { AnimatePresence, motion } from 'framer-motion';
import { useSearchParams } from 'react-router-dom';
import { Activity, AlertCircle, Disc, Footprints, WifiOff } from 'lucide-react';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { useLanguage } from '../contexts/useLanguage';
import { getCars, getTracks, triggerContentScan } from '../api/content';
import { getScenarios } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { type PaymentProvider, type PaymentStatus } from '../api/payments';
import { startSession } from '../api/sessions';
import { calculatePrice, getPricingConfig } from '../utils/pricing';
import StationPairing from '../components/StationPairing';
import {
    clearPairedStationId,
    getPairedKioskCode,
    getPairedStationId,
    setPairedStation
} from '../utils/stationPairing';
import {
    AttractModeModern,
    ScenarioStepModern,
    DifficultyStepModern,
    WaitingRoomModern
} from './KioskStepsModern';
import { ContentStep } from './KioskContentStep';
import {
    DriverStep,
    PaymentStep,
    RaceMode,
    ResultsStep,
    NoPaymentStep,
    type KioskSelection
} from './KioskSteps';

const baseClientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

export default function KioskModern() {
    const [searchParams] = useSearchParams();
    const { t } = useLanguage();
    const queryClient = useQueryClient();

    const [stationId, setStationId] = useState<number>(() => getPairedStationId() || 0);
    const [showPairing, setShowPairing] = useState<boolean>(() => !getPairedStationId());
    const [pairedKioskCode, setPairedKioskCode] = useState<string | null>(() => getPairedKioskCode());
    const [pairingByCode, setPairingByCode] = useState(false);
    const [pairingCodeError, setPairingCodeError] = useState<string | null>(null);
    const pairingFromUrlAttemptedRef = useRef(false);

    const [step, setStep] = useState<number>(1);
    const [driver, setDriver] = useState<{ id: number; name: string } | null>(null);
    const [driverName, setDriverName] = useState('');
    const [driverEmail, setDriverEmail] = useState('');
    const [selection, setSelection] = useState<KioskSelection | null>(null);
    const [difficulty, setDifficulty] = useState<'novice' | 'amateur' | 'pro'>('amateur');
    const [transmission, setTransmission] = useState<'automatic' | 'manual'>('automatic');
    const [timeOfDay, setTimeOfDay] = useState<'day' | 'noon' | 'evening' | 'night'>('noon');
    const [weather, setWeather] = useState<'sun' | 'cloud' | 'rain' | 'fog'>('sun');
    const [duration, setDuration] = useState<number>(15);
    const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
    const [isLaunched, setIsLaunched] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState<number>(duration * 60);

    const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('stripe_qr');
    const [paymentInfo, setPaymentInfo] = useState<PaymentStatus | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const paymentHandledRef = useRef(false);
    const noPaymentHandledRef = useRef(false);
    const [launchingNoPayment, setLaunchingNoPayment] = useState(false);

    // Reset payment refs when user navigates away from payment step
    useEffect(() => {
        if (step < 5) {
            paymentHandledRef.current = false;
            noPaymentHandledRef.current = false;
        }
    }, [step]);

    const { isIdle } = useIdleTimer({
        onIdle: () => {
            if (step > 1 && !isLaunched) {
                setStep(1);
                setSelection(null);
                setDriver(null);
                setPaymentInfo(null);
            }
        },
        timeout: 90000,
        debounce: 500
    });

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

    // Auto-trigger content scan when station is paired so real AC data appears
    useEffect(() => {
        if (!stationId) return;
        triggerContentScan(stationId).catch(() => {/* agent may be offline, ignore */});
        const timer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['cars', stationId] });
            queryClient.invalidateQueries({ queryKey: ['tracks', stationId] });
        }, 8000);
        return () => clearTimeout(timer);
    }, [stationId]);

    const clientTokenHeaders = useMemo<Record<string, string>>(() => {
        const headers: Record<string, string> = { ...baseClientTokenHeaders };
        const normalizedCode = pairedKioskCode?.trim().toUpperCase();
        if (normalizedCode) {
            headers['X-Kiosk-Code'] = normalizedCode;
        }
        return headers;
    }, [pairedKioskCode]);

    const { data: cars = [] } = useQuery({
        queryKey: ['cars', stationId],
        queryFn: () => getCars(stationId),
        enabled: !!stationId
    });
    const { data: tracks = [] } = useQuery({
        queryKey: ['tracks', stationId],
        queryFn: () => getTracks(stationId),
        enabled: !!stationId
    });
    const { data: settings = [] } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(res.data) ? res.data : [];
        },
        initialData: []
    });
    const { data: hardwareStatus, isLoading: hardwareFetching, refetch: refetchHardware, isError: isHardwareError } = useQuery({
        queryKey: ['hardware-modern', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders }).then((r) => r.data),
        enabled: !!stationId,
        refetchInterval: 5000,
        retry: false,
    });

    const { data: scenarios = [] } = useQuery({
        queryKey: ['scenarios', stationId],
        queryFn: () => getScenarios(),
        enabled: !!stationId
    });

    const simModsEnabled = useMemo(() => {
        const entry = settings.find((item: any) => item.key === 'sim_mods_enabled');
        return entry?.value === 'true' || entry?.value === '1';
    }, [settings]);

    const activeScenarios = useMemo(() => {
        if (!Array.isArray(scenarios)) return [];
        return scenarios.filter((scenario: any) => {
            if (scenario?.is_active === false) return false;
            if (!simModsEnabled) {
                const type = (scenario?.session_type || '').toLowerCase();
                if (type === 'traffic' || type === 'overtake') return false;
            }
            return true;
        });
    }, [scenarios, simModsEnabled]);

    const pricingConfig = useMemo(() => getPricingConfig(settings), [settings]);
    const sessionPrice = useMemo(() => calculatePrice(duration, false, pricingConfig), [duration, pricingConfig]);
    const paymentEnabled = useMemo(() => {
        const entry = settings.find((item: any) => item.key === 'kiosk_payment_enabled');
        if (!entry) return true;
        return entry.value !== 'false' && entry.value !== '0';
    }, [settings]);
    const rainEnabled = useMemo(() => {
        if (!simModsEnabled) return false;
        const entry = settings.find((item: any) => item.key === 'kiosk_rain_enabled');
        if (!entry) return false;
        return entry.value === 'true' || entry.value === '1';
    }, [settings, simModsEnabled]);

    const { data: leaderboard = [] } = useQuery({
        queryKey: ['leaderboard', selection?.track, selection?.car],
        queryFn: () => axios.get(`${API_URL}/telemetry/leaderboard`, { params: { track: selection?.track, car: selection?.car } }).then((r) => r.data),
        enabled: !!selection?.track && !!selection?.car
    });

    const buildLaunchPayload = () => {
        const weatherMap: Record<string, string> = {
            sun: 'clear',
            cloud: 'windy',
            rain: 'rainy',
            fog: 'fog'
        };
        return {
            station_id: stationId,
            car: selection?.car,
            track: selection?.track,
            weather: weatherMap[weather] || 'clear',
            time_of_day: timeOfDay,
            difficulty,
            transmission,
            driver_name: driver?.name,
            duration_minutes: duration,
            session_type: selection?.type || 'practice'
        };
    };

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: ReturnType<typeof buildLaunchPayload>) => {
            await axios.post(`${API_URL}/control/station/${payload.station_id}/launch`, payload, { headers: clientTokenHeaders });
        },
        onSuccess: () => setIsLaunched(true)
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
        setPaymentInfo(null);
        setPaymentError(null);
        setStep(1);
        paymentHandledRef.current = false;
        noPaymentHandledRef.current = false;
    };

    const ensureSessionRecord = async () => {
        await startSession({
            station_id: stationId,
            driver_name: driver?.name || undefined,
            duration_minutes: duration,
            price: sessionPrice,
            payment_method: 'cash',
            is_vr: false,
            notes: paymentEnabled ? 'kiosk_session' : 'kiosk_no_payment',
        }, { headers: clientTokenHeaders });
    };

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const payload = {
                station_id: stationId,
                driver_name: driver?.name || undefined,
                name: `GRUPO DE ${driver?.name?.toUpperCase() || 'INVITADO'}`,
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
            setSelection((prev) => (prev ? { ...prev, lobbyId: Number.isFinite(lobbyId) ? lobbyId : prev.lobbyId } : prev));
            setPaymentError(null);
            setStep(6);
            setLaunchingNoPayment(false);
        },
        onError: (error) => {
            const message = resolveApiError(error, 'No se pudo crear la sala multijugador.');
            setPaymentError(message);
            setLaunchingNoPayment(false);
            window.alert(message);
        }
    });

    const joinLobbyMutation = useMutation({
        mutationFn: async () => {
            if (!selection?.lobbyId) throw new Error('Missing lobby id');
            await axios.post(
                `${API_URL}/lobby/${selection.lobbyId}/join`,
                { station_id: stationId, driver_name: driver?.name || undefined },
                { headers: clientTokenHeaders }
            );
        },
        onSuccess: () => {
            setPaymentError(null);
            setStep(6);
            setLaunchingNoPayment(false);
        },
        onError: (error) => {
            const message = resolveApiError(error, 'No se pudo acceder a la sala multijugador.');
            setPaymentError(message);
            setLaunchingNoPayment(false);
            window.alert(message);
        }
    });

    const launchWithoutPayment = async () => {
        if (launchingNoPayment) return;
        setLaunchingNoPayment(true);
        try {
            await ensureSessionRecord();
        } catch (error) {
            const message = resolveApiError(error, 'No se pudo registrar la sesion del kiosko.');
            setPaymentError(message);
            setLaunchingNoPayment(false);
            window.alert(message);
            return;
        }

        if (selection?.isLobby) {
            if (selection.isHost) createLobbyMutation.mutate();
            else joinLobbyMutation.mutate();
            return;
        }

        launchSessionMutation
            .mutateAsync(buildLaunchPayload())
            .catch((error) => {
                const message = resolveApiError(error, 'No se pudo lanzar la sesion.');
                setPaymentError(message);
                window.alert(message);
            })
            .finally(() => setLaunchingNoPayment(false));
    };

    const kioskCodeFromUrl = useMemo(() => {
        const raw = searchParams.get('kiosk');
        return raw ? raw.trim().toUpperCase() : '';
    }, [searchParams]);

    useEffect(() => {
        if (!kioskCodeFromUrl || pairingFromUrlAttemptedRef.current) return;

        pairingFromUrlAttemptedRef.current = true;
        setPairingByCode(true);
        setPairingCodeError(null);

        axios
            .post(`${API_URL}/settings/kiosk/pair`, { code: kioskCodeFromUrl }, { headers: baseClientTokenHeaders })
            .then((res) => {
                const pairedId = Number(res.data?.station_id);
                if (!Number.isFinite(pairedId) || pairedId <= 0) {
                    throw new Error('Invalid station response');
                }
                setPairedStation(pairedId, kioskCodeFromUrl);
                setStationId(pairedId);
                setPairedKioskCode(kioskCodeFromUrl);
                setShowPairing(false);
                setPairingCodeError(null);
            })
            .catch(() => {
                setPairingCodeError('No se pudo enlazar automaticamente con ese codigo.');
                setShowPairing(true);
            })
            .finally(() => {
                setPairingByCode(false);
            });
    }, [kioskCodeFromUrl]);

    const handleUnpair = () => {
        if (!window.confirm('Desvincular esta tablet del simulador?')) return;
        clearPairedStationId();
        setPairedKioskCode(null);
        setStationId(0);
        setShowPairing(true);
        setSelection(null);
        setDriver(null);
        setStep(1);
    };

    if (pairingByCode) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center px-6">
                    <div className="text-4xl font-black uppercase tracking-tight mb-2">Enlazando tablet</div>
                    <p className="text-gray-400">Validando codigo de kiosko...</p>
                </div>
            </div>
        );
    }

    if (showPairing || !stationId) {
        return (
            <StationPairing
                initialCode={kioskCodeFromUrl || undefined}
                errorMessage={pairingCodeError || undefined}
                onPaired={(id, kioskCode) => {
                    setStationId(id);
                    setPairedKioskCode(kioskCode?.trim().toUpperCase() || null);
                    setShowPairing(false);
                    setPairingCodeError(null);
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
                    driver={driver}
                    transmission={transmission}
                    setIsLaunched={setIsLaunched}
                    setStep={setStep}
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

    const renderStep = () => {
        let content: ReactNode = null;

        switch (step) {
            case 1:
                content = (
                    <ScenarioStepModern
                        t={t}
                        scenarios={activeScenarios}
                        setSelection={setSelection}
                        setStep={setStep}
                        setSelectedScenario={setSelectedScenario}
                        setDuration={setDuration}
                    />
                );
                break;
            case 2:
                content = (
                    <ContentStep
                        stationId={stationId}
                        selectedScenario={selectedScenario}
                        currentSelection={{ car: selection?.car || '', track: selection?.track || '' }}
                        onSelectionChange={(carId, trackId) =>
                            setSelection((prev) => ({
                                ...(prev || { type: 'practice' }),
                                car: carId || '',
                                track: trackId || ''
                            }))
                        }
                        onNext={() => setStep(3)}
                        prefetchedCars={cars}
                        prefetchedTracks={tracks}
                    />
                );
                break;
            case 3:
                content = (
                    <DriverStep
                        t={t}
                        driverName={driverName}
                        setDriverName={setDriverName}
                        driverEmail={driverEmail}
                        setDriverEmail={setDriverEmail}
                        onLogin={(d) => {
                            setDriver(d);
                            setStep(4);
                        }}
                        selection={selection}
                        leaderboardData={leaderboard}
                    />
                );
                break;
            case 4:
                content = (
                    <DifficultyStepModern
                        t={t}
                        selection={selection}
                        difficulty={difficulty}
                        setDifficulty={setDifficulty}
                        transmission={transmission}
                        setTransmission={setTransmission}
                        setStep={setStep}
                        launchWithoutPayment={launchWithoutPayment}
                        paymentEnabled={paymentEnabled}
                        setPaymentInfo={setPaymentInfo}
                        setPaymentError={setPaymentError}
                        launchingNoPayment={launchingNoPayment}
                        weather={weather}
                        setWeather={setWeather}
                        timeOfDay={timeOfDay}
                        setTimeOfDay={setTimeOfDay}
                        rainEnabled={rainEnabled}
                    />
                );
                break;
            case 5:
                content = paymentEnabled ? (
                    <PaymentStep
                        t={t}
                        stationId={stationId}
                        duration={duration}
                        driver={driver}
                        selection={selection}
                        setSelection={setSelection}
                        paymentProvider={paymentProvider}
                        setPaymentProvider={setPaymentProvider}
                        paymentInfo={paymentInfo}
                        setPaymentInfo={setPaymentInfo}
                        paymentError={paymentError}
                        setPaymentError={setPaymentError}
                        clientTokenHeaders={clientTokenHeaders}
                        sessionPrice={sessionPrice}
                        paymentHandledRef={paymentHandledRef}
                        setStep={setStep}
                        launchSessionMutation={launchSessionMutation}
                        buildLaunchPayload={buildLaunchPayload}
                    />
                ) : (
                    <NoPaymentStep
                        paymentEnabled={paymentEnabled}
                        launchWithoutPayment={launchWithoutPayment}
                        selection={selection}
                        stationId={stationId}
                    />
                );
                break;
            case 6:
                content = (
                    <WaitingRoomModern
                        selection={selection}
                        stationId={stationId}
                        setIsLaunched={setIsLaunched}
                        clientTokenHeaders={clientTokenHeaders}
                        onExitLobby={resetKioskFlow}
                    />
                );
                break;
            case 7:
                content = <ResultsStep driver={driver} selection={selection} t={t} />;
                break;
            default:
                content = (
                    <ScenarioStepModern
                        t={t}
                        scenarios={activeScenarios}
                        setSelection={setSelection}
                        setStep={setStep}
                        setSelectedScenario={setSelectedScenario}
                        setDuration={setDuration}
                    />
                );
                break;
        }

        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ duration: 0.4, ease: 'circOut' }}
                    className="h-full w-full"
                >
                    {content}
                </motion.div>
            </AnimatePresence>
        );
    };

    return (
        <div className="kiosk-shell h-screen w-screen overflow-hidden flex flex-col font-racing">
            <div className="absolute inset-0 kiosk-bg" />
            <div className="absolute inset-0 kiosk-grid opacity-25" />
            <div className="h-16 md:h-20 flex items-center justify-between px-4 md:px-8 border-b border-white/10 z-50 bg-slate-950/55 backdrop-blur-md">
                <img src="/logo.png" alt="Logo" className="h-8 md:h-10 opacity-85" />

                <div className="hidden md:flex gap-3 text-[10px] md:text-xs font-bold uppercase tracking-[0.2em] text-slate-500">
                    <span className={step === 1 ? 'text-white' : ''}>Modo</span>
                    <span className="opacity-20">/</span>
                    <span className={step === 2 ? 'text-white' : ''}>Contenido</span>
                    <span className="opacity-20">/</span>
                    <span className={step === 3 ? 'text-white' : ''}>Piloto</span>
                    <span className="opacity-20">/</span>
                    <span className={step === 4 ? 'text-white' : ''}>Config</span>
                    <span className="opacity-20">/</span>
                    <span className={step === 5 ? 'text-white' : ''}>Pago</span>
                    <span className="opacity-20">/</span>
                    <span className={step === 6 ? 'text-amber-300' : ''}>Lobby</span>
                </div>

                <div className="text-right">
                    <div className="text-[10px] md:text-xs text-slate-300 font-bold">ESTACION {stationId}</div>
                    <button
                        type="button"
                        onClick={handleUnpair}
                        className="text-[10px] text-slate-500 hover:text-slate-200"
                    >
                        DESVINCULAR
                    </button>
                </div>
            </div>

            {hardwareWarning && (
                <div className="absolute top-20 md:top-24 right-4 md:right-8 z-30 flex items-center gap-2 rounded-2xl border border-red-400/30 bg-red-500/10 px-3 py-2 text-xs font-bold text-red-100">
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
                        {hardwareStatus?.is_online && (!hardwareStatus?.wheel_connected || !hardwareStatus?.pedals_connected) && 'Hardware no detectado.'}
                    </span>
                </div>
            )}

            <div className="flex-1 relative overflow-hidden z-10">
                <AttractModeModern isIdle={isIdle()} t={t} onUnpair={handleUnpair} />
                {renderStep()}
            </div>
        </div>
    );
}
