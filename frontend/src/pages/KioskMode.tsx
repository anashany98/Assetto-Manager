import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';

import { useIdleTimer } from 'react-idle-timer';
import {
    ChevronLeft,
    Gauge,
    Activity,
    WifiOff,
    Footprints,
    Disc,
    AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { getCars, getTracks } from '../api/content';
import { getScenarios } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { type PaymentProvider, type PaymentStatus } from '../api/payments';

// startSession removed

import { calculatePrice, getPricingConfig } from '../utils/pricing';
import { useLanguage } from '../contexts/useLanguage';
import { resolveAssetUrl } from '../lib/utils';
import { soundManager } from '../utils/sound';
// LiveSessionMonitor import removed

// RaceMode is now used directly from KioskSteps, LiveSessionMonitor import removed if unused,
// but let's keep it if we want to switch back or use it inside RaceMode?
// No, the instruction is to REPLACE usage. I will remove the import.

import { AnimatePresence, motion } from 'framer-motion';
import {
    AttractMode, ScenarioStep, DriverStep, DifficultyStep,
    PaymentStep, NoPaymentStep, WaitingRoom, RaceMode, ResultsStep
} from './KioskSteps';
import type { KioskSelection } from './KioskSteps';

// Driver creation is handled inline for now. Backend may provide endpoint.
const baseClientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

import { ContentStep } from './KioskContentStep';
import StationPairing from '../components/StationPairing';
import {
    clearPairedStationId,
    getPairedKioskCode,
    getPairedStationId,
    setPairedStation
} from '../utils/stationPairing';

export default function KioskMode() {
    const [searchParams] = useSearchParams();

    // Station Pairing State
    const [stationId, setStationId] = useState<number>(() => getPairedStationId() || 0);
    const [showPairing, setShowPairing] = useState<boolean>(() => !getPairedStationId());
    const [pairedKioskCode, setPairedKioskCode] = useState<string | null>(() => getPairedKioskCode());
    const [pairingByCode, setPairingByCode] = useState(false);
    const [pairingCodeError, setPairingCodeError] = useState<string | null>(null);
    const pairingFromUrlAttemptedRef = useRef(false);

    const [step, setStep] = useState<number>(1);
    const [driver, setDriver] = useState<{ id: number, name: string } | null>(null);
    const [driverName, setDriverName] = useState('');
    const [driverEmail, setDriverEmail] = useState('');
    const [selection, setSelection] = useState<KioskSelection | null>(null);
    const [difficulty, setDifficulty] = useState<'novice' | 'amateur' | 'pro'>('amateur');
    const [transmission, setTransmission] = useState<'automatic' | 'manual'>('automatic');
    const [timeOfDay, setTimeOfDay] = useState<'day' | 'noon' | 'evening' | 'night'>('noon');
    const [weather, setWeather] = useState<'sun' | 'cloud' | 'rain' | 'fog'>('sun');
    const [duration, setDuration] = useState<number>(15);  // Session duration in minutes
    const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
    const [isLaunched, setIsLaunched] = useState(false);
    const [remainingSeconds, setRemainingSeconds] = useState<number>(duration * 60);

    // COUNTDOWN TIMER LOGIC
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isLaunched && remainingSeconds > 0) {
            interval = setInterval(() => {
                setRemainingSeconds(prev => Math.max(0, prev - 1));
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [isLaunched, remainingSeconds]);

    // Update remaining seconds when duration changes (only if not launched)
    useEffect(() => {
        if (!isLaunched) {
            setRemainingSeconds(duration * 60);
        }
    }, [duration, isLaunched]);

    const { language, setLanguage, t } = useLanguage();
    const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('stripe_qr');
    const [paymentInfo, setPaymentInfo] = useState<PaymentStatus | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const paymentHandledRef = useRef(false);
    const noPaymentHandledRef = useRef(false);
    const [launchingNoPayment, setLaunchingNoPayment] = useState(false);
    // lastHardwareSnapshot removed

    const clientTokenHeaders = useMemo<Record<string, string>>(() => {
        const headers: Record<string, string> = { ...baseClientTokenHeaders };
        const normalizedCode = pairedKioskCode?.trim().toUpperCase();
        if (normalizedCode) {
            headers['X-Kiosk-Code'] = normalizedCode;
        }
        return headers;
    }, [pairedKioskCode]);


    // Queries
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
        initialData: [],
        refetchInterval: 10000,
        refetchIntervalInBackground: true,
        refetchOnWindowFocus: true
    });

    // --- WALLPAPER LOGIC ---
    // (Video logic moved to AttractMode / KioskSteps to save resources when active)
    // -----------------------
    const pricingConfig = useMemo(() => getPricingConfig(settings), [settings]);
    const sessionPrice = useMemo(() => calculatePrice(duration, false, pricingConfig), [duration, pricingConfig]);
    const paymentEnabled = useMemo(() => {
        const entry = settings.find((item: any) => item.key === 'kiosk_payment_enabled');
        if (!entry) return true;
        return entry.value !== 'false' && entry.value !== '0';
    }, [settings]);

    const rainEnabled = useMemo(() => {
        const entry = settings.find((item: any) => item.key === 'kiosk_rain_enabled');
        // Default to TRUE for now if not set, or FALSE? User said "assetto doesn't have rain natively", so probably FALSE default is safer, 
        // but since they just asked for it, maybe they want to enable it. Let's default to FALSE and let them enable it.
        if (!entry) return false;
        return entry.value === 'true' || entry.value === '1';
    }, [settings]);

    const paymentNote = paymentEnabled
        ? t('kiosk.paymentNote')
            .replace('{stationId}', stationId ? String(stationId) : '')
            .replace('#{stationId}', stationId ? String(stationId) : '')
        : 'Pago desactivado. La sesion se iniciara directamente.';

    // --- RESTORED LOGIC ---
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



    const { data: hardwareStatus, isLoading: hardwareFetching, refetch: refetchHardware, isError: isHardwareError } = useQuery({
        queryKey: ['hardware', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders }).then(r => r.data),
        enabled: !!stationId,
        refetchInterval: 5000,
        retry: false
    });



    // handleUnpair removed (logic is inline)


    const isServerUnavailable = isHardwareError;
    const isStationInactive = hardwareStatus?.is_active === false;
    const isKioskDisabled = hardwareStatus?.is_kiosk_mode === false;
    const hardwareWarning = !hardwareStatus?.is_online;

    const selectedCarObj = useMemo(
        () =>
            cars.find((c: any) =>
                String(c.id) === String(selection?.car) ||
                c.model === selection?.car ||
                c.name === selection?.car
            ),
        [cars, selection]
    );
    const selectedTrackObj = useMemo(
        () =>
            tracks.find((t: any) =>
                String(t.id) === String(selection?.track) ||
                t.name === selection?.track ||
                t.layout === selection?.track
            ),
        [tracks, selection]
    );

    const { data: leaderboard = [] } = useQuery({
        queryKey: ['leaderboard', selection?.track, selection?.car],
        queryFn: () => axios.get(`${API_URL}/telemetry/leaderboard`, { params: { track: selection?.track, car: selection?.car } }).then(r => r.data),
        enabled: !!selection?.track && !!selection?.car
    });

    const buildLaunchPayload = () => {
        // Map frontend weather to backend expected values
        const weatherMap: Record<string, string> = {
            'sun': 'clear',
            'cloud': 'windy',
            'rain': 'rainy',
            'fog': 'fog'
        };

        return {
            station_id: stationId,
            car: selection?.car,
            track: selection?.track,
            weather: weatherMap[weather] || 'clear',
            time_of_day: timeOfDay,
            difficulty: difficulty,
            transmission: transmission,
            driver_name: driver?.name,
            duration_minutes: duration
        };
    };

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: any) => {
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

    const launchWithoutPayment = async () => {
        // Session launch initiated
        setLaunchingNoPayment(true);

        // HANDLE LOBBY FLOW (Torneo or Joined Lobby)
        if (selection?.isLobby) {
            try {
                if (selection.isHost) {
                    // Create Lobby
                    const res = await axios.post(`${API_URL}/lobby/create`, {
                        station_id: stationId,
                        name: `GRUPO DE ${driver?.name?.toUpperCase() || 'INVITADO'}`,
                        track: selection.track,
                        car: selection.car,
                        duration: duration,
                        max_players: 10
                    }, { headers: clientTokenHeaders });
                    const lobbyId = Number(res.data?.id ?? res.data?.lobby_id);
                    setSelection(prev => prev ? ({ ...prev, lobbyId: Number.isFinite(lobbyId) ? lobbyId : prev.lobbyId }) : null);
                    setStep(6); // Go to Waiting Room
                } else {
                    // Join Lobby
                    if (!selection.lobbyId) throw new Error("Missing Lobby ID");
                    await axios.post(`${API_URL}/lobby/${selection.lobbyId}/join`, {
                        station_id: stationId
                    }, { headers: clientTokenHeaders });
                    setStep(6); // Go to Waiting Room
                }
            } catch (e) {
                console.error("Lobby Error:", e);
                const fallback = selection.isHost
                    ? 'No se pudo crear la sala multijugador.'
                    : 'No se pudo acceder a la sala multijugador.';
                window.alert(resolveApiError(e, fallback));
            } finally {
                setLaunchingNoPayment(false);
            }
            return;
        }

        // STANDARD LAUNCH
        launchSessionMutation.mutateAsync(buildLaunchPayload())
            .catch(e => console.error(e))
            .finally(() => setLaunchingNoPayment(false));
    };
    // ---------------------


    const { data: scenarios = [] } = useQuery({
        queryKey: ['scenarios', stationId],
        queryFn: () => getScenarios(),
        enabled: !!stationId
    });
    const activeScenarios = useMemo(
        () => (Array.isArray(scenarios) ? scenarios.filter((scenario: any) => scenario?.is_active !== false) : []),
        [scenarios]
    );

    const kioskCodeFromUrl = useMemo(() => {
        const raw = searchParams.get('kiosk');
        return raw ? raw.trim().toUpperCase() : '';
    }, [searchParams]);

    useEffect(() => {
        if (!kioskCodeFromUrl || pairingFromUrlAttemptedRef.current) {
            return;
        }

        pairingFromUrlAttemptedRef.current = true;
        setPairingByCode(true);
        setPairingCodeError(null);

        axios.post(
            `${API_URL}/settings/kiosk/pair`,
            { code: kioskCodeFromUrl },
            { headers: baseClientTokenHeaders }
        )
            .then((res) => {
                const pairedId = Number(res.data?.station_id);
                if (!Number.isFinite(pairedId) || pairedId <= 0) {
                    throw new Error('Invalid station response');
                }
                setPairedStation(pairedId, kioskCodeFromUrl);
                setStationId(pairedId);
                setPairedKioskCode(kioskCodeFromUrl);
                setShowPairing(false);
            })
            .catch(() => {
                setPairingCodeError('No se pudo enlazar automaticamente con ese codigo.');
                setShowPairing(true);
            })
            .finally(() => {
                setPairingByCode(false);
            });
    }, [kioskCodeFromUrl]);


    // --- RENDER PAIRING SCREEN ---
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
                initialCode={kioskCodeFromUrl}
                errorMessage={pairingCodeError || undefined}
                onPaired={(id, kioskCode) => {
                    setStationId(id);
                    setPairedKioskCode(kioskCode?.trim().toUpperCase() || null);
                    setShowPairing(false);
                }}
            />
        );
    }

    const renderStep = () => {
        const content = (() => {
            switch (step) {
                case 1:
                    return (
                        <ScenarioStep
                            t={t}
                            scenarios={activeScenarios}
                            setSelection={setSelection}
                            setStep={setStep}
                            setSelectedScenario={setSelectedScenario}
                            setDuration={setDuration}
                        />
                    );
                case 2:
                    return (
                        <ContentStep
                            stationId={stationId}
                            selectedScenario={selectedScenario}
                            currentSelection={{ car: selection?.car || '', track: selection?.track || '' }}
                            onSelectionChange={(c, t) => setSelection(prev => prev ? { ...prev, car: c || '', track: t || '' } : null)}
                            onNext={() => setStep(3)}
                            prefetchedCars={cars}
                            prefetchedTracks={tracks}
                        />
                    );
                case 3:
                    return (
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
                case 4:
                    return (
                        <DifficultyStep
                            t={t}
                            selection={selection}
                            selectedCarObj={selectedCarObj}
                            selectedTrackObj={selectedTrackObj}
                            leaderboard={leaderboard}
                            timeOfDay={timeOfDay}
                            setTimeOfDay={setTimeOfDay}
                            weather={weather}
                            setWeather={setWeather}
                            transmission={transmission}
                            setTransmission={setTransmission}
                            difficulty={difficulty}
                            setDifficulty={setDifficulty}
                            setSelection={setSelection}
                            duration={duration}
                            paymentEnabled={paymentEnabled}
                            rainEnabled={rainEnabled}
                            setStep={setStep}
                            setPaymentInfo={setPaymentInfo}
                            setPaymentError={setPaymentError}
                            launchWithoutPayment={launchWithoutPayment}
                            launchingNoPayment={launchingNoPayment}
                            paymentNote={paymentNote}
                            paymentHandledRef={paymentHandledRef}
                            noPaymentHandledRef={noPaymentHandledRef}
                            resolveAssetUrl={resolveAssetUrl}
                        />
                    );
                case 5:
                    return paymentEnabled ? (
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
                case 6:
                    return (
                        <WaitingRoom
                            selection={selection}
                            stationId={stationId}
                            setIsLaunched={setIsLaunched}
                            clientTokenHeaders={clientTokenHeaders}
                        />
                    );
                case 7:
                    return <ResultsStep driver={driver} selection={selection} t={t} />;
                default:
                    return (
                        <ScenarioStep
                            t={t}
                            scenarios={activeScenarios}
                            setSelection={setSelection}
                            setStep={setStep}
                            setSelectedScenario={setSelectedScenario}
                            setDuration={setDuration}
                        />
                    );
            }
        })();

        return (
            <AnimatePresence mode="wait">
                <motion.div
                    key={step}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -20 }}
                    transition={{ duration: 0.3 }}
                    className="h-full w-full"
                >
                    {content}
                </motion.div>
            </AnimatePresence>
        );
    };



    if (isServerUnavailable) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="text-center max-w-xl px-6">
                    <div className="inline-flex items-center justify-center w-20 h-20 rounded-full bg-gray-500/20 text-gray-300 mb-6">
                        <WifiOff size={36} />
                    </div>
                    <h1 className="text-4xl font-black uppercase mb-3">Servidor sin conexion</h1>
                    <p className="text-gray-400 text-lg">
                        No se puede contactar con el servidor. Revisa la red o espera unos segundos.
                    </p>
                    <p className="text-gray-500 text-sm mt-2">
                        Servidor no disponible
                    </p>
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <button
                            onClick={() => refetchHardware()}
                            className="px-6 py-3 bg-red-500 hover:bg-red-400 text-black font-black uppercase tracking-widest rounded-xl"
                        >
                            {hardwareFetching ? 'Reintentando...' : 'Reintentar'}
                        </button>
                        <p className="text-xs text-gray-500">Se usa el ultimo estado local mientras vuelve el servidor.</p>
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
                    <p className="text-gray-400 text-lg">
                        Esta estacion esta desactivada. Contacta al administrador para reactivarla.
                    </p>
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
                    <p className="text-gray-400 text-lg">
                        Esta estacion no esta en modo kiosko. Activalo desde Configuracion.
                    </p>
                </div>
            </div>
        );
    }

    // If launched, show Race Mode (User View) instead of kiosk steps.
    if (isLaunched) {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-screen w-screen overflow-hidden bg-[radial-gradient(140%_140%_at_0%_0%,rgba(15,23,42,0.7),transparent_55%),linear-gradient(180deg,#020617,#020b1c)] p-2 md:p-3"
                >
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
                </motion.div>
            </AnimatePresence>
        );
    }

    return (
        <div className="kiosk-shell h-screen w-screen flex flex-col relative overflow-hidden font-racing">
            <AttractMode
                isIdle={isIdle()}
                scenarios={activeScenarios}
                t={t}
                onUnpair={() => {
                    if (window.confirm('Desvincular esta tablet del simulador?')) {
                        clearPairedStationId();
                        setPairedKioskCode(null);
                        window.location.reload();
                    }
                }}
            />
            <div className="absolute inset-0 kiosk-bg" />
            <div className="absolute inset-0 kiosk-grid opacity-30" />
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(2,6,23,0.6),rgba(2,6,23,0.85))]" />

            {true && (
                <div className="relative z-20 h-full flex flex-col p-3 md:p-5 overflow-hidden">
                    {/* TOP BAR */}
                    <div className="flex flex-col xl:flex-row justify-between xl:items-center gap-3 md:gap-4 mb-3 md:mb-4">
                        <div className="flex items-center gap-4 md:gap-6 flex-wrap">
                            {/* BACK BUTTON */}
                            {!isLaunched && step > 1 && (
                                <button
                                    onClick={() => {
                                        soundManager.playClick();
                                        setStep(step - 1);
                                    }}
                                    className="bg-slate-900/70 hover:bg-slate-800 text-white p-3 md:p-3.5 rounded-full transition-all border border-white/10 hover:border-red-400/40"
                                >
                                    <ChevronLeft size={26} />
                                </button>
                            )}
                            <div className="flex items-center gap-2.5">
                                <Gauge className="text-slate-300" size={20} />
                                <span className="text-slate-200 font-bold text-xs md:text-base tracking-widest">AC MANAGER KIOSK v2.0 - {selectedScenario?.name || 'Standard'}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-3 md:gap-4 flex-wrap">
                            {step === 1 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setLanguage('es')}
                                        className={`px-3.5 py-2.5 rounded-lg text-sm font-black border ${language === 'es' ? 'bg-red-500 border-red-400 text-black' : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-red-400/50'}`}
                                    >
                                        ES
                                    </button>
                                    <button
                                        onClick={() => setLanguage('en')}
                                        className={`px-3.5 py-2.5 rounded-lg text-sm font-black border ${language === 'en' ? 'bg-red-500 border-red-400 text-black' : 'bg-slate-900/70 border-white/10 text-slate-300 hover:border-red-400/50'}`}
                                    >
                                        EN
                                    </button>
                                </div>
                            )}
                            {/* CONNECTED INDICATORS */}
                            <div className="flex gap-2">
                                {/* AGENT STATUS */}
                                <div title={hardwareStatus?.is_online ? "Agente Online" : "Agente Offline"} className={`p-2.5 rounded-lg ${hardwareStatus?.is_online ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    <Activity size={22} className={hardwareStatus?.is_online ? "animate-pulse" : ""} />
                                </div>
                                {/* WHEEL STATUS */}
                                <div title="Volante" className={`p-2.5 rounded-lg ${hardwareStatus?.wheel_connected ? 'bg-green-500/10 text-green-500' : 'bg-slate-900 text-slate-600'}`}>
                                    <Disc size={22} className={hardwareStatus?.wheel_connected ? "animate-spin-slow" : ""} />
                                </div>
                                {/* PEDALS STATUS */}
                                <div title="Pedales" className={`p-2.5 rounded-lg ${hardwareStatus?.pedals_connected ? 'bg-green-500/10 text-green-500' : 'bg-slate-900 text-slate-600'}`}>
                                    <Footprints size={22} />
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs md:text-sm text-slate-500 font-bold uppercase">USUARIO</div>
                                <div className="text-white font-bold text-sm md:text-base">{driver ? driver.name : 'Invitado'}</div>
                            </div>
                        </div>
                    </div>

                    {hardwareWarning && (
                        <div className="mb-3 bg-red-500/10 border border-red-500/30 rounded-2xl p-3 text-red-200 font-bold text-sm flex items-center gap-3">
                            <AlertCircle size={20} />
                            <span>
                                {!hardwareStatus?.is_online && 'Agente desconectado. '}
                                {hardwareStatus?.is_online && (!hardwareStatus?.wheel_connected || !hardwareStatus?.pedals_connected) && 'Hardware no detectado: '}
                                {hardwareStatus?.is_online && !hardwareStatus?.wheel_connected && 'volante '}
                                {hardwareStatus?.is_online && !hardwareStatus?.pedals_connected && 'pedales'}
                            </span>
                        </div>
                    )}

                    <div className="flex-1 min-h-0 max-w-7xl mx-auto w-full">
                        {renderStep()}
                    </div>
                </div>
            )}
        </div>
    );
}
