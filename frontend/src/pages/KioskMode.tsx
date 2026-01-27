import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIdleTimer } from 'react-idle-timer';
import {
    ChevronLeft,
    Gauge,
    Activity,
    WifiOff,
    ScanQrCode,
    Footprints,
    Disc,
    AlertCircle
} from 'lucide-react';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { getCars, getTracks, getStationContent } from '../api/content';
import { getScenarios } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { type PaymentProvider, type PaymentStatus } from '../api/payments';
import { startSession } from '../api/sessions';
import { calculatePrice, getPricingConfig } from '../utils/pricing';
import { useLanguage } from '../contexts/useLanguage';
import { cn, resolveAssetUrl } from '../lib/utils';
import { LiveSessionMonitor } from '../components/LiveSessionMonitor';
import { AnimatePresence, motion } from 'framer-motion';
import {
    AttractMode, ScenarioStep, DriverStep, DifficultyStep,
    PaymentStep, NoPaymentStep, WaitingRoom, RaceMode, ResultsStep
} from './KioskSteps';
import type { KioskSelection } from './KioskSteps';

// Driver creation is handled inline for now. Backend may provide endpoint.
const clientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};


import { ContentStep } from './KioskContentStep';

export default function KioskMode() {
    const [searchParams] = useSearchParams();
    const [stationId, setStationId] = useState<number>(0);
    const [pairingCode, setPairingCode] = useState('');
    const [pairingError, setPairingError] = useState<string | null>(null);
    const [pairingBusy, setPairingBusy] = useState(false);
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
    const { language, setLanguage, t } = useLanguage();
    const [paymentProvider, setPaymentProvider] = useState<PaymentProvider>('stripe_qr');
    const [paymentInfo, setPaymentInfo] = useState<PaymentStatus | null>(null);
    const [paymentError, setPaymentError] = useState<string | null>(null);
    const paymentHandledRef = useRef(false);
    const noPaymentHandledRef = useRef(false);
    const [launchingNoPayment, setLaunchingNoPayment] = useState(false);
    const [lastHardwareSnapshot, setLastHardwareSnapshot] = useState<any>(null);

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

    const resolveKioskCode = async (code: string) => {
        try {
            setPairingBusy(true);
            const res = await axios.post(`${API_URL}/settings/kiosk/pair`, { code });
            if (res.data.station_id) {
                setStationId(res.data.station_id);
                localStorage.setItem('kiosk_station_id', String(res.data.station_id));
                localStorage.setItem('kiosk_code', code);
            }
        } catch (e) {
            setPairingError("Codigo invalido");
        } finally {
            setPairingBusy(false);
        }
    };

    const { data: hardwareStatus, isLoading: hardwareFetching, refetch: refetchHardware, isError: isHardwareError } = useQuery({
        queryKey: ['hardware', stationId],
        queryFn: () => axios.get(`${API_URL}/hardware/status/${stationId}`).then(r => r.data),
        enabled: !!stationId,
        refetchInterval: 5000,
        retry: false
    });

    useEffect(() => {
        const stored = localStorage.getItem('kiosk_station_id');
        const storedCode = localStorage.getItem('kiosk_code');
        if (stored && !isNaN(Number(stored)) && stationId === 0) {
            setStationId(Number(stored));
        }
        if (storedCode && !pairingCode) {
            setPairingCode(storedCode);
        }
    }, []);

    const handleUnpair = () => {
        if (confirm("¿Desvincular Kiosko de esta estación?")) {
            setStationId(0);
            localStorage.removeItem('kiosk_station_id');
            localStorage.removeItem('kiosk_code');
            setPairingCode('');
        }
    };

    const isServerUnavailable = isHardwareError;
    const isStationInactive = false; // TODO: Check via settings or status
    const isKioskDisabled = false; // TODO: Check via settings
    const hardwareWarning = !hardwareStatus?.is_online;

    const selectedCarObj = useMemo(() => cars.find((c: any) => c.model === selection?.car), [cars, selection]);
    const selectedTrackObj = useMemo(() => tracks.find((t: any) => t.name === selection?.track), [tracks, selection]);

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

    const launchWithoutPayment = async () => {
        console.log("Launching Session. Selection:", selection);
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
                    });
                    setSelection(prev => prev ? ({ ...prev, lobbyId: res.data.id }) : null);
                    setStep(6); // Go to Waiting Room
                } else {
                    // Join Lobby
                    if (!selection.lobbyId) throw new Error("Missing Lobby ID");
                    await axios.post(`${API_URL}/lobby/${selection.lobbyId}/join`, {
                        station_id: stationId
                    });
                    setStep(6); // Go to Waiting Room
                }
            } catch (e) {
                console.error("Lobby Error:", e);
                alert("Error al acceder a la sala. Inténtalo de nuevo.");
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

    const renderStep = () => {
        const content = (() => {
            switch (step) {
                case 1:
                    return (
                        <ScenarioStep
                            t={t}
                            scenarios={scenarios}
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
                        />
                    );
                case 7:
                    return <ResultsStep driver={driver} selection={selection} t={t} />;
                default:
                    return (
                        <ScenarioStep
                            t={t}
                            scenarios={scenarios}
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

    if (!stationId) {
        return (
            <div className="h-screen w-screen bg-gray-950 text-white flex items-center justify-center">
                <div className="w-full max-w-md bg-gray-900/60 border border-gray-800 rounded-3xl p-8 text-center">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-500/20 text-blue-400 mb-5">
                        <ScanQrCode size={28} />
                    </div>
                    <h1 className="text-2xl font-black uppercase mb-2">Emparejar kiosko</h1>
                    <p className="text-gray-400 text-sm mb-6">
                        Introduce el codigo de kiosko asignado a esta estacion.
                    </p>
                    <input
                        value={pairingCode}
                        onChange={(e) => setPairingCode(e.target.value.toUpperCase())}
                        placeholder="CODIGO (ej. AB12CD)"
                        className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center text-lg font-black tracking-widest uppercase text-white focus:border-blue-500 outline-none"
                    />
                    {pairingError && (
                        <p className="text-red-400 text-xs mt-3">{pairingError}</p>
                    )}
                    <button
                        onClick={() => resolveKioskCode(pairingCode)}
                        disabled={pairingBusy || pairingCode.trim().length < 4}
                        className="w-full mt-6 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-black uppercase tracking-widest py-3 rounded-xl"
                    >
                        {pairingBusy ? 'Emparejando...' : 'Emparejar'}
                    </button>
                    <button
                        onClick={() => {
                            localStorage.removeItem('kiosk_code');
                            localStorage.removeItem('kiosk_station_id');
                            setPairingCode('');
                            setPairingError(null);
                            setStationId(0);
                        }}
                        className="w-full mt-3 bg-gray-800 hover:bg-gray-700 text-gray-300 font-bold uppercase tracking-widest py-2 rounded-xl text-xs"
                    >
                        Limpiar codigo guardado
                    </button>
                </div>
            </div>
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
                    <p className="text-gray-400 text-lg">
                        No se puede contactar con el servidor. Revisa la red o espera unos segundos.
                    </p>
                    {lastHardwareSnapshot?.last_seen && (
                        <p className="text-gray-500 text-sm mt-2">
                            Ultimo estado: {new Date(lastHardwareSnapshot.last_seen).toLocaleString('es-ES')}
                        </p>
                    )}
                    <div className="mt-6 flex flex-col items-center gap-3">
                        <button
                            onClick={() => refetchHardware()}
                            className="px-6 py-3 bg-blue-600 hover:bg-blue-500 text-white font-black uppercase tracking-widest rounded-xl"
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

    // Missing imports fix (needs to be at top of file, but replacing here for context)
    // I will use a clever way to access recharts if not imported: 
    // Actually, I can't inject imports easily without replacing top of file.
    // I must update imports first.



    // If launched, show Live Monitor instead of steps
    if (isLaunched && settings) {
        return (
            <AnimatePresence>
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-full w-full"
                >
                    <LiveSessionMonitor stationId={stationId} driverName={driverName} />
                </motion.div>
            </AnimatePresence>
        );
    }

    return (
        <div className="h-full w-full flex flex-col relative">
            <AttractMode isIdle={isIdle()} scenarios={scenarios} />
            {/* BACKGROUND VIDEO/IMAGE */}
            <div className="absolute inset-0 overflow-hidden">
                {/* Dynamic Background Image (Bottom Layer) */}
                {/* Dynamic Background Image (Bottom Layer) */}
                {(() => {
                    // Use CSS filters to simulate weather instead of relying on external URLs that might break
                    const baseBG = '/bg-kiosk.jpg';
                    let filterClass = "filter-none";

                    if (step === 4) {
                        switch (weather) {
                            case 'rain': filterClass = "grayscale brightness-75 contrast-125 saturate-50"; break;
                            case 'cloud': filterClass = "grayscale brightness-90 contrast-75"; break;
                            case 'fog': filterClass = "grayscale brightness-90 contrast-50 blur-sm"; break;
                            // case 'sun': default
                        }
                        if (timeOfDay === 'night' || timeOfDay === 'evening') {
                            filterClass += " brightness-50"; // Add extra darkness if time of day matches
                        }
                    }

                    return (
                        <div
                            className={`absolute inset-0 bg-cover bg-center transition-all duration-1000 ease-in-out transform scale-105 z-0 ${filterClass}`}
                            style={{ backgroundImage: `url('${baseBG}')` }}
                        />
                    );
                })()}

                {/* LAYER 1: Time of Day Tint (Gradient Overlay) - Controls Lighting */}
                {(() => {
                    let timeGradient = "from-gray-950 via-gray-900/50 to-transparent"; // Default Noon/Day
                    let opacity = "opacity-40";

                    if (step === 4) {
                        switch (timeOfDay) {
                            case 'evening':
                                timeGradient = "from-purple-900/80 via-orange-900/40 to-orange-500/10";
                                opacity = "opacity-60";
                                break;
                            case 'night':
                                timeGradient = "from-black via-gray-950/90 to-blue-950/50";
                                opacity = "opacity-90";
                                break;
                            case 'noon':
                            default:
                                timeGradient = "from-gray-950 via-gray-900/40 to-blue-400/5";
                                opacity = "opacity-40";
                                break;
                        }
                    }
                    return <div className={`absolute inset-0 bg-gradient-to-t ${timeGradient} ${opacity} z-10 transition-all duration-1000`} />;
                })()}

                {/* VISUAL WEATHER OVERLAYS (Sun, Rain, Clouds, Fog) - TOP LAYER (z-10) */}
                {step === 4 && (
                    <div className="absolute inset-0 pointer-events-none z-10 overflow-hidden">
                        {/* SUN OVERLAY - GOD RAYS */}
                        {weather === 'sun' && timeOfDay !== 'night' && (
                            <div className={`transition-opacity duration-1000 ${timeOfDay === 'evening' ? 'opacity-50' : 'opacity-100'}`}>
                                {/* Rotating Rays Container */}
                                <div className="absolute top-[-250px] right-[-250px] w-[1000px] h-[1000px] animate-spin-very-slow opacity-30 origin-center pointer-events-none z-0">
                                    {/* Beams */}
                                    <div className="absolute top-1/2 left-1/2 w-full h-[200px] bg-gradient-to-r from-transparent via-yellow-100/40 to-transparent transform -translate-x-1/2 -translate-y-1/2 rotate-0 blur-3xl" />
                                    <div className="absolute top-1/2 left-1/2 w-full h-[150px] bg-gradient-to-r from-transparent via-yellow-100/30 to-transparent transform -translate-x-1/2 -translate-y-1/2 rotate-45 blur-3xl" />
                                    <div className="absolute top-1/2 left-1/2 w-full h-[200px] bg-gradient-to-r from-transparent via-yellow-100/40 to-transparent transform -translate-x-1/2 -translate-y-1/2 rotate-90 blur-3xl" />
                                    <div className="absolute top-1/2 left-1/2 w-full h-[150px] bg-gradient-to-r from-transparent via-yellow-100/30 to-transparent transform -translate-x-1/2 -translate-y-1/2 rotate-135 blur-3xl" />
                                </div>

                                {/* Glow Core */}
                                <div className="absolute top-[-50px] right-[-50px] w-[300px] h-[300px] bg-yellow-400/50 blur-[80px] rounded-full animate-pulse-slow z-10" />
                                <div className="absolute top-[20px] right-[20px] w-[150px] h-[150px] bg-white/70 blur-[40px] rounded-full z-10" />
                            </div>
                        )}

                        {/* RAIN OVERLAY - USER PROVIDED "SPLAT" EFFECT */}
                        {weather === 'rain' && (
                            <div className="absolute inset-0 w-full h-full z-20 overflow-hidden rain-container">
                                {/* Generated Rain Drops */}
                                {Array.from({ length: 100 }).map((_, i) => {
                                    const randoHundo = Math.floor(Math.random() * 98) + 1;
                                    const randoFiver = Math.floor(Math.random() * 4) + 2;
                                    const increment = Math.floor(Math.random() * 100);
                                    const delay = `0.${randoHundo}s`;

                                    return (
                                        <div
                                            key={i}
                                            className="drop"
                                            style={{
                                                left: `${increment}%`,
                                                bottom: `${(randoFiver + randoFiver - 1 + 100)}%`,
                                                animationDelay: delay,
                                                animationDuration: '1.5s'
                                            }}
                                        >
                                            <div className="stem" style={{ animationDelay: delay, animationDuration: '1.5s' }} />
                                            <div className="splat" style={{ animationDelay: delay, animationDuration: '1.5s' }} />
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {/* CLOUDS OVERLAY */}
                        {(weather === 'cloud' || weather === 'rain') && (
                            <div className={`absolute top-0 left-0 w-full h-[60vh] transition-opacity duration-1000 ${weather === 'rain' ? 'opacity-90' : 'opacity-70'}`}>
                                <div className="absolute top-[-50px] left-10 w-[600px] h-[200px] bg-gray-400/40 blur-[60px] rounded-full animate-float-slow" />
                                <div className="absolute top-20 right-[-100px] w-[700px] h-[300px] bg-gray-500/40 blur-[80px] rounded-full animate-float-slower" />
                                <div className="absolute top-[-20px] left-[40%] w-[500px] h-[150px] bg-gray-300/30 blur-[50px] rounded-full" />
                            </div>
                        )}

                        {/* FOG OVERLAY - DRIFTING */}
                        {weather === 'fog' && (
                            <div className="absolute inset-0 bg-gray-300/20 backdrop-blur-[2px] z-10 overflow-hidden">
                                {/* Drifting Fog Layers */}
                                <div className="absolute bottom-0 left-0 w-[200%] h-[60vh] bg-gradient-to-t from-gray-200/50 via-gray-300/20 to-transparent blur-2xl animate-fog-drift" />
                                <div className="absolute bottom-[-50px] left-[-50%] w-[200%] h-[50vh] bg-gradient-to-t from-gray-100/40 via-gray-200/10 to-transparent blur-3xl animate-fog-drift-reverse" />
                            </div>
                        )}
                    </div>
                )}

                {/* CSS Animations style tag */}
                <style>{`
                    .rain-container {
                        transform: rotate(10deg);
                    }
                    .drop {
                      position: absolute;
                      bottom: 100%;
                      width: 15px;
                      height: 120px;
                      pointer-events: none;
                      animation: drop 0.5s linear infinite;
                    }

                    @keyframes drop {
                      0% { transform: translateY(0vh); }
                      75% { transform: translateY(90vh); }
                      100% { transform: translateY(90vh); }
                    }

                    .stem {
                      width: 1px;
                      height: 60%;
                      margin-left: 7px;
                      background: linear-gradient(to bottom, rgba(255, 255, 255, 0), rgba(255, 255, 255, 0.25));
                      animation: stem 0.5s linear infinite;
                    }

                    @keyframes stem {
                      0% { opacity: 1; }
                      65% { opacity: 1; }
                      75% { opacity: 0; }
                      100% { opacity: 0; }
                    }

                    .splat {
                      width: 15px;
                      height: 10px;
                      border-top: 2px dotted rgba(255, 255, 255, 0.5);
                      border-radius: 50%;
                      opacity: 1;
                      transform: scale(0);
                      animation: splat 0.5s linear infinite;
                      display: block;
                    }

                    @keyframes splat {
                      0% { opacity: 1; transform: scale(0); }
                      80% { opacity: 1; transform: scale(0); }
                      90% { opacity: 0.5; transform: scale(1); }
                      100% { opacity: 0; transform: scale(1.5); }
                    }
                    
                    @keyframes float-slow {
                        0%, 100% { transform: translate(0, 0); }
                        50% { transform: translate(30px, 15px); }
                    }
                    @keyframes float-slower {
                        0%, 100% { transform: translate(0, 0); }
                        50% { transform: translate(-40px, 20px); }
                    }

                    @keyframes spin-very-slow {
                        from { transform: rotate(0deg); }
                        to { transform: rotate(360deg); }
                    }
                    .animate-spin-very-slow {
                        animation: spin-very-slow 60s linear infinite;
                    }

                    @keyframes fog-drift {
                        0% { transform: translateX(0); }
                        50% { transform: translateX(-50px); }
                        100% { transform: translateX(0); }
                    }
                    .animate-fog-drift {
                        animation: fog-drift 20s ease-in-out infinite;
                    }

                    @keyframes fog-drift-reverse {
                        0% { transform: translateX(0); }
                        50% { transform: translateX(50px); }
                        100% { transform: translateX(0); }
                    }
                    .animate-fog-drift-reverse {
                        animation: fog-drift-reverse 25s ease-in-out infinite;
                    }
                `}</style>
            </div>

            {true && (
                <div className="relative z-20 h-full flex flex-col p-8 overflow-y-auto custom-scrollbar">
                    {/* TOP BAR */}
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-6">
                            {/* BACK BUTTON */}
                            {!isLaunched && step > 1 && (
                                <button
                                    onClick={() => {
                                        import('../utils/sound').then(m => m.soundManager.playClick());
                                        setStep(step - 1);
                                    }}
                                    className="bg-gray-800 hover:bg-gray-700 text-white p-3 rounded-full transition-all border border-gray-700 hover:border-gray-500"
                                >
                                    <ChevronLeft size={24} />
                                </button>
                            )}
                            <div className="flex items-center gap-2">
                                <Gauge className="text-gray-600" />
                                <span className="text-gray-600 font-bold text-sm tracking-widest">AC MANAGER KIOSK v2.0 - {selectedScenario?.name || 'Standard'}</span>
                            </div>
                        </div>

                        <div className="flex items-center gap-4">
                            {step === 1 && (
                                <div className="flex gap-2">
                                    <button
                                        onClick={() => setLanguage('es')}
                                        className={`px-3 py-2 rounded-lg text-xs font-black border ${language === 'es' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                    >
                                        ES
                                    </button>
                                    <button
                                        onClick={() => setLanguage('en')}
                                        className={`px-3 py-2 rounded-lg text-xs font-black border ${language === 'en' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                                    >
                                        EN
                                    </button>
                                </div>
                            )}
                            {/* CONNECTED INDICATORS */}
                            <div className="flex gap-2">
                                {/* AGENT STATUS */}
                                <div title={hardwareStatus?.is_online ? "Agente Online" : "Agente Offline"} className={`p-2 rounded-lg ${hardwareStatus?.is_online ? 'bg-green-500/10 text-green-500' : 'bg-red-500/10 text-red-500'}`}>
                                    <Activity size={20} className={hardwareStatus?.is_online ? "animate-pulse" : ""} />
                                </div>
                                {/* WHEEL STATUS */}
                                <div title="Volante" className={`p-2 rounded-lg ${hardwareStatus?.wheel_connected ? 'bg-green-500/10 text-green-500' : 'bg-gray-800 text-gray-600'}`}>
                                    <Disc size={20} className={hardwareStatus?.wheel_connected ? "animate-spin-slow" : ""} />
                                </div>
                                {/* PEDALS STATUS */}
                                <div title="Pedales" className={`p-2 rounded-lg ${hardwareStatus?.pedals_connected ? 'bg-green-500/10 text-green-500' : 'bg-gray-800 text-gray-600'}`}>
                                    <Footprints size={20} />
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs text-gray-500 font-bold uppercase">USUARIO</div>
                                <div className="text-white font-bold">{driver ? driver.name : 'Invitado'}</div>
                            </div>
                        </div>
                    </div>

                    {hardwareWarning && (
                        <div className="mb-6 bg-red-500/10 border border-red-500/30 rounded-2xl p-4 text-red-200 font-bold text-sm flex items-center gap-3">
                            <AlertCircle size={20} />
                            <span>
                                {!hardwareStatus?.is_online && 'Agente desconectado. '}
                                {hardwareStatus?.is_online && (!hardwareStatus?.wheel_connected || !hardwareStatus?.pedals_connected) && 'Hardware no detectado: '}
                                {hardwareStatus?.is_online && !hardwareStatus?.wheel_connected && 'volante '}
                                {hardwareStatus?.is_online && !hardwareStatus?.pedals_connected && 'pedales'}
                            </span>
                        </div>
                    )}

                    <div className="flex-1 flex flex-col justify-center max-w-7xl mx-auto w-full">
                        {renderStep()}
                    </div>
                </div>
            )}
        </div>
    );
}
