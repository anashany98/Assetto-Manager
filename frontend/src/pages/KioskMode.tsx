import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { useIdleTimer } from 'react-idle-timer';
import { QRCodeCanvas } from 'qrcode.react';
import {
    Car,
    Flag,
    Play,
    ChevronRight,
    ChevronLeft,
    Gauge,
    ShieldCheck,
    Activity,
    LogOut,
    Clock,
    Trophy,
    Medal,
    WifiOff,
    ScanQrCode,
    Map,
    Sun,
    Sunset,
    Cloud,
    CloudRain,
    Gamepad2,
    Footprints,
    Disc,
    Zap,
    TrendingUp,
    Info,
    AlertCircle
} from 'lucide-react';
import axios from 'axios';
import {
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer
} from 'recharts';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { getCars, getTracks } from '../api/content';
import { getScenarios } from '../api/scenarios';
import type { Scenario } from '../api/scenarios';
import { createPaymentCheckout, getPaymentStatus, type PaymentProvider, type PaymentStatus } from '../api/payments';
import { startSession } from '../api/sessions';
import { calculatePrice, getPricingConfig } from '../utils/pricing';
import { useLanguage } from '../contexts/useLanguage';

// Driver creation is handled inline for now. Backend may provide endpoint.
const clientTokenHeaders = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};

export default function KioskMode() {
    const [searchParams] = useSearchParams();
    const [stationId, setStationId] = useState<number>(1);
    const [step, setStep] = useState<number>(1);
    const [driver, setDriver] = useState<{ id: number, name: string } | null>(null);
    const [selection, setSelection] = useState<{
        car: string,
        track: string,
        type?: 'practice' | 'qualify' | 'race' | 'hotlap' | 'scenario' | 'lobby',
        scenarioId?: number,
        weather?: string,
        time?: number | string,
        isLobby?: boolean,
        isHost?: boolean,
        lobbyId?: number
    } | null>(null);
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

    // Queries
    const { data: cars = [] } = useQuery({ queryKey: ['cars'], queryFn: () => getCars() });
    const { data: tracks = [] } = useQuery({ queryKey: ['tracks'], queryFn: () => getTracks() });
    const { data: settings = [] } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return Array.isArray(res.data) ? res.data : [];
        },
        initialData: []
    });
    const pricingConfig = useMemo(() => getPricingConfig(settings), [settings]);
    const sessionPrice = useMemo(() => calculatePrice(duration, false, pricingConfig), [duration, pricingConfig]);
    const paymentNote = t('kiosk.paymentNote')
        .replace('{stationId}', String(stationId))
        .replace('#{stationId}', String(stationId));

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
                // Fallback for demo if backend is empty
                return [
                    { rank: 1, driver_name: "Stig", time: "1:42.550" },
                    { rank: 2, driver_name: "Akira", time: "1:43.100" },
                    { rank: 3, driver_name: "Takumi", time: "1:43.800" },
                ];
            }
        },
        enabled: !!selection?.track && !!selection?.car
    });

    // Station ID State
    // Fetch Hardware Status (Agent, Wheel, Pedals)
    const { data: hardwareStatus } = useQuery({
        queryKey: ['hardware-status', stationId],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/hardware/status/${stationId}`);
                if (res.data) return res.data;
                throw new Error("Empty data");
            } catch (err) {
                // Simulation ONLY in development mode
                if (import.meta.env.DEV) {
                    return {
                        is_online: true,
                        wheel_connected: true,
                        pedals_connected: true,
                        station_id: stationId,
                        station_name: `Simulated Station ${stationId}`
                    };
                }
                console.error("Hardware status fetch failed", err);
                return null;
            }
        },
        refetchInterval: 2000,
        retry: false
    });

    const hardwareWarning = hardwareStatus && (hardwareStatus.is_online === false || !hardwareStatus.wheel_connected || !hardwareStatus.pedals_connected);

    const launchSessionMutation = useMutation({
        mutationFn: async (payload: any) => {
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
        duration_minutes: duration
    });


    useEffect(() => {
        // Check URL param first (e.g., /kiosk?station=3)
        const urlStation = searchParams.get('station');
        if (urlStation) {
            const id = parseInt(urlStation, 10);
            if (!isNaN(id)) {
                setStationId(id);
                localStorage.setItem('kiosk_station_id', String(id));
                return;
            }
        }
        // Fall back to localStorage
        const storedId = localStorage.getItem('kiosk_station_id');
        if (storedId) {
            setStationId(parseInt(storedId, 10));
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

    const AttractMode = () => {
        const [slide, setSlide] = useState(0);

        useEffect(() => {
            if (!isIdle) return;
            const timer = setInterval(() => {
                setSlide(prev => (prev + 1) % 2);
            }, 5000);
            return () => clearInterval(timer);
        }, [isIdle]);

        if (!isIdle) return null;

        return (
            <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden animate-in fade-in duration-1000">
                {/* VIDEO BACKGROUND */}
                <div className="absolute inset-0 opacity-60">
                    <video
                        autoPlay
                        loop
                        muted
                        className="w-full h-full object-cover"
                        src="https://cdn.pixabay.com/video/2020/09/20/49964-463327685_large.mp4"
                    />
                </div>

                {/* CONTENT OVERLAY */}
                <div className="relative z-10 text-center space-y-8 max-w-4xl mx-auto px-4">
                    {slide === 0 ? (
                        <div className="animate-in slide-in-from-bottom-10 duration-700 fade-in">
                            <h1 className="text-9xl font-black text-white italic tracking-tighter drop-shadow-2xl mb-4">
                                RACE READY
                            </h1>
                            <p className="text-4xl text-blue-400 font-bold tracking-[1em] uppercase mb-12">
                                Kiosk Mode
                            </p>
                            <div className="bg-white/10 backdrop-blur-md px-12 py-6 rounded-full border border-white/20 inline-block animate-pulse">
                                <p className="text-2xl text-white font-bold">TOCA LA PANTALLA PARA EMPEZAR</p>
                            </div>
                        </div>
                    ) : (
                        <div className="animate-in slide-in-from-bottom-10 duration-700 fade-in">
                            <h2 className="text-6xl font-black text-white italic mb-12 drop-shadow-lg">
                                EVENTOS DE HOY
                            </h2>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 text-left">
                                {scenarios.slice(0, 4).map(sc => (
                                    <div key={sc.id} className="bg-black/50 backdrop-blur-md p-6 rounded-2xl border border-white/10 flex items-center justify-between">
                                        <div>
                                            <h3 className="text-2xl font-bold text-white mb-2">{sc.name}</h3>
                                            <span className="text-blue-400 font-mono text-xl font-bold">
                                                {sc.allowed_durations?.[0]} min
                                            </span>
                                        </div>
                                        <div className="bg-white/20 p-3 rounded-full">
                                            <ChevronRight className="text-white" size={32} />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        );
    };


    // --- STEP 1: SCENARIO SELECTION ---
    // --- STEP 1: SCENARIO SELECTION ---
    const ScenarioStep = () => {


        // 1. Fetch Active Lobbies
        const { data: lobbies = [] } = useQuery({
            queryKey: ['lobbies'],
            queryFn: () => axios.get(`${API_URL}/lobby/list?status=active`).then(r => r.data),
            refetchInterval: 5000
        });

        // "Surprise Me" Logic
        const handleSurpriseMe = () => {
            if (scenarios.length > 0) {
                const randomScenario = scenarios[Math.floor(Math.random() * scenarios.length)];
                // Pick random car/track from the scenario's allowed lists
                const randomCar = randomScenario.allowed_cars?.[Math.floor(Math.random() * randomScenario.allowed_cars.length)] || 'ks_mercedes_amg_gt3';
                const randomTrack = randomScenario.allowed_tracks?.[Math.floor(Math.random() * randomScenario.allowed_tracks.length)] || 'spa';

                setSelection({
                    type: 'scenario',
                    scenarioId: randomScenario.id,
                    track: randomTrack,
                    car: randomCar,
                    time: 10, // Default 10 min for surprise
                    isLobby: false
                });
                setDuration(10); // Update duration state
                setStep(2);
            } else {
                alert("No hay escenarios disponibles para aleatorizar.");
            }
        };

        // "Daily Challenge" Logic
        const getDailyChallenge = () => {
            if (scenarios.length === 0) return null;
            const today = new Date();
            const seed = today.getFullYear() * 1000 + (today.getMonth() + 1) * 31 + today.getDate();
            const scenario = scenarios[seed % scenarios.length];

            // Deterministic car/track based on date seed too
            const carIndex = seed % (scenario.allowed_cars?.length || 1);
            const trackIndex = seed % (scenario.allowed_tracks?.length || 1);

            return {
                ...scenario,
                selectedCar: scenario.allowed_cars?.[carIndex] || 'ks_mercedes_amg_gt3',
                selectedTrack: scenario.allowed_tracks?.[trackIndex] || 'spa'
            };
        };
        const dailyScenario = getDailyChallenge();

        // Standard Select Handler
        // Note: For standard scenarios, we might want to respect the original flow of "Expand -> Pick Time"
        // But the previous card simplified it to just "Click -> Step 2".
        // Let's restore the "Expand to pick time" flow as it was seemingly the V1 design, 
        // OR standardise everything to "Selection -> Step 2 where time is picked?"
        // The original code (lines 137-146) showed strict time selection.
        // I will keep the time selection flow for standard scenarios for robustness.

        const [expandedId, setExpandedId] = useState<number | null>(null);

        const handleSelect = (scenario: Scenario, time: number) => {
            // For standard selection, if multiple cars/tracks are allowed, we ideally should let user pick.
            // But for now, let's default to the first one or a "Preset" mode.
            // V1 Kiosk usually implies simplicity.
            // Let's pick the FIRST defined car/track as the default for this button.
            // In a future V2 we could add a sub-step "Select Car".

            const defaultCar = scenario.allowed_cars?.[0] || 'ks_mercedes_amg_gt3';
            const defaultTrack = scenario.allowed_tracks?.[0] || 'spa';

            setSelection({
                type: 'scenario',
                scenarioId: scenario.id!,
                track: defaultTrack,
                car: defaultCar,
                time: time,
                isLobby: false
            });
            setDuration(time); // Update duration state
            setStep(2);
        };

        return (
            <div className="h-full flex flex-col animate-in zoom-in duration-300">
                <h2 className="text-4xl font-black text-white italic tracking-tighter mb-8 text-center drop-shadow-lg">
                    {t('kiosk.chooseCompetition')}
                </h2>

                <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-12">

                    {/* SECTION 1: LIVE MULTIPLAYER */}
                    {lobbies.length > 0 && (
                        <div>
                            <h3 className="text-2xl font-black text-blue-400 mb-6 flex items-center gap-3 border-b border-blue-900/50 pb-2">
                                <Activity className="animate-pulse" /> {t('kiosk.liveLobbies')}
                            </h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                                {lobbies.map((l: any) => (
                                    <div
                                        key={l.id}
                                        onClick={() => {
                                            setSelection({
                                                type: 'lobby',
                                                lobbyId: l.id,
                                                track: l.track,
                                                car: l.car,
                                                isLobby: true,
                                                isHost: false
                                            });
                                            setStep(2);
                                        }}
                                        className="bg-blue-900/20 border-2 border-blue-500/50 hover:bg-blue-900/40 hover:border-blue-400 p-6 rounded-3xl cursor-pointer transition-all group hover:scale-[1.02] shadow-xl shadow-blue-900/20"
                                    >
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="bg-blue-600 text-white text-xs font-black px-3 py-1 rounded-full uppercase tracking-wider">
                                                ONLINE
                                            </div>
                                            {l.status === 'running' ? (
                                                <span className="flex items-center gap-2 text-red-400 font-bold text-xs uppercase animate-pulse">
                                                    <span className="w-2 h-2 rounded-full bg-red-500" /> EN CARRERA
                                                </span>
                                            ) : (
                                                <span className="flex items-center gap-2 text-green-400 font-bold text-xs uppercase">
                                                    <span className="w-2 h-2 rounded-full bg-green-500" /> ESPERANDO
                                                </span>
                                            )}
                                        </div>
                                        <h4 className="text-2xl font-black text-white group-hover:text-blue-200 truncate">{l.name}</h4>
                                        <p className="text-blue-200/60 font-mono text-sm mt-1">{l.track} | {l.car}</p>
                                        <div className="mt-6 flex items-center justify-between">
                                            <div className="flex -space-x-3">
                                                {Array.from({ length: Math.min(3, l.player_count) }).map((_, i) => (
                                                    <div key={i} className="w-8 h-8 rounded-full bg-gray-700 border-2 border-gray-900 flex items-center justify-center text-xs text-white font-bold">
                                                        P{i + 1}
                                                    </div>
                                                ))}
                                                {l.player_count > 3 && (
                                                    <div className="w-8 h-8 rounded-full bg-gray-800 border-2 border-gray-900 flex items-center justify-center text-xs text-white font-bold">
                                                        +{l.player_count - 3}
                                                    </div>
                                                )}
                                            </div>
                                            <span className="text-white font-black text-lg">{l.player_count} / {l.max_players}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* SECTION 2: SPECIAL EVENTS */}
                    <div>
                        <h3 className="text-2xl font-black text-yellow-500 mb-6 flex items-center gap-3 border-b border-yellow-900/30 pb-2">
                            <Trophy className="text-yellow-500" /> {t('kiosk.specialEvents')}
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                            {/* DAILY CHALLENGE */}
                            {dailyScenario && (
                                <div
                                    onClick={() => {
                                        setSelection({
                                            type: 'scenario',
                                            scenarioId: dailyScenario.id!,
                                            track: dailyScenario.selectedTrack,
                                            car: dailyScenario.selectedCar,
                                            time: 10,
                                            isLobby: false
                                        });
                                        setDuration(10); // Update duration state
                                        setStep(2);
                                    }}
                                    className="group relative bg-gradient-to-br from-yellow-600 to-orange-700 rounded-3xl p-6 cursor-pointer border-4 border-yellow-400/50 hover:border-white shadow-2xl hover:scale-[1.03] transition-all overflow-hidden flex flex-col justify-between h-80"
                                >
                                    <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black text-xs px-3 py-1 rounded-bl-xl z-20">
                                        RETO DEL DÍA
                                    </div>
                                    <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all z-0" />

                                    <div className="relative z-10 text-center mt-4 flex-1 flex flex-col items-center justify-center">
                                        <Trophy size={64} className="mx-auto text-yellow-200 mb-4 drop-shadow-lg animate-bounce" />
                                        <h3 className="text-3xl font-black text-white leading-none uppercase">DAILY<br />CHALLENGE</h3>
                                        <p className="mt-2 text-yellow-200 font-bold uppercase">{dailyScenario.selectedTrack} • {dailyScenario.selectedCar}</p>
                                        <p className="text-xs text-white/70 mt-1">{dailyScenario.name}</p>
                                    </div>
                                    <button className="relative z-10 w-full bg-white text-black font-black py-3 rounded-xl mt-4 hover:bg-gray-200 transition-colors uppercase text-sm tracking-wider">
                                        ACEPTAR RETO
                                    </button>
                                </div>
                            )}

                            {/* SURPRISE ME */}
                            <div
                                onClick={handleSurpriseMe}
                                className="group relative bg-gradient-to-br from-purple-600 to-pink-600 rounded-3xl p-6 cursor-pointer border-4 border-white/10 hover:border-white shadow-2xl hover:scale-[1.03] transition-all overflow-hidden flex flex-col justify-between h-80"
                            >
                                <div className="absolute inset-0 flex flex-col items-center justify-center opacity-20 z-0">
                                    <div className="text-9xl font-black text-white">?</div>
                                </div>
                                <div className="relative z-10 flex flex-col items-center justify-center h-full text-center">
                                    <Gauge size={80} className="text-white mb-6 drop-shadow-lg group-hover:rotate-180 transition-transform duration-700" />
                                    <h3 className="text-4xl font-black text-white leading-tight">¡SORPRÉNDEME!</h3>
                                    <p className="text-pink-200 mt-2 font-medium">Combinación Aleatoria</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 3: STANDARD SCENARIOS */}
                    <div>
                        <h3 className="text-2xl font-black text-gray-400 mb-6 flex items-center gap-3 border-b border-gray-800 pb-2">
                            <Flag /> PRÁCTICA LIBRE
                        </h3>
                        {scenarios.length === 0 ? (
                            <div className="text-center text-gray-500 py-12">
                                <WifiOff size={48} className="mx-auto mb-4 opacity-50" />
                                <p>No hay escenarios disponibles.</p>
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                                {scenarios.map(scenario => (
                                    <div
                                        key={scenario.id}
                                        onClick={() => setExpandedId(expandedId === scenario.id ? null : scenario.id!)}
                                        className={`relative bg-gradient-to-br from-gray-800 to-gray-900 rounded-3xl p-8 border-4 cursor-pointer transition-all shadow-2xl group overflow-hidden ${expandedId === scenario.id ? 'border-blue-500 scale-105 z-10' : 'border-gray-700 hover:border-gray-500 hover:scale-[1.02]'}`}
                                    >
                                        {/* Header */}
                                        <div className="flex justify-between items-start mb-4">
                                            <div className="bg-gray-700 p-3 rounded-2xl">
                                                <Flag size={32} className={expandedId === scenario.id ? "text-blue-400" : "text-gray-400"} />
                                            </div>
                                            {scenario.allowed_cars.length > 0 && (
                                                <span className="bg-gray-700 text-white text-xs font-bold px-2 py-1 rounded">
                                                    RESTRICTED
                                                </span>
                                            )}
                                        </div>

                                        <h3 className="text-3xl font-black text-white mb-2 uppercase leading-none">{scenario.name}</h3>
                                        <p className="text-gray-400 mb-6 min-h-[3rem] text-sm line-clamp-2">{scenario.description || 'Competición abierta'}</p>

                                        {/* Time Selection (Visible only when expanded) */}
                                        {expandedId === scenario.id ? (
                                            <div className="space-y-3 animate-in fade-in slide-in-from-bottom-4 duration-300">
                                                <p className="text-xs font-bold text-blue-400 uppercase tracking-widest mb-2">{t('kiosk.pickDuration')}</p>
                                                <div className="grid grid-cols-2 gap-3">
                                                    {(scenario.allowed_durations?.length ? scenario.allowed_durations : [10, 15, 20]).map((mins: number) => (
                                                        <button
                                                            key={mins}
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleSelect(scenario, mins);
                                                            }}
                                                            className="bg-blue-600 hover:bg-blue-500 text-white font-black py-3 rounded-xl border border-blue-400/30 flex items-center justify-center gap-2 transition-transform active:scale-95"
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
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        );
    };

    // --- STEP 2: DRIVER IDENTIFICATION ---
    const DriverStep = () => {
        const [name, setName] = useState('');
        const [email, setEmail] = useState('');

        // Fetch real leaderboard from API
        const { data: leaderboardData } = useQuery({
            queryKey: ['kiosk-leaderboard'],
            queryFn: async () => {
                const res = await axios.get(`${API_URL}/telemetry/leaderboard`, {
                    params: { limit: 5, period: 'all' }
                });
                return res.data;
            },
            retry: false,
            staleTime: 60000 // Refresh every minute
        });

        // Format milliseconds to mm:ss.xxx
        const formatTime = (ms: number) => {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(3);
            return `${minutes}:${seconds.padStart(6, '0')}`;
        };

        // Map API data to display format with fallback
        const topTimes = (leaderboardData || []).map((entry: any, idx: number) => ({
            pos: idx + 1,
            name: entry.driver_name || 'Unknown',
            time: formatTime(entry.best_time || 0),
            car: entry.car_model || 'Unknown Car'
        }));

        const handleLogin = async (e: React.FormEvent) => {
            e.preventDefault();
            try {
                setDriver({ id: 1, name: name || "Guest Driver" });

                // If content is already selected (e.g. Surprise/Daily/Lobby), skip ContentStep
                if (selection?.car && selection?.track) {
                    setStep(4); // Go to Difficulty
                } else {
                    setStep(3); // Select Content
                }
            } catch {
                alert("Error registering driver");
            }
        };

        return (
            <div className="flex items-center justify-center h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Two Column Layout: Form + Leaderboard */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-5xl">
                    {/* LEFT: Registration Form */}
                    <div className="flex flex-col items-center justify-center">
                        <h1 className="text-5xl font-black text-white italic mb-2 tracking-tighter">{t('kiosk.welcomeDriver')}</h1>
                        <p className="text-xl text-gray-400 mb-8">{t('kiosk.identifyToSave')}</p>

                        <form onSubmit={handleLogin} className="w-full max-w-lg space-y-6">
                            <div className="space-y-2">
                                <label className="text-gray-400 font-bold ml-1">{t('kiosk.driverName')}</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                    placeholder="Ej. Max Verstappen"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-gray-400 font-bold ml-1">{t('kiosk.emailOptional')}</label>
                                <input
                                    type="email"
                                    className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                    placeholder="max@redbull.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-2xl py-6 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                                {t('kiosk.start')} <ChevronRight size={32} />
                            </button>
                        </form>
                    </div>

                    {/* RIGHT: Mini Leaderboard */}
                    <div className="bg-black/40 rounded-3xl border border-gray-800 p-6 backdrop-blur-sm animate-in slide-in-from-right-8 duration-700">
                        <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
                            <Trophy className="text-yellow-400" /> {t('kiosk.topTimes')}
                        </h3>
                        <div className="space-y-3">
                            {topTimes.map((entry, idx) => (
                                <div
                                    key={entry.pos}
                                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${idx === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50'}`}
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${idx === 0 ? 'bg-yellow-500 text-black' :
                                        idx === 1 ? 'bg-gray-400 text-black' :
                                            idx === 2 ? 'bg-orange-700 text-white' :
                                                'bg-gray-700 text-gray-300'
                                        }`}>
                                        {entry.pos}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{entry.name}</p>
                                        <p className="text-xs text-gray-500">{entry.car}</p>
                                    </div>
                                    <div className={`font-mono font-bold text-lg ${idx === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                        {entry.time}
                                    </div>
                                    {idx === 0 && <Medal className="text-yellow-400" size={20} />}
                                </div>
                            ))}
                        </div>
                        <p className="text-center text-gray-600 text-sm mt-4">{t('kiosk.beatRecord')}</p>
                    </div>
                </div>
            </div>
        );
    };



    // --- STEP 3: CONTENT SELECTION ---
    const ContentStep = () => {
        // Fetch content for the specific station (uses cached real content or mock fallback)
        const { data: allCars = [] } = useQuery({
            queryKey: ['cars', stationId],
            queryFn: () => getCars(stationId)
        });
        const { data: allTracks = [] } = useQuery({
            queryKey: ['tracks', stationId],
            queryFn: () => getTracks(stationId)
        });

        // Filter based on selected Scenario
        const cars = allCars.filter((c: any) => {
            if (!selectedScenario || !selectedScenario.allowed_cars || selectedScenario.allowed_cars.length === 0) return true;
            return selectedScenario.allowed_cars.includes(c.id);
        });

        const tracks = allTracks.filter((t: any) => {
            if (!selectedScenario || !selectedScenario.allowed_tracks || selectedScenario.allowed_tracks.length === 0) return true;
            return selectedScenario.allowed_tracks.includes(t.id);
        });

        const [selCar, setSelCar] = useState<string | null>(null);
        const [selTrack, setSelTrack] = useState<string | null>(null);

        // --- STEP 1: SCENARIO SELECTION ---
        const ScenarioStep = () => {
            const { data: scenarios = [] } = useQuery({
                queryKey: ['scenarios'],
                queryFn: getScenarios
            });

            // "Surprise Me" Logic
            const handleSurpriseMe = () => {
                // We need full content list first. If not loaded, we can't fully randomize effectively here unless we move logic.
                // But actually, we already have `getCars` and `getTracks` available.
                // We can trigger a quick random selection if we fetch them.
                // Alternatively, since we are in Step 1, we might not have content loaded (Step 3).
                // Strategy: Jump to Step 3, trigger randomization immediately there?
                // Or better: Just set a flag "randomize: true" or pick from scenarios if available.
                // Let's assume we want to pick from "Content" (Cars/Tracks) directly, skipping the manual content step.

                // Simpler approach for now: Pick a random Scenario if any exist, or make it a "virtual" mode.
                // Given the user wants chaos/fun, let's make it pick a random scenario from the list.
                if (scenarios.length > 0) {
                    const random = scenarios[Math.floor(Math.random() * scenarios.length)];
                    setSelection({
                        type: 'scenario',
                        scenarioId: random.id,
                        track: random.allowed_tracks?.[0] || '',
                        car: random.allowed_cars?.[0] || '',
                        weather: 'sun',
                        time: 'noon',
                        isLobby: false
                    });
                    setStep(2); // Go to Driver
                } else {
                    alert("No hay escenarios disponibles para aleatorizar.");
                }
            };

            // "Daily Challenge" Logic
            // Deterministic Scenario based on Date
            const getDailyChallenge = () => {
                if (scenarios.length === 0) return null;
                const today = new Date();
                const seed = today.getFullYear() * 1000 + (today.getMonth() + 1) * 31 + today.getDate();
                return scenarios[seed % scenarios.length]; // Consistent daily pick
            };

            const dailyScenario = getDailyChallenge();

            return (
                <div className="h-full flex flex-col animate-in zoom-in duration-300">
                    <h2 className="text-4xl font-black text-white italic tracking-tighter mb-8 text-center drop-shadow-lg">
                        ELIGE TU COMPETICIÓN
                    </h2>

                    <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 overflow-y-auto px-4 pb-4">

                        {/* DAILY CHALLENGE CARD */}
                        {dailyScenario && (
                            <div
                                onClick={() => {
                                    setSelection({
                                        type: 'scenario',
                                        scenarioId: dailyScenario.id,
                                        track: dailyScenario.allowed_tracks?.[0] || '',
                                        car: dailyScenario.allowed_cars?.[0] || '',
                                        weather: 'sun',
                                        time: 'noon',
                                        isLobby: false
                                    });
                                    setStep(2);
                                }}
                                className="group relative bg-gradient-to-br from-yellow-600 to-orange-700 rounded-3xl p-6 cursor-pointer border-4 border-yellow-400/50 hover:border-white shadow-2xl hover:scale-[1.03] transition-all overflow-hidden flex flex-col justify-between"
                            >
                                <div className="absolute top-0 right-0 bg-yellow-400 text-black font-black text-xs px-3 py-1 rounded-bl-xl z-20">
                                    RED DEL DÍA
                                </div>
                                <div className="absolute inset-0 bg-black/30 group-hover:bg-black/10 transition-all z-0" />

                                <div className="relative z-10 text-center mt-4">
                                    <Trophy size={64} className="mx-auto text-yellow-200 mb-2 drop-shadow-lg animate-bounce" />
                                    <h3 className="text-2xl font-black text-white leading-tight uppercase">DAILY CHALLENGE</h3>
                                    <div className="mt-4 bg-black/40 p-3 rounded-xl backdrop-blur-sm">
                                        <p className="text-white font-bold text-lg">{dailyScenario.track}</p>
                                        <p className="text-yellow-200 text-sm">{dailyScenario.car}</p>
                                    </div>
                                </div>
                                <button className="relative z-10 w-full bg-white text-black font-black py-3 rounded-xl mt-4 hover:bg-gray-200 transition-colors uppercase text-sm tracking-wider">
                                    ACEPTAR RETO
                                </button>
                            </div>
                        )}

                        {/* SURPRISE ME CARD */}
                        <div
                            onClick={handleSurpriseMe}
                            className="group relative bg-gradient-to-br from-violet-600 via-purple-600 to-fuchsia-600 rounded-3xl p-1 cursor-pointer hover:scale-[1.03] transition-all shadow-2xl hover:shadow-purple-500/50 overflow-hidden"
                        >
                            {/* Animated Background Overlay */}
                            <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_120%,rgba(255,255,255,0.2),transparent)] opacity-0 group-hover:opacity-100 transition-opacity duration-700" />

                            {/* Inner Container */}
                            <div className="relative h-full w-full bg-white/5 backdrop-blur-sm rounded-[22px] border-2 border-white/10 group-hover:border-white/40 flex flex-col items-center justify-center p-6 transition-colors">

                                {/* Background Icon */}
                                <div className="absolute -right-6 -top-6 text-white/5 transform rotate-12 group-hover:rotate-45 transition-transform duration-700">
                                    <Gauge size={180} />
                                </div>

                                <div className="relative z-10 flex flex-col items-center text-center">
                                    <div className="mb-6 relative">
                                        <div className="absolute inset-0 bg-white/20 blur-xl rounded-full animate-pulse" />
                                        <Gauge size={72} className="relative text-white drop-shadow-lg group-hover:rotate-[360deg] transition-transform duration-1000 ease-out" />
                                    </div>

                                    <h3 className="text-4xl font-black text-white italic tracking-tighter drop-shadow-xl mb-2">
                                        ¡SORPRÉNDEME!
                                    </h3>

                                    <span className="bg-black/30 text-white/90 text-xs font-bold uppercase tracking-[0.2em] px-4 py-2 rounded-full border border-white/10 group-hover:bg-white group-hover:text-purple-600 transition-colors">
                                        Modo Aleatorio
                                    </span>
                                </div>
                            </div>
                        </div>


                        {/* EXISTING SCENARIOS MAPPED */}
                        {scenarios.map((s: any) => (
                            <div
                                key={s.id}
                                onClick={() => {
                                    setSelection({
                                        type: 'scenario',
                                        scenarioId: s.id,
                                        track: s.track,
                                        car: s.car,
                                        weather: s.weather,
                                        time: s.time,
                                        isLobby: false
                                    });
                                    setStep(2);
                                }}
                                className="group relative h-64 bg-gray-900 rounded-3xl overflow-hidden cursor-pointer border-2 border-gray-700 hover:border-blue-500 transition-all hover:scale-[1.02] hover:shadow-2xl hover:shadow-blue-900/50"
                            >
                                {/* ... existing card content ... */}
                                <img
                                    src={s.image || "/api/placeholder/400/320"}
                                    alt={s.name}
                                    className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-80 transition-opacity"
                                />
                                <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />

                                <div className="absolute bottom-0 left-0 right-0 p-6">
                                    <span className="bg-blue-600 text-xs font-bold px-2 py-1 rounded-md text-white mb-2 inline-block">
                                        {s.category || 'SCENARIO'}
                                    </span>
                                    <h3 className="text-2xl font-black text-white leading-none mb-1">{s.name}</h3>
                                    <div className="flex items-center gap-2 text-gray-300 text-sm font-medium">
                                        <span>{s.track}</span>
                                        <span>•</span>
                                        <span>{s.car}</span>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )
        };

        const handleNext = () => {
            if (selCar && selTrack) {
                setSelection({ car: selCar, track: selTrack });
                setStep(4); // Skip to Wait/Difficulty (Step 4 is Difficulty now in my mind, let's check code)
                // Wait, original Step 3 is Difficulty.
                // My new flow: 1:Scenario -> 2:Driver -> 3:Content -> 4:Difficulty
            }
        }

        return (
            <div className="h-full flex flex-col animate-in slide-in-from-right duration-300">
                <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                    <span className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">1</span>
                    ELIGE TU MÁQUINA Y PISTA
                </h2>

                <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden min-h-0">
                    {/* CARS */}
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Car /> COCHES DISPONIBLES ({cars?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {cars?.map((c: any) => (
                                <div
                                    key={c.id}
                                    onClick={() => setSelCar(c.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 ${selCar === c.id ? 'border-blue-500 bg-blue-500/20 scale-[1.02]' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'}`}
                                >
                                    {/* Show image if available, nothing if not */}
                                    {c.image_url && (
                                        <img
                                            src={c.image_url}
                                            alt={c.name}
                                            className="w-20 h-12 object-cover rounded bg-black/50"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{c.name}</p>
                                        <p className="text-xs text-gray-500">{c.brand || 'Generic'}</p>
                                    </div>
                                    {selCar === c.id && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* TRACKS */}
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Flag /> CIRCUITOS ({tracks?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {tracks?.map((t: any) => (
                                <div
                                    key={t.id}
                                    onClick={() => setSelTrack(t.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 ${selTrack === t.id ? 'border-green-500 bg-green-500/20 scale-[1.02]' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'}`}
                                >
                                    {/* Show image if available, nothing if not */}
                                    {t.image_url && (
                                        <img
                                            src={t.image_url}
                                            alt={t.name}
                                            className="w-20 h-12 object-cover rounded bg-black/50"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{t.name}</p>
                                        <p className="text-xs text-gray-500">{t.layout || 'Main'}</p>
                                    </div>
                                    {selTrack === t.id && <div className="w-3 h-3 rounded-full bg-green-500" />}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="py-6 flex justify-end">
                    <button
                        disabled={!selCar || !selTrack}
                        onClick={handleNext}
                        className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-black text-xl px-12 py-4 rounded-xl shadow-lg flex items-center gap-3 transition-all"
                    >
                        SIGUIENTE <ChevronRight />
                    </button>
                </div>
            </div>
        )
    };

    // --- STEP 4: DIFFICULTY ---
    const DifficultyStep = () => {
        return (
            <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full">
                <h2 className="text-4xl font-black text-white mb-6">CONFIGURA TU SESIÓN</h2>


                {/* INFO PANEL: CAR & TRACK */}
                {(() => {
                    // Mock Generators (Inline for access)
                    const getMockSpecs = (id: string = '') => {
                        const seed = id.charCodeAt(0) || 0;
                        return {
                            bhp: `${400 + (seed % 20) * 10} HP`,
                            weight: `${1100 + (seed % 10) * 20} kg`,
                            top_speed: `${260 + (seed % 15) * 5} km/h`
                        };
                    };
                    const specs = selectedCarObj?.specs?.bhp ? selectedCarObj.specs : getMockSpecs(selectedCarObj?.id);
                    const mapUrl = selectedTrackObj?.map_url || "https://upload.wikimedia.org/wikipedia/commons/thumb/6/67/Circuit_de_Spa-Francorchamps_trace.svg/1200px-Circuit_de_Spa-Francorchamps_trace.svg.png";

                    return (
                        <div className="w-full grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
                            {/* CAR SPECS */}
                            <div className="bg-gray-800/60 border border-gray-700 rounded-3xl p-6 flex flex-col relative overflow-hidden group">
                                <div className="absolute top-0 right-0 p-4 opacity-10 group-hover:opacity-30 transition-opacity">
                                    <Car size={120} />
                                </div>
                                <h4 className="text-gray-400 font-bold text-xs tracking-widest uppercase mb-4">VEHÍCULO SELECCIONADO</h4>
                                <div className="text-2xl font-black text-white mb-1">{selectedCarObj?.name || selection?.car}</div>
                                <div className="text-blue-400 font-bold text-sm mb-6">{selectedCarObj?.brand || 'Marca Desconocida'}</div>

                                <div className="grid grid-cols-3 gap-4 mt-auto relative z-10">
                                    <div className="bg-black/30 rounded-xl p-3 text-center">
                                        <div className="text-gray-500 text-[10px] font-bold uppercase">Potencia</div>
                                        <div className="text-white font-black text-lg">{specs.bhp}</div>
                                    </div>
                                    <div className="bg-black/30 rounded-xl p-3 text-center">
                                        <div className="text-gray-500 text-[10px] font-bold uppercase">Peso</div>
                                        <div className="text-white font-black text-lg">{specs.weight}</div>
                                    </div>
                                    <div className="bg-black/30 rounded-xl p-3 text-center">
                                        <div className="text-gray-500 text-[10px] font-bold uppercase">Top Speed</div>
                                        <div className="text-white font-black text-lg">{specs.top_speed}</div>
                                    </div>
                                </div>
                            </div>

                            {/* TRACK MAP & RECORD */}
                            <div className="bg-gray-800/60 border border-gray-700 rounded-3xl p-6 flex flex-col relative overflow-hidden">
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h4 className="text-gray-400 font-bold text-xs tracking-widest uppercase mb-1">CIRCUITO</h4>
                                        <div className="text-xl font-black text-white">{selectedTrackObj?.name || selection?.track}</div>
                                    </div>
                                    <div className="text-right w-full max-w-[50%]">
                                        <div className="text-yellow-500 font-bold text-xs uppercase flex items-center justify-end gap-1 mb-2">
                                            <Trophy size={12} /> Top Tiempos
                                        </div>
                                        <div className="space-y-1">
                                            {leaderboard.slice(0, 3).map((entry: any, idx: number) => (
                                                <div key={idx} className="flex justify-between items-center text-xs gap-3">
                                                    <span className={`font-mono font-bold ${idx === 0 ? 'text-yellow-400' : 'text-gray-400'}`}>
                                                        {idx + 1}. {entry.driver_name}
                                                    </span>
                                                    <span className="font-mono text-white">{entry.time}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className="flex-1 flex items-center justify-center relative min-h-[120px] p-4">
                                    {/* MAP */}
                                    <img src={mapUrl} className="h-full w-auto object-contain opacity-80 drop-shadow-[0_0_10px_rgba(255,255,255,0.3)] filter invert" alt="Track Map" />
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* VISUAL & WEATHER CONDITIONS */}
                <div className="w-full mb-8">
                    <p className="text-gray-400 font-bold mb-4 ml-2 uppercase text-sm tracking-widest">CONDICIONES DE PISTA</p>
                    <div className="bg-gray-800/50 p-2 rounded-2xl grid grid-cols-4 gap-2">
                        <button onClick={() => setTimeOfDay('noon')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${timeOfDay === 'noon' ? 'bg-yellow-500 text-black shadow-lg shadow-yellow-500/20' : 'hover:bg-gray-700 text-gray-400'}`}>
                            <Sun size={20} />
                            <span className="text-xs font-bold">MEDIODÍA</span>
                        </button>
                        <button onClick={() => setTimeOfDay('evening')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${timeOfDay === 'evening' ? 'bg-orange-500 text-white shadow-lg shadow-orange-500/20' : 'hover:bg-gray-700 text-gray-400'}`}>
                            <Sunset size={20} />
                            <span className="text-xs font-bold">ATARDECER</span>
                        </button>
                        <button onClick={() => setWeather('cloud')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'cloud' ? 'bg-gray-500 text-white shadow-lg' : 'hover:bg-gray-700 text-gray-400'}`}>
                            <Cloud size={20} />
                            <span className="text-xs font-bold">NUBLADO</span>
                        </button>
                        <button onClick={() => setWeather('rain')} className={`p-3 rounded-xl flex flex-col items-center gap-2 transition-all ${weather === 'rain' ? 'bg-blue-600 text-white shadow-lg shadow-blue-600/20' : 'hover:bg-gray-700 text-gray-400'}`}>
                            <CloudRain size={20} />
                            <span className="text-xs font-bold">LLUVIA</span>
                        </button>
                    </div>
                </div>
                <div className="w-full mb-8">
                    <p className="text-gray-400 font-bold mb-4 ml-2 uppercase text-sm tracking-widest">TRANSMISIÓN</p>
                    <div className="grid grid-cols-2 gap-6">
                        <button
                            onClick={() => setTransmission('automatic')}
                            className={`p-6 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all ${transmission === 'automatic' ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                        >
                            <Gauge size={32} />
                            <div className="text-left">
                                <div className="font-black text-xl">AUTOMÁTICO</div>
                                <div className="text-xs font-medium opacity-80">Cambios automáticos</div>
                            </div>
                        </button>
                        <button
                            onClick={() => setTransmission('manual')}
                            className={`p-6 rounded-2xl border-2 flex items-center justify-center gap-3 transition-all ${transmission === 'manual' ? 'bg-blue-600 border-blue-400 text-white shadow-lg shadow-blue-500/30' : 'bg-gray-800 border-gray-700 text-gray-400 hover:bg-gray-700'}`}
                        >
                            <Activity size={32} />
                            <div className="text-left">
                                <div className="font-black text-xl">MANUAL</div>
                                <div className="text-xs font-medium opacity-80">Levas o Palanca</div>
                            </div>
                        </button>
                    </div>
                </div>

                {/* DIFFICULTY SELECTOR */}
                <div className="w-full mb-8">
                    <p className="text-gray-400 font-bold mb-4 ml-2 uppercase text-sm tracking-widest">NIVEL DE AYUDAS</p>
                    <div className="grid grid-cols-3 gap-6 w-full">
                        <button
                            onClick={() => setDifficulty('novice')}
                            className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'novice' ? 'border-green-500 bg-green-500/20 scale-105 shadow-2xl shadow-green-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                        >
                            <ShieldCheck size={64} className={difficulty === 'novice' ? 'text-green-400' : 'text-gray-500'} />
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-white">NOVATO</h3>
                                <p className="text-gray-400 mt-2">ABS & TC Máximos<br />Control Estabilidad</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setDifficulty('amateur')}
                            className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'amateur' ? 'border-yellow-500 bg-yellow-500/20 scale-105 shadow-2xl shadow-yellow-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                        >
                            <Activity size={64} className={difficulty === 'amateur' ? 'text-yellow-400' : 'text-gray-500'} />
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-white">AMATEUR</h3>
                                <p className="text-gray-400 mt-2">ABS & TC Fábrica<br />Daños Visuales</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setDifficulty('pro')}
                            className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'pro' ? 'border-red-500 bg-red-500/20 scale-105 shadow-2xl shadow-red-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                        >
                            <Trophy size={64} className={difficulty === 'pro' ? 'text-red-400' : 'text-gray-500'} />
                            <div className="text-center">
                                <h3 className="text-2xl font-black text-white">PRO</h3>
                                <p className="text-gray-400 mt-2">Sin Ayudas<br />Daños Reales 100%</p>
                            </div>
                        </button>
                    </div>
                </div>

                {/* DURATION (READ ONLY OR SELECTABLE?) */}
                <div className="w-full bg-gray-900/50 p-6 rounded-2xl border border-gray-800 flex items-center justify-center gap-4 mb-8">
                    <Clock className="text-blue-400" />
                    <span className="font-bold text-gray-300">DURACIÓN SELECCIONADA:</span>
                    <span className="font-black text-2xl text-white">{duration} Minutos</span>
                </div>

                <div className="w-full">
                    <button
                        onClick={() => {
                            paymentHandledRef.current = false;
                            setPaymentInfo(null);
                            setPaymentError(null);
                            setStep(5);
                        }}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-3xl py-8 rounded-3xl shadow-2xl shadow-red-600/20 active:scale-95 transition-all flex items-center justify-center gap-4 disabled:opacity-50"
                    >
                        {t('kiosk.payAndLaunch')} <Play fill="currentColor" size={32} />
                    </button>
                    <p className="text-center text-gray-500 mt-4 text-sm">{paymentNote}</p>
                </div>
            </div>
        );
    };

    // --- STEP 5: PAYMENT ---
    const PaymentStep = () => {
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

        const joinLobbyMutation = useMutation({
            mutationFn: async () => {
                await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/join`, {
                    station_id: stationId
                });
            },
            onSuccess: () => {
                setStep(6);
            },
            onError: (err) => {
                console.error("Failed to join lobby:", err);
                alert("Error al unirse a la sala. Puede que esté llena o ya no exista.");
                setStep(1); // Go back to start on failure to avoid stuck state
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
                        joinLobbyMutation.mutate();
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
                <h2 className="text-4xl font-black text-white mb-4">{t('kiosk.paymentTitle')}</h2>
                <p className="text-gray-400 mb-6 text-center">{t('kiosk.paymentSubtitle')}</p>

                <div className="bg-gray-900/60 border border-gray-700 rounded-2xl p-6 w-full mb-6">
                    <div className="flex items-center justify-between text-sm text-gray-400 uppercase font-bold">
                        <span>{t('kiosk.durationLabel')}</span>
                        <span className="text-white">{duration} min</span>
                    </div>
                    <div className="flex items-center justify-between text-sm text-gray-400 uppercase font-bold mt-2">
                        <span>{t('kiosk.totalLabel')}</span>
                        <span className="text-white text-2xl">€{displayAmount} {currency}</span>
                    </div>
                </div>

                <div className="flex gap-4 mb-6">
                    <button
                        onClick={() => {
                            setPaymentProvider('stripe_qr');
                            setPaymentInfo(null);
                            setPaymentError(null);
                        }}
                        className={`px-6 py-3 rounded-xl font-black border-2 transition-all ${paymentProvider === 'stripe_qr' ? 'bg-blue-600 border-blue-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                    >
                        Stripe QR
                    </button>
                    <button
                        onClick={() => {
                            setPaymentProvider('bizum');
                            setPaymentInfo(null);
                            setPaymentError(null);
                        }}
                        className={`px-6 py-3 rounded-xl font-black border-2 transition-all ${paymentProvider === 'bizum' ? 'bg-green-600 border-green-500 text-white' : 'bg-gray-800 border-gray-700 text-gray-400 hover:border-gray-500'}`}
                    >
                        Bizum
                    </button>
                </div>

                <div className="bg-gray-900/40 border border-gray-700 rounded-2xl p-6 w-full flex flex-col items-center gap-4">
                    {paymentError && (
                        <div className="text-red-400 font-bold">{paymentError}</div>
                    )}
                    {!paymentError && paymentProvider === 'stripe_qr' && paymentInfo?.checkout_url && (
                        <>
                            <QRCodeCanvas value={paymentInfo.checkout_url} size={200} level="H" />
                            <p className="text-xs text-gray-400">{t('kiosk.scanToPay')}</p>
                        </>
                    )}
                    {!paymentError && paymentProvider === 'bizum' && (
                        <div className="text-center text-gray-300 space-y-2">
                            <p className="font-bold">{t('kiosk.payWithBizum')}</p>
                            {paymentInfo?.instructions ? (
                                <p className="text-sm text-gray-400">{paymentInfo.instructions}</p>
                            ) : (
                                <p className="text-sm text-gray-400">{t('kiosk.bizumPending')}</p>
                            )}
                            {paymentInfo?.reference && (
                                <div className="text-lg font-black text-white">{paymentInfo.reference}</div>
                            )}
                        </div>
                    )}
                    {!paymentError && paymentInfo?.status === 'pending' && (
                        <p className="text-xs text-gray-500">{t('kiosk.waitingPayment')}</p>
                    )}
                </div>

                <div className="w-full mt-6 flex gap-4">
                    <button
                        onClick={() => setStep(4)}
                        className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700 transition-all"
                    >
                        {t('common.back')}
                    </button>
                    <button
                        onClick={() => createCheckout.mutate(paymentProvider)}
                        className="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-4 rounded-xl transition-all"
                    >
                        {t('kiosk.retryPayment')}
                    </button>
                </div>
            </div>
        );
    };

    // --- STEP 6: WAITING ROOM ---
    const WaitingRoom = () => {
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

        // Listen for status change to 'running' -> Start Game
        useEffect(() => {
            if (lobbyData?.status === 'running') {
                setIsLaunched(true);
            }
        }, [lobbyData?.status]);

        const isHost = stationId === lobbyData?.host_station_id;
        const myPlayer = lobbyData?.players?.find((p: any) => p.station_id === stationId);
        const isReady = myPlayer?.ready || false;

        // Auto-Start Timer Logic
        const [timeLeft, setTimeLeft] = useState(120); // 2 minutes default

        useEffect(() => {
            if (!lobbyData?.created_at) return;
            const createdTime = new Date(lobbyData.created_at).getTime();
            const now = new Date().getTime();
            const elapsed = Math.floor((now - createdTime) / 1000);
            const remaining = Math.max(0, 120 - elapsed);

            setTimeLeft(remaining);

            // Auto-Start if host and time is up
            if (remaining === 0 && isHost && lobbyData.status === 'waiting' && !StartRaceMutation.isPending) {
                // Check if at least 2 players? User didn't specify, but lobby requires 2.
                // We will try to start. If backend rejects (only 1 player), it will fail silently here or log error.
                if ((lobbyData.players?.length || 0) >= 2) {
                    console.log("Auto-starting race due to timeout...");
                    StartRaceMutation.mutate();
                }
            }
        }, [lobbyData?.created_at, lobbyData?.status, isHost, StartRaceMutation]);

        // Calculate total ready
        const allReady = lobbyData?.players?.length > 0 && lobbyData?.players?.every((p: any) => p.ready);

        const formatTime = (seconds: number) => {
            const m = Math.floor(seconds / 60);
            const s = seconds % 60;
            return `${m}:${s.toString().padStart(2, '0')}`;
        };

        return (
            <div className="h-full flex flex-col items-center p-8 animate-in zoom-in duration-300 max-w-6xl mx-auto w-full">
                <div className="w-full flex justify-between items-end mb-8 border-b border-gray-800 pb-6">
                    <div>
                        <span className="bg-purple-600 text-white px-4 py-1 rounded-full font-bold text-sm tracking-widest mb-4 inline-block animate-pulse">
                            SALA DE ESPERA
                        </span>
                        <h2 className="text-5xl font-black text-white">{lobbyData?.name || 'Cargando...'}</h2>
                        <p className="text-gray-400 mt-2 font-mono text-xl">{lobbyData?.track} | {lobbyData?.car}</p>
                    </div>
                    <div className="text-right flex flex-col items-end">
                        <p className="text-gray-500 font-bold uppercase tracking-widest mb-1">INICIO AUTOMÁTICO EN</p>
                        <p className={`text-4xl font-black font-mono ${timeLeft <= 10 ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                            {formatTime(timeLeft)}
                        </p>
                        <p className="text-sm font-bold text-blue-400 mt-2">{lobbyData?.status?.toUpperCase()}</p>
                    </div>
                </div>

                {/* PLAYER GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 w-full flex-1 overflow-y-auto mb-8">
                    {lobbyData?.players?.map((player: { station_id: number; station_name: string; slot: number; ready: boolean }, idx: number) => {
                        const isMe = player.station_id === stationId;
                        return (
                            <div key={player.station_id} className={`p-6 rounded-2xl border-2 flex items-center justify-between ${isMe ? 'bg-blue-900/20 border-blue-500' : 'bg-gray-800/50 border-gray-700'}`}>
                                <div className="flex items-center gap-4">
                                    <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-xl ${player.ready ? 'bg-green-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <p className={`font-bold text-xl ${isMe ? 'text-white' : 'text-gray-300'}`}>
                                            {player.station_name} {isMe && '(YO)'}
                                        </p>
                                        <p className="text-sm text-gray-500">Slot {player.slot}</p>
                                    </div>
                                </div>

                                {player.ready ? (
                                    <span className="bg-green-500/20 text-green-400 px-4 py-2 rounded-lg font-bold border border-green-500/50 flex items-center gap-2">
                                        <ShieldCheck size={20} /> LISTO
                                    </span>
                                ) : (
                                    <span className="bg-gray-700/50 text-gray-500 px-4 py-2 rounded-lg font-bold border border-gray-600 flex items-center gap-2">
                                        <Clock size={20} /> ESPERANDO
                                    </span>
                                )}
                            </div>
                        );
                    })}

                    {/* Empty Slots */}
                    {Array.from({ length: Math.max(0, (lobbyData?.max_players || 0) - (lobbyData?.players?.length || 0)) }).map((_, i) => (
                        <div key={`empty-${i}`} className="p-6 rounded-2xl border-2 border-gray-800 border-dashed flex items-center justify-center text-gray-700 font-bold">
                            ESPERANDO JUGADOR...
                        </div>
                    ))}
                </div>

                {/* CONTROLS */}
                <div className="w-full flex gap-6 h-24">
                    {/* READY BUTTON (Everyone) */}
                    <button
                        onClick={() => ReadyMutation.mutate(!isReady)}
                        disabled={ReadyMutation.isPending}
                        className={`flex-1 rounded-2xl font-black text-2xl transition-all shadow-xl flex items-center justify-center gap-4 ${isReady ? 'bg-yellow-600 hover:bg-yellow-500 text-white' : 'bg-green-600 hover:bg-green-500 text-white'}`}
                    >
                        {isReady ? 'CANCELAR LISTO' : '¡ESTOY LISTO!'}
                    </button>

                    {/* HOST START BUTTON */}
                    {isHost && (
                        <button
                            onClick={() => StartRaceMutation.mutate()}
                            disabled={!allReady || StartRaceMutation.isPending}
                            className={`flex-1 rounded-2xl font-black text-2xl transition-all shadow-xl flex items-center justify-center gap-4 ${allReady ? 'bg-blue-600 hover:bg-blue-500 text-white animate-pulse' : 'bg-gray-800 text-gray-500 cursor-not-allowed'}`}
                        >
                            {StartRaceMutation.isPending ? 'INICIANDO...' : 'INICIAR CARRERA'}
                            {!allReady && <span className="text-sm font-normal opacity-70 ml-2">(Esperando a todos)</span>}
                        </button>
                    )}
                </div>
            </div>
        )
    }

    // Timer effect - runs when session is launched
    useEffect(() => {
        if (!isLaunched) return;

        // Reset timer when launching
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
    const RaceMode = () => {

        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const isLowTime = remainingSeconds < 60; // Last minute warning

        return (
            <div className="h-full flex flex-col animate-in fade-in duration-500">
                {/* COUNTDOWN TIMER - Prominent Display */}
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
                            }
                        }}
                        className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-6 py-3 rounded-xl border border-red-500/50 font-bold flex items-center gap-2 transition-all"
                    >
                        <LogOut size={20} /> SALIR
                    </button>
                </div>

                {/* RACE DASHBOARD */}
                <div className="grid grid-cols-2 gap-8 flex-1">
                    {/* LEFT: Live Telemetry Placeholder */}
                    <div className="bg-black/40 rounded-3xl border border-gray-800 p-8 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center">
                            <h3 className="text-6xl font-numeric text-white mb-2">1:45.302</h3>
                            <p className="text-green-400 font-bold text-xl uppercase tracking-widest">Mejor Vuelta</p>
                        </div>
                        {/* Mock Graph Line */}
                        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-blue-500/10 to-transparent">
                            <svg className="w-full h-full" preserveAspectRatio="none">
                                <path d="M0,100 C150,50 300,80 450,20 L450,150 L0,150 Z" fill="rgba(59, 130, 246, 0.2)" />
                            </svg>
                        </div>
                    </div>

                    {/* RIGHT: Pit Controls (Tyres) */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-gray-400 mb-2">INGENIERO DE PISTA</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button className="bg-red-900/40 border-2 border-red-600/50 hover:bg-red-600 hover:text-white text-red-400 p-6 rounded-2xl font-black text-xl transition-all">
                                SOFT
                            </button>
                            <button className="bg-yellow-900/40 border-2 border-yellow-600/50 hover:bg-yellow-600 hover:text-white text-yellow-400 p-6 rounded-2xl font-black text-xl transition-all">
                                MEDIUM
                            </button>
                            <button className="bg-white/10 border-2 border-gray-500/50 hover:bg-gray-100 hover:text-black text-gray-300 p-6 rounded-2xl font-black text-xl transition-all">
                                HARD
                            </button>
                            <button className="bg-blue-900/40 border-2 border-blue-600/50 hover:bg-blue-600 hover:text-white text-blue-400 p-6 rounded-2xl font-black text-xl transition-all">
                                WET
                            </button>
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

                {/* CANCEL SESSION BUTTON */}
                <div className="mt-8 border-t border-gray-800 pt-6">
                    <button
                        onClick={async () => {
                            if (confirm('¿Seguro que quieres CANCELAR la sesión? El juego se cerrará.')) {
                                try {
                                    await axios.post(`${API_URL}/control/station/${stationId}/panic`, null, { headers: clientTokenHeaders });
                                } catch (e) {
                                    console.error('Error sending panic:', e);
                                }
                                // Reset to step 1
                                setIsLaunched(false);
                                setStep(1);
                                setSelection(null);
                                setDriver(null);
                            }
                        }}
                        className="w-full bg-red-600/20 hover:bg-red-600 border-2 border-red-600/50 text-red-400 hover:text-white font-black text-2xl py-6 rounded-2xl transition-all flex items-center justify-center gap-4"
                    >
                        <LogOut size={28} />
                        CANCELAR SESIÓN
                    </button>
                </div>
            </div>
        )
    };


    // --- COACH SECTION COMPONENT ---
    const CoachSection = ({ lapId }: { lapId?: number }) => {
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

        // Merge telemetry for chart
        // We assume n (normalized position) as the key
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
                {/* TIPS CAROUSEL/GRID */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {coachAnalysis.tips.map((tip: any, idx: number) => (
                        <div key={idx} className={`p-4 rounded-2xl border flex gap-4 items-start ${tip.severity === 'high' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'
                            }`}>
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

                {/* COMPARISON CHART */}
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


    // --- STEP 6: POST-RACE RESULTS ---
    const ResultsStep = () => {
        // Fetch last session for this driver+track
        const { data: recentSessions, isLoading } = useQuery({
            queryKey: ['recent-sessions', driver?.name, selection?.track],
            queryFn: async () => {
                // Wait a bit for backend to process
                await new Promise(r => setTimeout(r, 2000));
                const res = await axios.get(`${API_URL}/telemetry/sessions`, {
                    params: {
                        driver_name: driver?.name,
                        track_name: selection?.track,
                        limit: 1 // Get the very last one
                    }
                });
                return res.data;
            },
            refetchInterval: (query) => {
                const data = query.state.data as any[];
                // Poll until we find a session that is "fresh" (within last 5 mins)
                if (!data || data.length === 0) return 2000;
                const sessTime = new Date(data[0].date).getTime();
                const now = new Date().getTime();
                if (now - sessTime > 10 * 60 * 1000) return 2000; // If data is old, keep polling
                return false; // Stop polling
            }
        });

        const session = recentSessions?.[0];
        const isFresh = session && (new Date().getTime() - new Date(session.date).getTime() < 15 * 60 * 1000); // 15 min tolerance

        // Also fetch detailed stats for graphs
        const { data: driverStats } = useQuery({
            queryKey: ['driver-details', driver?.name, selection?.track],
            queryFn: () => axios.get(`${API_URL}/telemetry/details/${selection?.track}/${driver?.name}`).then(r => r.data),
            enabled: !!session
        });

        // Telemetry Data for Chart (Best Lap or Last Lap?)
        // Let's use the 'lap_history' from driverStats or maybe we need a specific endpoint for the session laps.
        // For V1 let's use the generic "Best Lap" telemetry if available, to show "Optimized Line".
        // Or if we implemented the graph in backend...
        // Let's assume we want to show the specific lap telemetry. 
        // We'll use the 'lap_history' simply as a progress over time for now, or the 'Best Lap' trace if available.
        // Actually, let's fetch the detailed telemetry for the BEST lap of this session if possible.
        // But for now, let's use driverStats.lap_history to show consistency.

        // Prepare Chart Data
        const chartData = driverStats?.lap_history?.map((time: number, i: number) => ({
            lap: i + 1,
            time: time / 1000, // seconds
        })) || [];

        // Formatting
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
                    {/* COL 1: Main Stats */}
                    <div className="lg:col-span-1 space-y-6">
                        <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 text-center">
                            <div className="text-gray-400 font-bold mb-2">MEJOR VUELTA</div>
                            <div className="text-6xl font-numeric text-white">{formatTime(session?.best_lap || 0)}</div>
                        </div>

                        <div className="bg-gray-800/50 p-6 rounded-3xl border border-gray-700 flex flex-col items-center">
                            <h4 className="text-gray-400 font-bold mb-4">CONSISTENCIA</h4>
                            {/* Gauge Visualization */}
                            <div className="relative w-40 h-40 flex items-center justify-center">
                                <svg className="w-full h-full transform -rotate-90">
                                    <circle cx="80" cy="80" r="70" stroke="#374151" strokeWidth="12" fill="none" />
                                    <circle
                                        cx="80" cy="80" r="70" stroke="#3b82f6" strokeWidth="12" fill="none"
                                        strokeDasharray={440}
                                        strokeDashoffset={440 - (440 * (driverStats?.consistency_score || 0)) / 100}
                                        className="transition-all duration-1000 ease-out"
                                    />
                                </svg>
                                <span className="absolute text-4xl font-bold text-white">{driverStats?.consistency_score}%</span>
                            </div>
                        </div>

                        {/* QR PASSPORT */}
                        <div className="bg-white p-6 rounded-3xl border border-gray-700 flex flex-col items-center shadow-2xl">
                            <h4 className="text-black font-black mb-4 flex items-center gap-2">
                                <ScanQrCode size={24} /> PASAPORTE DIGITAL
                            </h4>
                            <div className="bg-white p-2 rounded-xl">
                                <QRCodeCanvas
                                    value={`https://assetto-manager.app/passport/${session?.driver_name}`}
                                    size={150}
                                    level={"H"}
                                />
                            </div>
                            <p className="text-black/60 text-sm mt-3 font-bold text-center">ESCANEA PARA GUARDAR</p>
                        </div>
                    </div>

                    {/* COL 2 & 3: Telemetry & Coach */}
                    <div className="lg:col-span-2 space-y-8 min-h-0 flex flex-col">
                        {/* COACH TIPS SECTION */}
                        <CoachSection lapId={session?.best_lap_id} />

                        <div className="bg-gray-800/30 p-6 rounded-3xl border border-gray-700 flex flex-col flex-1">
                            <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                                <Activity size={20} className="text-blue-400" /> HISTORIAL DE VUELTAS
                            </h3>
                            <div className="flex-1 w-full min-h-[250px]">
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                                        <XAxis dataKey="lap" stroke="#9ca3af" label={{ value: 'Vuelta', position: 'insideBottom', offset: -5 }} />
                                        <YAxis domain={['auto', 'auto']} stroke="#9ca3af" width={40} />
                                        <Tooltip
                                            contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                            labelStyle={{ color: '#9ca3af' }}
                                        />
                                        <Line type="monotone" dataKey="time" stroke="#60a5fa" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 8 }} />
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>
                </div >

                <div className="mt-8 flex justify-center">
                    <button
                        onClick={() => {
                            setStep(1);
                            setIsLaunched(false);
                            setSelection(null);
                            setDriver(null);
                        }}
                        className="bg-white text-black hover:bg-gray-200 px-12 py-4 rounded-2xl font-black text-xl shadow-lg transition-all flex items-center gap-3"
                    >
                        <LogOut size={24} /> VOLVER AL MENÚ
                    </button>
                </div>
            </div >
        )
    }

    // --- RENDER CURRENT STEP ---
    const renderStep = () => {
        if (isLaunched) return <RaceMode />;

        switch (step) {
            case 1: return <ScenarioStep />;
            case 2: return <DriverStep />;
            case 3: return <ContentStep />;
            case 4: return <DifficultyStep />;
            case 5: return <PaymentStep />;
            case 6: return <WaitingRoom />;
            case 7: return <ResultsStep />; // New Step
            default: return <ScenarioStep />;
        }
    }

    // Missing imports fix (needs to be at top of file, but replacing here for context)
    // I will use a clever way to access recharts if not imported: 
    // Actually, I can't inject imports easily without replacing top of file.
    // I must update imports first.



    return (
        <div className="h-full w-full flex flex-col relative">
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
