/**
 * KioskV2 — iPad Portrait Kiosk Shell
 * Route: /kiosk-v2
 *
 * Design: "APEX" — Electric Lime on Black, optimised for 768-820px portrait.
 * Layout:
 *   ┌─────────────────────────────────┐
 *   │  ← BACK     ● ● ● ● ●  ◉◉◉    │  56px — top bar (back + progress + hw)
 *   │─────────────────────────────────│
 *   │                                 │
 *   │        STEP CONTENT             │  flex-1 — scrollable content area
 *   │                                 │
 *   │─────────────────────────────────│
 *   │     [ CONTINUAR / ACTION ]      │  88px — sticky bottom CTA (steps 2-5)
 *   └─────────────────────────────────┘
 *
 * Step mapping:
 *   1 → ScenarioStepV2   (self-advancing on tap)
 *   2 → CarSelectV2      (CTA: Continuar)
 *   3 → TrackSelectV2    (CTA: Continuar)
 *   4 → DriverStepV2     (CTA: Continuar como <name>)
 *   5 → SettingsStepV2   (CTA: Confirmar)
 *   6 → PaymentStep | NoPaymentStep
 *   7 → WaitingRoom
 *   8 → ResultsStep
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIdleTimer } from 'react-idle-timer';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronLeft, WifiOff, AlertCircle } from 'lucide-react';
import axios from 'axios';

import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { getCars, getTracks, triggerContentScan } from '../api/content';
import { getScenarios } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { type PaymentProvider, type PaymentStatus } from '../api/payments';
import { startSession } from '../api/sessions';
import { calculatePrice, getPricingConfig } from '../utils/pricing';
import { useLanguage } from '../contexts/useLanguage';
import StationPairing from '../components/StationPairing';
import {
    clearPairedStationId,
    getPairedKioskCode,
    getPairedStationId,
    setPairedStation,
} from '../utils/stationPairing';

// V2 step components
import {
    AttractModeV2,
    ScenarioStepV2,
    CarSelectV2,
    TrackSelectV2,
    DriverStepV2,
    SettingsStepV2,
} from './KioskStepsV2';

// Reuse existing payment / race / results / waiting room components
import {
    PaymentStep,
    NoPaymentStep,
    RaceMode,
    ResultsStep,
    WaitingRoom,
    type KioskSelection,
} from './KioskSteps';

const baseClientTokenHeaders: Record<string, string> = PUBLIC_API_TOKEN
    ? { 'X-Client-Token': PUBLIC_API_TOKEN }
    : {};

export default function KioskV2() {
    const [searchParams] = useSearchParams();
    const queryClient = useQueryClient();
    const { t } = useLanguage();

    // ── Station pairing ──────────────────────────────────────────
    const [stationId, setStationId] = useState<number>(() => getPairedStationId() || 0);
    const [showPairing, setShowPairing] = useState<boolean>(() => !getPairedStationId());
    const [pairedKioskCode, setPairedKioskCode] = useState<string | null>(
        () => getPairedKioskCode()
    );
    const [pairingByCode, setPairingByCode] = useState(false);
    const [pairingCodeError, setPairingCodeError] = useState<string | null>(null);
    const pairingFromUrlAttemptedRef = useRef(false);

    // ── Flow state ───────────────────────────────────────────────
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

    // ── Side-effects ─────────────────────────────────────────────

    // Countdown while launched
    useEffect(() => {
        let interval: ReturnType<typeof setInterval>;
        if (isLaunched && remainingSeconds > 0) {
            interval = setInterval(() => setRemainingSeconds((p) => Math.max(0, p - 1)), 1000);
        }
        return () => clearInterval(interval);
    }, [isLaunched, remainingSeconds]);

    // Sync remaining when duration changes (before launch)
    useEffect(() => {
        if (!isLaunched) setRemainingSeconds(duration * 60);
    }, [duration, isLaunched]);

    // Reset payment refs when navigating away from payment step
    useEffect(() => {
        if (step < 6) {
            paymentHandledRef.current = false;
            noPaymentHandledRef.current = false;
        }
    }, [step]);

    // Idle timer — return to step 1 after 90 s of inactivity
    const { isIdle } = useIdleTimer({
        onIdle: () => {
            if (step > 1 && !isLaunched) {
                setStep(1);
                setSelection(null);
                setDriver(null);
                setPaymentInfo(null);
            }
        },
        timeout: 90_000,
        debounce: 500,
    });

    // Auto-trigger content scan once station is known
    useEffect(() => {
        if (!stationId) return;
        triggerContentScan(stationId).catch(() => {});
        const timer = setTimeout(() => {
            queryClient.invalidateQueries({ queryKey: ['cars', stationId] });
            queryClient.invalidateQueries({ queryKey: ['tracks', stationId] });
        }, 8000);
        return () => clearTimeout(timer);
    }, [stationId]);

    // ── Derived ──────────────────────────────────────────────────
    const clientTokenHeaders = useMemo<Record<string, string>>(() => {
        const headers = { ...baseClientTokenHeaders };
        const code = pairedKioskCode?.trim().toUpperCase();
        if (code) (headers as any)['X-Kiosk-Code'] = code;
        return headers;
    }, [pairedKioskCode]);

    // ── Queries ──────────────────────────────────────────────────
    const { data: cars = [] } = useQuery({
        queryKey: ['cars', stationId],
        queryFn: () => getCars(stationId),
        enabled: !!stationId,
    });
    const { data: tracks = [] } = useQuery({
        queryKey: ['tracks', stationId],
        queryFn: () => getTracks(stationId),
        enabled: !!stationId,
    });
    const { data: settings = [] } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const r = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(r.data) ? r.data : [];
        },
        initialData: [],
        refetchInterval: 10_000,
    });
    const {
        data: hardwareStatus,
        isLoading: hardwareFetching,
        refetch: refetchHardware,
        isError: isHardwareError,
    } = useQuery({
        queryKey: ['hardware-v2', stationId],
        queryFn: () =>
            axios
                .get(`${API_URL}/hardware/status/${stationId}`, { headers: clientTokenHeaders })
                .then((r) => r.data),
        enabled: !!stationId,
        refetchInterval: 5000,
        retry: false,
    });
    const { data: scenarios = [] } = useQuery({
        queryKey: ['scenarios', stationId],
        queryFn: () => getScenarios(),
        enabled: !!stationId,
    });

    // ── Settings derived ─────────────────────────────────────────
    const pricingConfig = useMemo(() => getPricingConfig(settings), [settings]);
    const sessionPrice = useMemo(
        () => calculatePrice(duration, false, pricingConfig),
        [duration, pricingConfig]
    );
    const paymentEnabled = useMemo(() => {
        const e = settings.find((i: any) => i.key === 'kiosk_payment_enabled');
        if (!e) return true;
        return e.value !== 'false' && e.value !== '0';
    }, [settings]);
    const simModsEnabled = useMemo(() => {
        const e = settings.find((i: any) => i.key === 'sim_mods_enabled');
        return e?.value === 'true' || e?.value === '1';
    }, [settings]);
    const rainEnabled = useMemo(() => {
        if (!simModsEnabled) return false;
        const e = settings.find((i: any) => i.key === 'kiosk_rain_enabled');
        if (!e) return false;
        return e.value === 'true' || e.value === '1';
    }, [settings, simModsEnabled]);
    const activeScenarios = useMemo(() => {
        if (!Array.isArray(scenarios)) return [];
        return scenarios.filter((s: any) => {
            if (s?.is_active === false) return false;
            if (!simModsEnabled) {
                const type = (s?.session_type || '').toLowerCase();
                if (type === 'traffic' || type === 'overtake') return false;
            }
            return true;
        });
    }, [scenarios, simModsEnabled]);

    // ── Hardware status ───────────────────────────────────────────
    const isServerUnavailable = isHardwareError;
    const isStationInactive = hardwareStatus?.is_active === false;
    const isKioskDisabled = hardwareStatus?.is_kiosk_mode === false;
    const hardwareWarning = Boolean(
        hardwareStatus &&
            (hardwareStatus.is_online === false ||
                !hardwareStatus.wheel_connected ||
                !hardwareStatus.pedals_connected)
    );

    // ── Mutations & helpers ───────────────────────────────────────
    const resolveApiError = (error: unknown, fallback: string) => {
        if (axios.isAxiosError(error)) {
            const detail = (error.response?.data as any)?.detail;
            if (typeof detail === 'string' && detail.trim()) return detail;
        }
        return fallback;
    };

    const buildLaunchPayload = () => {
        const weatherMap: Record<string, string> = {
            sun: 'clear', cloud: 'windy', rain: 'rainy', fog: 'fog',
        };
        return {
            station_id: stationId,
            car: selection?.car,
            track: selection?.track,
            weather: weatherMap[weather] ?? 'clear',
            time_of_day: timeOfDay,
            difficulty,
            transmission,
            driver_name: driver?.name,
            duration_minutes: duration,
            session_type: selection?.type ?? 'practice',
        };
    };

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: ReturnType<typeof buildLaunchPayload>) => {
            await axios.post(
                `${API_URL}/control/station/${payload.station_id}/launch`,
                payload,
                { headers: clientTokenHeaders }
            );
        },
        onSuccess: () => setIsLaunched(true),
    });

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
        await startSession(
            {
                station_id: stationId,
                driver_name: driver?.name ?? undefined,
                duration_minutes: duration,
                price: sessionPrice,
                payment_method: 'cash',
                is_vr: false,
                notes: paymentEnabled ? 'kiosk_session' : 'kiosk_no_payment',
            },
            { headers: clientTokenHeaders }
        );
    };

    const createLobbyMutation = useMutation({
        mutationFn: async () => {
            const res = await axios.post(
                `${API_URL}/lobby/create`,
                {
                    station_id: stationId,
                    driver_name: driver?.name,
                    name: `GRUPO DE ${driver?.name?.toUpperCase() ?? 'INVITADO'}`,
                    track: selection?.track,
                    car: selection?.car,
                    duration,
                    max_players: 10,
                },
                { headers: clientTokenHeaders }
            );
            return res.data;
        },
        onSuccess: (data) => {
            const lobbyId = Number(data?.id ?? data?.lobby_id);
            setSelection((prev) =>
                prev
                    ? { ...prev, lobbyId: Number.isFinite(lobbyId) ? lobbyId : prev.lobbyId }
                    : prev
            );
            setPaymentError(null);
            setStep(7);
            setLaunchingNoPayment(false);
        },
        onError: (err) => {
            const msg = resolveApiError(err, 'No se pudo crear la sala.');
            setPaymentError(msg);
            setLaunchingNoPayment(false);
            window.alert(msg);
        },
    });

    const joinLobbyMutation = useMutation({
        mutationFn: async () => {
            if (!selection?.lobbyId) throw new Error('Missing lobby id');
            await axios.post(
                `${API_URL}/lobby/${selection.lobbyId}/join`,
                { station_id: stationId, driver_name: driver?.name },
                { headers: clientTokenHeaders }
            );
        },
        onSuccess: () => {
            setPaymentError(null);
            setStep(7);
            setLaunchingNoPayment(false);
        },
        onError: (err) => {
            const msg = resolveApiError(err, 'No se pudo unir a la sala.');
            setPaymentError(msg);
            setLaunchingNoPayment(false);
            window.alert(msg);
        },
    });

    const launchWithoutPayment = async () => {
        if (launchingNoPayment) return;
        setLaunchingNoPayment(true);
        try {
            await ensureSessionRecord();
        } catch (e) {
            const msg = resolveApiError(e, 'No se pudo registrar la sesión.');
            setPaymentError(msg);
            setLaunchingNoPayment(false);
            window.alert(msg);
            return;
        }
        if (selection?.isLobby) {
            if (selection.isHost) createLobbyMutation.mutate();
            else joinLobbyMutation.mutate();
            return;
        }
        launchSessionMutation
            .mutateAsync(buildLaunchPayload())
            .catch((e) => {
                const msg = resolveApiError(e, 'No se pudo lanzar la sesión.');
                setPaymentError(msg);
                window.alert(msg);
            })
            .finally(() => setLaunchingNoPayment(false));
    };

    // ── URL auto-pairing ─────────────────────────────────────────
    const kioskCodeFromUrl = useMemo(() => {
        const raw = searchParams.get('kiosk');
        return raw ? raw.trim().toUpperCase() : '';
    }, [searchParams]);

    useEffect(() => {
        if (!kioskCodeFromUrl || pairingFromUrlAttemptedRef.current) return;
        pairingFromUrlAttemptedRef.current = true;
        setPairingByCode(true);

        axios
            .post(
                `${API_URL}/settings/kiosk/pair`,
                { code: kioskCodeFromUrl },
                { headers: baseClientTokenHeaders }
            )
            .then((res) => {
                const id = Number(res.data?.station_id);
                if (!Number.isFinite(id) || id <= 0) throw new Error('bad id');
                setPairedStation(id, kioskCodeFromUrl);
                setStationId(id);
                setPairedKioskCode(kioskCodeFromUrl);
                setShowPairing(false);
                setPairingCodeError(null);
            })
            .catch(() => {
                setPairingCodeError('No se pudo enlazar automáticamente.');
                setShowPairing(true);
            })
            .finally(() => setPairingByCode(false));
    }, [kioskCodeFromUrl]);

    const handleUnpair = () => {
        if (!window.confirm('¿Desvincular esta tablet del simulador?')) return;
        clearPairedStationId();
        setPairedKioskCode(null);
        setStationId(0);
        setShowPairing(true);
        resetKioskFlow();
    };

    // ── Early returns: pairing / errors ──────────────────────────

    if (pairingByCode) {
        return (
            <div className="h-screen w-screen bg-black text-white flex items-center justify-center">
                <div className="text-center px-8">
                    <div className="font-orbitron text-2xl font-black uppercase mb-2 text-lime-400">
                        Enlazando tablet
                    </div>
                    <p className="text-zinc-600 font-mono text-sm">Validando código...</p>
                </div>
            </div>
        );
    }

    if (showPairing || !stationId) {
        return (
            <StationPairing
                initialCode={kioskCodeFromUrl || undefined}
                errorMessage={pairingCodeError || undefined}
                onPaired={(id, code) => {
                    setStationId(id);
                    setPairedKioskCode(code?.trim().toUpperCase() || null);
                    setShowPairing(false);
                    setPairingCodeError(null);
                }}
            />
        );
    }

    if (isServerUnavailable) {
        return (
            <div className="h-screen w-screen bg-black text-white flex items-center justify-center px-8">
                <div className="text-center max-w-sm">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <WifiOff size={32} className="text-zinc-500" />
                    </div>
                    <h1 className="font-orbitron text-2xl font-black uppercase mb-3">Sin conexión</h1>
                    <p className="text-zinc-600 mb-6 text-sm">No se puede contactar con el servidor.</p>
                    <button
                        onClick={() => refetchHardware()}
                        className="px-8 py-4 bg-lime-400 text-black font-orbitron font-black text-sm uppercase rounded-2xl active:scale-95 transition-transform"
                    >
                        {hardwareFetching ? 'Reintentando...' : 'Reintentar'}
                    </button>
                </div>
            </div>
        );
    }

    if (isStationInactive) {
        return (
            <div className="h-screen w-screen bg-black text-white flex items-center justify-center px-8">
                <div className="text-center max-w-sm">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <AlertCircle size={32} className="text-rose-500" />
                    </div>
                    <h1 className="font-orbitron text-2xl font-black uppercase mb-3">Estación Inactiva</h1>
                    <p className="text-zinc-600 text-sm">Contacta al administrador para reactivarla.</p>
                </div>
            </div>
        );
    }

    if (isKioskDisabled) {
        return (
            <div className="h-screen w-screen bg-black text-white flex items-center justify-center px-8">
                <div className="text-center max-w-sm">
                    <div className="w-20 h-20 rounded-full bg-zinc-900 border border-zinc-800 flex items-center justify-center mx-auto mb-6">
                        <AlertCircle size={32} className="text-yellow-500" />
                    </div>
                    <h1 className="font-orbitron text-2xl font-black uppercase mb-3">Kiosko Desactivado</h1>
                    <p className="text-zinc-600 text-sm">Actívalo desde Configuración.</p>
                </div>
            </div>
        );
    }

    // ── Race mode ────────────────────────────────────────────────
    if (isLaunched) {
        return (
            <div className="h-screen w-screen overflow-hidden bg-black">
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

    // ── Step CTA config ───────────────────────────────────────────
    type StepAction = { label: string; disabled: boolean; onClick: () => void } | null;

    const getStepAction = (): StepAction => {
        switch (step) {
            case 2:
                return {
                    label: selection?.car ? 'Continuar con este vehículo' : 'Selecciona un vehículo',
                    disabled: !selection?.car,
                    onClick: () => setStep(3),
                };
            case 3:
                return {
                    label: selection?.track ? 'Continuar con este circuito' : 'Selecciona un circuito',
                    disabled: !selection?.track,
                    onClick: () => setStep(4),
                };
            case 4:
                return {
                    label: driverName.trim()
                        ? `Continuar como ${driverName.trim()}`
                        : 'Continuar como Invitado',
                    disabled: false,
                    onClick: () => {
                        const name = driverName.trim() || 'Invitado';
                        setDriver({ id: 0, name });
                        setStep(5);
                    },
                };
            case 5:
                return {
                    label: 'Confirmar y continuar',
                    disabled: false,
                    onClick: () => setStep(6),
                };
            default:
                return null;
        }
    };

    const stepAction = getStepAction();
    const showCTA = step >= 2 && step <= 5 && stepAction !== null;
    const showBackBtn = step > 1 && step <= 5;

    // ── Step renderer ────────────────────────────────────────────
    const renderStep = () => {
        switch (step) {
            case 1:
                return (
                    <ScenarioStepV2
                        scenarios={activeScenarios}
                        setSelection={(s) =>
                            setSelection((prev) => ({
                                car: prev?.car ?? '',
                                track: prev?.track ?? '',
                                ...s,
                            }))
                        }
                        setStep={setStep}
                        setSelectedScenario={setSelectedScenario}
                        setDuration={setDuration}
                    />
                );
            case 2:
                return (
                    <CarSelectV2
                        cars={cars as any}
                        selectedCarId={selection?.car ?? ''}
                        onSelect={(id) =>
                            setSelection((prev) =>
                                prev ? { ...prev, car: id } : { car: id, track: '' }
                            )
                        }
                    />
                );
            case 3:
                return (
                    <TrackSelectV2
                        tracks={tracks as any}
                        selectedTrackId={selection?.track ?? ''}
                        onSelect={(id) =>
                            setSelection((prev) =>
                                prev ? { ...prev, track: id } : { car: '', track: id }
                            )
                        }
                    />
                );
            case 4:
                return (
                    <DriverStepV2
                        driverName={driverName}
                        setDriverName={setDriverName}
                        onQuickGuest={() => {
                            setDriver({ id: 0, name: 'Invitado' });
                            setStep(5);
                        }}
                    />
                );
            case 5:
                return (
                    <SettingsStepV2
                        duration={duration}
                        setDuration={setDuration}
                        weather={weather}
                        setWeather={setWeather as any}
                        timeOfDay={timeOfDay}
                        setTimeOfDay={setTimeOfDay as any}
                        difficulty={difficulty}
                        setDifficulty={setDifficulty as any}
                        transmission={transmission}
                        setTransmission={setTransmission as any}
                        rainEnabled={rainEnabled}
                    />
                );
            case 6:
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
            case 7:
                return (
                    <WaitingRoom
                        selection={selection}
                        stationId={stationId}
                        setIsLaunched={setIsLaunched}
                        clientTokenHeaders={clientTokenHeaders}
                        onExitLobby={resetKioskFlow}
                    />
                );
            case 8:
                return <ResultsStep driver={driver} selection={selection} t={t} />;
            default:
                return null;
        }
    };

    // ── Main render ───────────────────────────────────────────────
    return (
        <div
            className="h-screen w-screen bg-black text-white flex flex-col overflow-hidden"
            style={{ fontFamily: "'Inter', system-ui, sans-serif" }}
        >
            {/* Attract mode overlay */}
            <AttractModeV2 isIdle={isIdle()} onUnpair={handleUnpair} />

            {/* ── Top bar ─────────────────────────────────────── */}
            <div className="flex-shrink-0 flex items-center justify-between px-5 h-14 border-b border-zinc-900 z-10 bg-black">
                {/* Left: back button or logo */}
                <div className="w-24 flex items-center">
                    {showBackBtn ? (
                        <button
                            onClick={() => setStep((s) => s - 1)}
                            className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center active:scale-90 transition-transform"
                        >
                            <ChevronLeft size={20} className="text-white" />
                        </button>
                    ) : (
                        <img src="/logo.png" alt="Logo" className="h-6 opacity-40" />
                    )}
                </div>

                {/* Center: progress dots (steps 1–5) */}
                {step >= 1 && step <= 5 && (
                    <div className="flex items-center gap-2">
                        {[1, 2, 3, 4, 5].map((s) => (
                            <div
                                key={s}
                                className={`rounded-full transition-all duration-300 ${
                                    s === step
                                        ? 'w-5 h-2 bg-lime-400'
                                        : s < step
                                        ? 'w-2 h-2 bg-lime-400/40'
                                        : 'w-2 h-2 bg-zinc-800'
                                }`}
                            />
                        ))}
                    </div>
                )}

                {/* Right: hardware dots + station id */}
                <div className="w-24 flex items-center justify-end gap-2">
                    <div className="flex gap-1.5 items-center">
                        <div
                            title={hardwareStatus?.is_online ? 'Agente online' : 'Agente offline'}
                            className={`w-1.5 h-1.5 rounded-full ${
                                hardwareStatus?.is_online ? 'bg-lime-400' : 'bg-zinc-700'
                            }`}
                        />
                        <div
                            title="Volante"
                            className={`w-1.5 h-1.5 rounded-full ${
                                hardwareStatus?.wheel_connected ? 'bg-lime-400' : 'bg-zinc-700'
                            }`}
                        />
                        <div
                            title="Pedales"
                            className={`w-1.5 h-1.5 rounded-full ${
                                hardwareStatus?.pedals_connected ? 'bg-lime-400' : 'bg-zinc-700'
                            }`}
                        />
                    </div>
                    <span className="text-zinc-700 text-[10px] font-mono hidden sm:inline">
                        {stationId}
                    </span>
                </div>
            </div>

            {/* Hardware warning strip */}
            {hardwareWarning && (
                <div className="flex-shrink-0 flex items-center gap-2 px-5 py-2 bg-rose-950/40 border-b border-rose-800/25 z-10">
                    <div className="w-1.5 h-1.5 rounded-full bg-rose-400 flex-shrink-0" />
                    <span className="text-rose-300/80 text-xs font-mono">
                        {!hardwareStatus?.is_online
                            ? 'Agente desconectado'
                            : 'Hardware no detectado — volante / pedales'}
                    </span>
                </div>
            )}

            {/* ── Content area ──────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-hidden z-10">
                <AnimatePresence mode="wait">
                    <motion.div
                        key={step}
                        initial={{ opacity: 0, x: 16 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -16 }}
                        transition={{ duration: 0.22, ease: 'easeOut' }}
                        className="h-full w-full"
                    >
                        {renderStep()}
                    </motion.div>
                </AnimatePresence>
            </div>

            {/* ── Bottom CTA (steps 2–5 only) ───────────────────── */}
            {showCTA && stepAction && (
                <div className="flex-shrink-0 px-5 pt-3 pb-8 border-t border-zinc-900 z-10 bg-black">
                    <button
                        onClick={stepAction.onClick}
                        disabled={stepAction.disabled}
                        className={`w-full py-5 rounded-2xl font-orbitron font-black text-sm uppercase tracking-widest transition-all active:scale-[0.98] ${
                            stepAction.disabled
                                ? 'bg-zinc-900 text-zinc-700 cursor-not-allowed border border-zinc-800'
                                : 'bg-lime-400 text-black hover:bg-lime-300'
                        }`}
                    >
                        {stepAction.label}
                    </button>
                </div>
            )}
        </div>
    );
}
