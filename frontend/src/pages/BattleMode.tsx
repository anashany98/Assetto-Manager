import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Swords, Trophy, Flame, Activity, QrCode, X, Users, Map as MapIcon, Car, Info, Plus, Trash2, ChevronRight } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL, PUBLIC_WS_TOKEN, WS_BASE_URL } from '../config';

// --- API ---
const wsToken = localStorage.getItem('token') || PUBLIC_WS_TOKEN;
const WS_URL = `${WS_BASE_URL}/ws/telemetry/client${wsToken ? `?token=${encodeURIComponent(wsToken)}` : ''}`;

// --- COMPONENTS ---

// 1. Selector Component
function BattleSetup({ onStart }: { onStart: (drivers: string[], track: string, car: string, isDemo: boolean) => void }) {
    const [selectedDrivers, setSelectedDrivers] = useState<string[]>(['', '']);
    const [selectedTrack, setSelectedTrack] = useState('');
    const [selectedCar, setSelectedCar] = useState('');
    const [isDemo, setIsDemo] = useState(false);
    const [showHelp, setShowHelp] = useState(false);

    // Fetch Drivers
    const { data: drivers } = useQuery({
        queryKey: ['drivers'],
        queryFn: async () => (await axios.get(`${API_URL}/telemetry/drivers`)).data
    });

    // Fetch Tracks
    const { data: tracks } = useQuery({
        queryKey: ['mods', 'track'],
        queryFn: async () => (await axios.get(`${API_URL}/mods?type=track`)).data
    });

    // Fetch Cars
    const { data: cars } = useQuery({
        queryKey: ['mods', 'car'],
        queryFn: async () => (await axios.get(`${API_URL}/mods?type=car`)).data
    });

    const driverList = Array.isArray(drivers) ? drivers.map((d: { driver_name: string }) => d.driver_name) : [];
    const trackList = Array.isArray(tracks) ? tracks : [];
    const carList = Array.isArray(cars) ? cars : [];

    const addPlayer = () => {
        if (selectedDrivers.length < 4) {
            setSelectedDrivers([...selectedDrivers, '']);
        }
    };

    const removePlayer = (index: number) => {
        if (selectedDrivers.length > 2) {
            const newDrivers = [...selectedDrivers];
            newDrivers.splice(index, 1);
            setSelectedDrivers(newDrivers);
        }
    };

    const updateDriver = (index: number, name: string) => {
        const newDrivers = [...selectedDrivers];
        newDrivers[index] = name;
        setSelectedDrivers(newDrivers);
    };

    const isReady = selectedDrivers.every(d => d !== '') && selectedTrack !== '' && selectedCar !== '';

    return (
        <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-start p-4 md:p-8 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-red-900/20 via-gray-950 to-black overflow-y-auto">

            {/* Header / Intro */}
            <div className="w-full max-w-5xl mb-8 flex flex-col md:flex-row items-center justify-between gap-6">
                <div className="flex items-center gap-4">
                    <div className="p-3 bg-red-600 rounded-2xl shadow-[0_0_20px_rgba(220,38,38,0.5)]">
                        <Swords className="w-8 h-8 text-white" />
                    </div>
                    <div>
                        <h1 className="text-4xl font-black text-white italic tracking-tighter uppercase leading-none">
                            Misión <span className="text-red-500">Batalla</span>
                        </h1>
                        <p className="text-gray-400 font-medium">Compite. Compara. Domina.</p>
                    </div>
                </div>

                <button
                    onClick={() => setShowHelp(!showHelp)}
                    className="flex items-center gap-2 px-4 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-xl text-gray-300 transition-colors"
                >
                    <Info size={18} />
                    <span>¿Cómo funciona?</span>
                </button>
            </div>

            <AnimatePresence>
                {showHelp && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="w-full max-w-5xl mb-8 overflow-hidden"
                    >
                        <div className="bg-blue-600/10 border border-blue-500/30 p-6 rounded-3xl grid grid-cols-1 md:grid-cols-3 gap-6">
                            <div className="space-y-2">
                                <div className="text-blue-400 font-bold flex items-center gap-2">
                                    <Users size={18} /> 1. Multijugador
                                </div>
                                <p className="text-gray-400 text-sm">Selecciona hasta 4 pilotos para comparar sus tiempos y telemetría en tiempo real.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-blue-400 font-bold flex items-center gap-2">
                                    <MapIcon size={18} /> 2. Desafío Directo
                                </div>
                                <p className="text-gray-400 text-sm">Elige el circuito y el coche. El sistema buscará los mejores tiempos históricos de cada piloto.</p>
                            </div>
                            <div className="space-y-2">
                                <div className="text-blue-400 font-bold flex items-center gap-2">
                                    <Activity size={18} /> 3. Telemetría en Vivo
                                </div>
                                <p className="text-gray-400 text-sm">Durante la carrera, verás la velocidad, marcha y distancias exactas entre cada contendiente.</p>
                            </div>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8 mb-12">
                {/* Content Selection (Left Side) */}
                <div className="lg:col-span-5 space-y-6">
                    <div className="bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 shadow-xl space-y-6">
                        <h3 className="text-xl font-bold text-white flex items-center gap-3">
                            <Activity className="text-red-500" /> Configuración Escenario
                        </h3>

                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Circuito</label>
                                <div className="relative">
                                    <MapIcon className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                                    <select
                                        className="w-full bg-gray-800 border-2 border-transparent focus:border-red-500/50 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none appearance-none transition-all cursor-pointer"
                                        value={selectedTrack}
                                        onChange={(e) => setSelectedTrack(e.target.value)}
                                    >
                                        <option value="">Seleccionar Circuito...</option>
                                        {trackList.map((t) => (
                                            <option key={t.id} value={t.name}>{t.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-xs font-bold text-gray-500 uppercase tracking-widest pl-1">Vehículo</label>
                                <div className="relative">
                                    <Car className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500" size={20} />
                                    <select
                                        className="w-full bg-gray-800 border-2 border-transparent focus:border-red-500/50 rounded-2xl pl-12 pr-4 py-4 text-white font-bold outline-none appearance-none transition-all cursor-pointer"
                                        value={selectedCar}
                                        onChange={(e) => setSelectedCar(e.target.value)}
                                    >
                                        <option value="">Seleccionar Coche...</option>
                                        {carList.map((c) => (
                                            <option key={c.id} value={c.name}>{c.name}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Player Selection (Right Side) */}
                <div className="lg:col-span-7 space-y-4">
                    <div className="bg-gray-900/50 backdrop-blur-xl p-8 rounded-3xl border border-gray-800 shadow-xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-white flex items-center gap-3">
                                <Users className="text-blue-500" /> Contendientes
                            </h3>
                            <span className="bg-white/10 px-3 py-1 rounded-full text-xs font-black text-gray-400">
                                {selectedDrivers.length} / 4
                            </span>
                        </div>

                        <div className="space-y-3">
                            {selectedDrivers.map((driver, idx) => (
                                <motion.div
                                    layout
                                    key={`player-slot-${idx}`}
                                    initial={{ opacity: 0, x: 20 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    className="flex items-center gap-3"
                                >
                                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-white ${idx === 0 ? 'bg-blue-600 shadow-[0_0_15px_rgba(37,99,235,0.4)]' :
                                        idx === 1 ? 'bg-red-600 shadow-[0_0_15px_rgba(220,38,38,0.4)]' :
                                            idx === 2 ? 'bg-yellow-600 shadow-[0_0_15px_rgba(202,138,4,0.4)]' :
                                                'bg-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.4)]'
                                        }`}>
                                        {idx + 1}
                                    </div>
                                    <div className="flex-1 relative">
                                        <select
                                            className="w-full bg-gray-800 border-2 border-transparent focus:border-white/20 rounded-xl px-4 py-4 text-white font-bold outline-none transition-all cursor-pointer"
                                            value={driver}
                                            onChange={(e) => updateDriver(idx, e.target.value)}
                                        >
                                            <option value="">Elegir Piloto...</option>
                                            {driverList.filter(d => !selectedDrivers.includes(d) || d === driver).map((d: string) => (
                                                <option key={d} value={d}>{d}</option>
                                            ))}
                                        </select>
                                    </div>
                                    {selectedDrivers.length > 2 && (
                                        <button
                                            onClick={() => removePlayer(idx)}
                                            className="p-4 bg-gray-800 hover:bg-red-900/30 text-gray-500 hover:text-red-500 rounded-xl transition-all"
                                        >
                                            <Trash2 size={20} />
                                        </button>
                                    )}
                                </motion.div>
                            ))}

                            {selectedDrivers.length < 4 && (
                                <button
                                    onClick={addPlayer}
                                    className="w-full py-4 border-2 border-dashed border-gray-800 hover:border-gray-600 rounded-xl text-gray-500 hover:text-gray-300 font-bold flex items-center justify-center gap-2 transition-all mt-2"
                                >
                                    <Plus size={20} /> Añadir Piloto
                                </button>
                            )}
                        </div>
                    </div>

                    <div className="bg-gray-900/50 backdrop-blur-xl p-4 rounded-2xl border border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-lg transition-colors ${isDemo ? 'bg-orange-500/20 text-orange-400' : 'bg-gray-800 text-gray-500'}`}>
                                <Activity size={20} />
                            </div>
                            <div>
                                <div className="text-sm font-bold text-white">Modo Simulación</div>
                                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Generar telemetría de prueba</div>
                            </div>
                        </div>
                        <button
                            onClick={() => setIsDemo(!isDemo)}
                            className={`w-12 h-6 rounded-full transition-all relative ${isDemo ? 'bg-orange-600 shadow-[0_0_10px_rgba(234,88,12,0.4)]' : 'bg-gray-700'}`}
                        >
                            <div className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-all ${isDemo ? 'left-7' : 'left-1'}`} />
                        </button>
                    </div>

                    <button
                        disabled={!isReady}
                        onClick={() => onStart(selectedDrivers, selectedTrack, selectedCar, isDemo)}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-orange-500 hover:to-red-500 disabled:opacity-30 disabled:grayscale text-white font-black text-2xl py-6 rounded-3xl shadow-[0_10px_40px_rgba(220,38,38,0.3)] transition-all transform hover:scale-[1.02] active:scale-95 uppercase tracking-widest flex items-center justify-center gap-3 overflow-hidden relative group"
                    >
                        <div className="absolute inset-0 bg-white/20 translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-700 skew-x-[-20deg]"></div>
                        <Flame className="w-8 h-8 group-hover:animate-bounce" />
                        Iniciar Batalla
                        <ChevronRight className="w-6 h-6 group-hover:translate-x-2 transition-transform" />
                    </button>
                    <p className="text-center text-gray-600 text-sm font-bold uppercase tracking-widest">
                        Transmisión 4K · Sistema Live Telemetry Pro v2
                    </p>
                </div>
            </div>
        </div>
    );
}

// 2. Battle Visualization
function BattleArena({ query }: { query: URLSearchParams }) {
    const driversParam = query.get('drivers');
    const drivers = useMemo(() => driversParam ? JSON.parse(driversParam) as string[] : [], [driversParam]);
    const track = query.get('track')!;
    const car = query.get('car')!;
    const isDemo = query.get('isDemo') === 'true';

    const [liveData, setLiveData] = useState<Record<string, any>>({});

    // Fetch Comparison for multiple drivers
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['battle', drivers, track, car],
        queryFn: async () => {
            const res = await axios.post(`${API_URL}/telemetry/compare-multi`, {
                drivers,
                track,
                car
            });
            return res.data;
        },
        refetchInterval: isDemo ? false : 10000
    });

    // Simulation Loop (if isDemo)
    useEffect(() => {
        if (!isDemo) return;

        const interval = setInterval(() => {
            setLiveData(prev => {
                const newData = { ...prev };
                drivers.forEach(driver => {
                    const current = prev[driver] || { speed: 0, gear: 1, normalized_pos: 0 };

                    // Simulate speed (oscillating around 180)
                    const speedChange = (Math.random() - 0.45) * 10;
                    let nextSpeed = Math.round(Number(current.speed || 0) + speedChange);
                    if (nextSpeed > 280) nextSpeed = 275;
                    if (nextSpeed < 40) nextSpeed = 45;

                    // Simulate gear loosely based on speed
                    const nextGear = nextSpeed > 240 ? 6 : nextSpeed > 200 ? 5 : nextSpeed > 160 ? 4 : nextSpeed > 120 ? 3 : nextSpeed > 80 ? 2 : 1;

                    // Simulate position progress
                    const nextPos = (Number(current.normalized_pos || 0) + (nextSpeed / 50000)) % 1;

                    newData[driver] = {
                        speed: nextSpeed,
                        gear: nextGear,
                        normalized_pos: nextPos
                    };
                });
                return newData;
            });
        }, 100);

        return () => clearInterval(interval);
    }, [isDemo, drivers]);

    // WebSocket Connection
    useEffect(() => {
        if (isDemo) return;

        const ws = new WebSocket(WS_URL);
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                const liveName = data.driver_name || data.driver;
                if (drivers.includes(liveName)) {
                    setLiveData(prev => ({
                        ...prev,
                        [liveName]: data
                    }));
                }
            } catch { /* ignore */ }
        };
        return () => ws.close();
    }, [drivers, isDemo]);

    if (isLoading) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center text-white text-3xl font-black gap-6 uppercase tracking-[1em] italic overflow-hidden">
            <motion.div animate={{ scale: [1, 1.1, 1] }} transition={{ repeat: Infinity, duration: 1 }}>
                <Activity className="w-20 h-20 text-red-500" />
            </motion.div>
            Sincronizando Satélites...
        </div>
    );

    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-red-500 font-bold">Error: Datos insuficientes para generar la batalla</div>;
    if (!stats) return null;

    const formatTime = (ms: number) => {
        if (!ms || ms > 9999999) return "--:--.---";
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const mil = ms % 1000;
        return `${m}:${s.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
    };

    const colors = ['text-blue-400', 'text-red-400', 'text-yellow-400', 'text-purple-400'];
    const borderColors = ['border-blue-500/30', 'border-red-500/30', 'border-yellow-500/30', 'border-purple-500/30'];
    const bgColors = ['from-blue-900/20', 'from-red-900/20', 'from-yellow-900/20', 'from-purple-900/20'];

    return (
        <div className="min-h-screen bg-black text-white overflow-hidden flex flex-col relative">
            {/* GLOBAL DECORATION */}
            <div className="absolute inset-0 bg-[url('/grid-dark.png')] opacity-10 pointer-events-none"></div>

            {/* HEADER */}
            <header className="relative z-10 p-6 flex justify-between items-center border-b border-white/5 bg-gray-900/50 backdrop-blur-md">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-yellow-500 rounded-lg">
                        <Swords className="w-6 h-6 text-black" />
                    </div>
                    <div>
                        <h1 className="text-xl font-black uppercase italic leading-none">Battle Arena <span className="text-yellow-500 font-mono text-sm ml-2">PRO LIVE</span></h1>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded font-mono uppercase">{track}</span>
                            <span className="text-xs text-gray-400 bg-gray-800 px-2 py-0.5 rounded font-mono uppercase">{car}</span>
                        </div>
                    </div>
                </div>
                <div className="flex items-center gap-6">
                    <div className="hidden md:flex flex-col items-end">
                        <span className="text-[10px] text-gray-500 font-black tracking-widest leading-none">SERVER UPTIME</span>
                        <span className="text-xs font-mono text-green-500">99.9% STABLE</span>
                    </div>
                    <div className="px-4 py-2 bg-red-600/10 border border-red-500/20 rounded-full flex items-center gap-2">
                        <Activity className="w-3 h-3 text-red-500 animate-pulse" />
                        <span className="text-red-500 font-black italic tracking-widest text-[10px]">LIVE BROADCAST</span>
                    </div>
                </div>
            </header>

            {/* GRID STAGE */}
            <main className={`flex-1 relative z-10 grid p-4 gap-4 ${drivers.length > 2 ? 'grid-cols-2 grid-rows-2' : 'grid-cols-1 md:grid-cols-2'
                }`}>
                {stats.drivers.map((s: any, idx: number) => {
                    const live = liveData[s.driver_name] || {};
                    const isWinner = s.best_lap > 0 && s.best_lap === Math.min(...stats.drivers.map((d: any) => d.best_lap).filter((b: number) => b > 1000));
                    const hasData = s.total_laps > 0;

                    return (
                        <motion.div
                            key={s.driver_name}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            className={`relative rounded-3xl border-2 ${borderColors[idx]} bg-gradient-to-br ${bgColors[idx]} to-black/80 overflow-hidden group p-6 flex flex-col justify-between`}
                        >
                            {/* Player Header */}
                            <div className="relative z-10 flex justify-between items-start">
                                <div>
                                    <div className={`p-1 px-3 rounded-full bg-white/5 border border-white/10 text-[10px] font-black tracking-[0.2em] mb-2 inline-block ${colors[idx]}`}>
                                        P{idx + 1} CONTEMPORARY
                                    </div>
                                    <h2 className="text-4xl md:text-5xl font-black uppercase leading-none italic tracking-tighter mb-4 truncate max-w-[250px]">
                                        {s.driver_name}
                                    </h2>
                                </div>
                                {isWinner && (
                                    <div className="p-3 bg-yellow-500 rounded-2xl shadow-[0_0_30px_rgba(234,179,8,0.3)] animate-bounce">
                                        <Trophy size={24} className="text-black" />
                                    </div>
                                )}
                            </div>

                            {/* Main Stats Area */}
                            <div className="relative z-10 grid grid-cols-2 gap-4">
                                {hasData ? (
                                    <div className="space-y-4">
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 font-black tracking-widest">BEST LAP</span>
                                            <span className={`text-3xl md:text-4xl font-mono font-black italic ${colors[idx]}`}>
                                                {formatTime(s.best_lap)}
                                            </span>
                                        </div>
                                        <div className="flex flex-col">
                                            <span className="text-[10px] text-gray-500 font-black tracking-widest">CONSISTENCY</span>
                                            <span className="text-xl font-mono font-bold text-white">
                                                {s.consistency.toFixed(1)} <span className="text-xs text-gray-500">ms var</span>
                                            </span>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="flex flex-col justify-center items-center bg-white/5 rounded-2xl border border-white/5 p-4 text-center">
                                        <Info className="text-gray-600 mb-2" size={24} />
                                        <span className="text-[10px] text-gray-500 font-black tracking-widest leading-tight">SIN REGISTROS</span>
                                        <p className="text-[9px] text-gray-600 mt-1 uppercase">Marca tu primer tiempo ahora</p>
                                    </div>
                                )}

                                {/* Live Box */}
                                <div className="bg-black/60 backdrop-blur-md rounded-2xl p-4 border border-white/5 space-y-3">
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                        <span className="text-[10px] text-gray-500 font-black">LIVE SPEED</span>
                                        <span className={`font-mono font-black text-lg ${colors[idx]}`}>
                                            {live.speed || 0} <span className="text-[10px]">KM/H</span>
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-white/5 pb-2">
                                        <span className="text-[10px] text-gray-500 font-black">GEAR</span>
                                        <span className="font-mono font-black text-xl text-white">
                                            {live.gear || 'N'}
                                        </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] text-gray-500 font-black">PROGRESS</span>
                                        <div className="flex-1 ml-4 h-1 bg-gray-800 rounded-full overflow-hidden">
                                            <div
                                                className={`h-full bg-current ${colors[idx]} transition-all duration-500`}
                                                style={{ width: `${(live.normalized_pos || 0) * 100}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* Background Number */}
                            <div className={`absolute -bottom-10 -right-10 text-[10rem] font-black opacity-5 pointer-events-none italic ${colors[idx]}`}>
                                {idx + 1}
                            </div>
                        </motion.div>
                    );
                })}
            </main>

            <footer className="relative z-10 p-4 border-t border-white/5 bg-gray-900/80 flex justify-between items-center px-10">
                <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">
                    Assetto Manager Arena © 2026 · <span className="text-gray-400 italic">Push the limits</span>
                </div>
                <div className="flex gap-4">
                    <button className="text-gray-500 hover:text-white transition-colors"><QrCode size={18} /></button>
                </div>
            </footer>

            <BattleResultOverlay stats={stats} drivers={drivers} />
        </div>
    );
}

function BattleResultOverlay({ stats, drivers }: { stats: any; drivers: string[] }) {
    const [isOpen, setIsOpen] = useState(false);

    useEffect(() => {
        const timer = setTimeout(() => setIsOpen(true), 45000);
        return () => clearTimeout(timer);
    }, []);

    if (!isOpen) return null;

    // Find best among valid times
    const validDrivers = stats.drivers.filter((d: any) => d.best_lap > 1000);
    const winner = validDrivers.length > 0
        ? validDrivers.reduce((prev: any, curr: any) => prev.best_lap < curr.best_lap ? prev : curr).driver_name
        : drivers[0];

    const passportUrl = `${window.location.origin}/p/${encodeURIComponent(winner)}`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/90 backdrop-blur-xl flex items-center justify-center p-8"
            >
                <motion.div
                    initial={{ scale: 0.9, y: 20 }}
                    animate={{ scale: 1, y: 0 }}
                    className="bg-gradient-to-br from-gray-900 to-black border-4 border-yellow-500/30 rounded-[3rem] p-12 max-w-2xl w-full text-center relative shadow-[0_0_100px_rgba(234,179,8,0.2)]"
                >
                    <button onClick={() => setIsOpen(false)} className="absolute top-8 right-8 text-gray-500 hover:text-white transition-colors">
                        <X size={32} />
                    </button>

                    <div className="relative inline-block mb-10">
                        <Trophy className="w-24 h-24 text-yellow-500 mx-auto animate-pulse" />
                        <motion.div
                            animate={{ rotate: 360 }}
                            transition={{ repeat: Infinity, duration: 10, ease: "linear" }}
                            className="absolute inset-0 border-4 border-dashed border-yellow-500/20 rounded-full scale-150"
                        />
                    </div>

                    <h2 className="text-3xl font-black text-white uppercase tracking-tighter mb-2 italic">Victoria Magistral</h2>
                    <div className="text-6xl md:text-7xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-yellow-400 uppercase mb-10 tracking-tighter italic">
                        {winner}
                    </div>

                    <div className="flex flex-col md:flex-row items-center gap-8 bg-white/5 p-8 rounded-[2rem] border border-white/10 mb-8">
                        <div className="bg-white p-4 rounded-3xl shadow-2xl">
                            <QRCodeSVG value={passportUrl} size={150} level="H" includeMargin={false} />
                        </div>
                        <div className="text-left space-y-3">
                            <h4 className="text-xl font-bold text-white">Guarda tu Legado</h4>
                            <p className="text-gray-400 text-sm leading-relaxed">
                                Escanea este código para registrar tu victoria en tu **Pasaporte Piloto** público y compartir el resultado con tus amigos.
                            </p>
                            <div className="flex items-center gap-2 text-[10px] text-yellow-500 font-black tracking-widest uppercase bg-yellow-500/10 px-3 py-1 rounded-full w-fit">
                                <Activity size={10} /> Link Permanente
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={() => window.location.reload()}
                        className="text-gray-500 hover:text-white font-bold uppercase tracking-widest text-xs transition-colors"
                    >
                        Volver a Configurar
                    </button>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}

export default function BattleMode() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const hasParams = searchParams.get('drivers') && searchParams.get('track');

    if (hasParams) {
        return <BattleArena query={searchParams} />;
    }

    return <BattleSetup onStart={(players, tr, cr, demo) => {
        const driversJson = JSON.stringify(players);
        navigate(`?drivers=${encodeURIComponent(driversJson)}&track=${encodeURIComponent(tr)}&car=${encodeURIComponent(cr)}${demo ? '&isDemo=true' : ''}`);
    }} />;
}

