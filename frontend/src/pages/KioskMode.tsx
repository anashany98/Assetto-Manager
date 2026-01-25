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
    const [weather, setWeather] = useState<'sun' | 'cloud' | 'rain'>('sun');
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
    const paymentNote = paymentEnabled
        ? t('kiosk.paymentNote')
            .replace('{stationId}', stationId ? String(stationId) : '')
            .replace('#{stationId}', stationId ? String(stationId) : '')
        : 'Pago desactivado. La sesi\u00f3n se iniciar\u00e1 directamente.';

    // Active Scenarios (Hoisted for Attract Mode)
    const { data: scenarios = [] } = useQuery({
        queryKey: ['available-scenarios'],
        queryFn: async () => {
            const all = await getScenarios();
            return all.filter(s => s.is_active);
        },
        refetchInterval: 1000
    });

    // Find selected objects
    const selectedCarObj = cars.find(c => c.id === selection?.car);
    const selectedTrackObj = tracks.find(t => t.id === selection?.track);

    // Fetch Record
    // Fetch Leaderboard
    const { data: leaderboard = [] } = useQuery({
        queryKey: ['leaderboard', selection?.track, selection?.car],
        queryFn: async () => {
            if (!selection?.track || !selection?.car) return [];
            try {
                // If using mocked backend without real data, this might be empty.
                // We'll trust the endpoint we just created.
                const res = await axios.get(`${API_URL}/leaderboard/top`, {
                    params: { track: selection.track, car: selection.car, limit: 5 }
                });
                return res.data;
            } catch (e) {
                console.error("Failed to fetch leaderboard", e);
                return [];
            }
        },
        enabled: !!selection?.track && !!selection?.car
    });

    // Station ID State
    // Fetch Hardware Status (Agent, Wheel, Pedals)
    const { data: hardwareStatus, isError: hardwareError, refetch: refetchHardware, isFetching: hardwareFetching } = useQuery({
        queryKey: ['hardware-status', stationId],
        queryFn: async () => {
            if (!stationId) return null;
            const res = await axios.get(`${API_URL}/hardware/status/${stationId}`);
            if (res.data) return res.data;
            throw new Error("Empty data");
        },
        refetchInterval: stationId ? 2000 : false,
        retry: 3,
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
        enabled: !!stationId
    });

    const { data: stationContent } = useQuery({
        queryKey: ['station_content', stationId],
        queryFn: () => getStationContent(stationId),
        enabled: !!stationId,
        staleTime: 5 * 60 * 1000 // 5 minutes
    });

    const hardwareWarning = hardwareStatus && (hardwareStatus.is_online === false || !hardwareStatus.wheel_connected || !hardwareStatus.pedals_connected);
    const isServerUnavailable = !!stationId && (hardwareError || hardwareStatus === null);
    const isStationInactive = hardwareStatus?.is_active === false || hardwareStatus?.status === 'archived';
    const isKioskDisabled = hardwareStatus?.is_kiosk_mode === false;

    useEffect(() => {
        if (!stationId) return;
        if (hardwareStatus) {
            setLastHardwareSnapshot(hardwareStatus);
            try {
                localStorage.setItem(`kiosk_hw_${stationId}`, JSON.stringify(hardwareStatus));
            } catch {
                // ignore cache errors
            }
        }
    }, [hardwareStatus, stationId]);

    useEffect(() => {
        if (!stationId || hardwareStatus) return;
        try {
            const raw = localStorage.getItem(`kiosk_hw_${stationId}`);
            if (raw) {
                setLastHardwareSnapshot(JSON.parse(raw));
            }
        } catch {
            // ignore
        }
    }, [hardwareStatus, stationId]);

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: any) => {
            if (!stationId) {
                throw new Error('Station not paired');
            }
            await axios.post(`${API_URL}/control/station/${stationId}/launch`, payload, { headers: clientTokenHeaders });
        },
        onSuccess: () => setIsLaunched(true)
    });

    const buildLaunchPayload = () => ({
        driver_id: driver?.id,
        driver_name: driver?.name,
        car: selection?.car,
        track: selection?.track,
        difficulty,
        transmission,
        time_of_day: timeOfDay,
        weather: weather,
        duration_minutes: duration,
        session_type: selection?.type || 'practice',
        ai_count: selection?.aiCount || 0,
        tyre_compound: (selection as any)?.tyreCompound || 'semislicks'
    });

    const joinLobby = async () => {
        if (!selection?.lobbyId) {
            throw new Error('Lobby no disponible');
        }
        await axios.post(`${API_URL}/lobby/${selection.lobbyId}/join`, { station_id: stationId });
        setStep(6);
    };

    const launchWithoutPayment = async () => {
        if (launchingNoPayment || noPaymentHandledRef.current) return;
        noPaymentHandledRef.current = true;
        setLaunchingNoPayment(true);
        try {
            await startSession({
                station_id: stationId,
                driver_name: driver?.name || undefined,
                duration_minutes: duration,
                price: 0,
                payment_method: 'cash',
                is_vr: false
            });
        } catch (err) {
            console.error('Error creando sesion sin pago:', err);
        }

        try {
            if (selection?.isLobby) {
                await joinLobby();
                return;
            }
            await launchSessionMutation.mutateAsync(buildLaunchPayload());
        } catch (err) {
            console.error('Error lanzando sesion sin pago:', err);
            alert('No se pudo lanzar la sesion.');
            noPaymentHandledRef.current = false;
        } finally {
            setLaunchingNoPayment(false);
        }
    };

    const resolveKioskCode = async (code: string) => {
        const trimmed = code.trim();
        if (!trimmed) return false;
        setPairingError(null);
        setPairingBusy(true);
        try {
            const res = await axios.get(`${API_URL}/stations/kiosk/${encodeURIComponent(trimmed)}`, {
                headers: clientTokenHeaders
            });
            const id = res.data?.station_id;
            if (id) {
                setStationId(id);
                localStorage.setItem('kiosk_code', trimmed);
                localStorage.setItem('kiosk_station_id', String(id));
                setPairingBusy(false);
                return true;
            }
            throw new Error('Invalid kiosk code');
        } catch (err) {
            console.error('Kiosk pairing failed', err);
            setStationId(0);
            localStorage.removeItem('kiosk_code');
            localStorage.removeItem('kiosk_station_id');
            setPairingError('No se pudo emparejar. Verifica el codigo o el servidor.');
            setPairingBusy(false);
            return false;
        }
    };


    useEffect(() => {
        // Check kiosk pairing code (e.g., /kiosk?kiosk=ABC123)
        const urlKiosk = searchParams.get('kiosk');
        if (urlKiosk) {
            resolveKioskCode(urlKiosk);
            return;
        }

        const storedKiosk = localStorage.getItem('kiosk_code');
        if (storedKiosk) {
            resolveKioskCode(storedKiosk);
        }
    }, [searchParams]);

    // --- ATTRACT MODE (SCREENSAVER) ---
    const [isIdle, setIsIdle] = useState(false);

    const onIdle = () => {
        setIsIdle(true);
    };

    const onActive = () => {
        setIsIdle(false);
    };

    useIdleTimer({
        onIdle,
        onActive,
        timeout: 5 * 60 * 1000, // 5 minutes
        throttle: 500
    });




    // Timer effect - runs when session is launched
    useEffect(() => {
        if (!isLaunched) return;
        setRemainingSeconds(duration * 60);

        const timer = setInterval(() => {
            setRemainingSeconds(prev => {
                if (prev <= 1) {
                    clearInterval(timer);
                    setIsLaunched(false);
                    setStep(7); // Go to Results
                    return 0;
                }
                return prev - 1;
            });
        }, 1000);

        return () => clearInterval(timer);
    }, [isLaunched, duration]);

    // --- RACE MODE (Telemetry & Pit Controls) ---


    // --- COACH SECTION COMPONENT ---


    // --- STEP 6: POST-RACE RESULTS ---

    // --- RENDER CURRENT STEP ---
    // --- RENDER CURRENT STEP ---
    const renderStep = () => {
        if (isLaunched) {
            return (
                <RaceMode
                    remainingSeconds={remainingSeconds}
                    selection={selection}
                    driver={driver}
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
            );
        }

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
                    <DriverStep
                        t={t}
                        driverName={driverName}
                        setDriverName={setDriverName}
                        driverEmail={driverEmail}
                        setDriverEmail={setDriverEmail}
                        onLogin={(d) => {
                            setDriver(d);
                            setStep(3);
                        }}
                        selection={selection}
                        leaderboardData={leaderboard}
                    />
                );
            case 3:
                return (
                    <ContentStep
                        stationId={stationId}
                        selectedScenario={selectedScenario}
                        currentSelection={selection ? { car: selection.car, track: selection.track } : null}
                        onSelectionChange={(carId, trackId) => setSelection(prev => prev ? { ...prev, car: carId || '', track: trackId || '' } : null)}
                        onNext={() => setStep(4)}
                        prefetchedCars={stationContent?.cars}
                        prefetchedTracks={stationContent?.tracks}
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



    return (
        <div className="h-full w-full flex flex-col relative">
            <AttractMode isIdle={isIdle} scenarios={scenarios} />
            {/* BACKGROUND VIDEO/IMAGE */}
            <div className="absolute inset-0 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-t from-gray-900 via-gray-900/95 to-gray-900/80 z-10" />
                <div className="absolute inset-0 bg-[url('/bg-kiosk.jpg')] bg-cover bg-center opacity-30" />
            </div>

            {true && (
                <div className="relative z-20 h-full flex flex-col p-8 overflow-y-auto custom-scrollbar">
                    {/* TOP BAR */}
                    <div className="flex justify-between items-center mb-8">
                        <div className="flex items-center gap-6">
                            {/* BACK BUTTON */}
                            {!isLaunched && step > 1 && (
                                <button
                                    onClick={() => setStep(step - 1)}
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
