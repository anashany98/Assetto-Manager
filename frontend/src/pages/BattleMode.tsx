import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Swords, Trophy, Flame, Activity, QrCode, X } from 'lucide-react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { QRCodeSVG } from 'qrcode.react';
import { API_URL, WS_BASE_URL } from '../config';

// --- API ---
const WS_URL = `${WS_BASE_URL}/ws/telemetry/client`;

// --- COMPONENTS ---

// 1. Selector Component
function BattleSetup({ onStart }: { onStart: (d1: string, d2: string, track: string) => void }) {
    const [d1, setD1] = useState('');
    const [d2, setD2] = useState('');
    const [track, setTrack] = useState('Imola'); // Default

    // Fetch Drivers
    const { data: drivers } = useQuery({
        queryKey: ['drivers'],
        queryFn: async () => (await axios.get(`${API_URL}/telemetry/drivers`)).data
    });

    const driverList = drivers?.map((d: any) => d.driver_name) || [];

    return (
        <div className="min-h-screen bg-gray-950 flex items-center justify-center p-8 bg-[url('/bg-pattern.png')] bg-cover bg-blend-overlay">
            <div className="bg-gray-900/90 backdrop-blur-xl p-12 rounded-3xl border border-gray-800 shadow-2xl w-full max-w-4xl">
                <div className="text-center mb-12">
                    <div className="inline-flex items-center justify-center p-4 bg-red-600/20 rounded-full mb-4 ring-2 ring-red-500/50">
                        <Swords className="w-16 h-16 text-red-500" />
                    </div>
                    <h1 className="text-6xl font-black text-white italic tracking-tighter uppercase">
                        Battle <span className="text-red-500">Mode</span>
                    </h1>
                    <p className="text-gray-400 text-xl mt-2 font-medium">Configura el duelo del siglo</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-8 items-center">
                    {/* Driver 1 */}
                    <div className="space-y-2">
                        <label className="text-blue-400 font-bold uppercase tracking-widest text-sm">Contendiente 1</label>
                        <select
                            className="w-full bg-gray-800 border-2 border-blue-500/30 rounded-xl px-4 py-4 text-xl font-bold text-white focus:border-blue-500 outline-none"
                            value={d1}
                            onChange={(e) => setD1(e.target.value)}
                        >
                            <option value="">Seleccionar Piloto</option>
                            {driverList.map((driver: string) => (
                                <option key={driver} value={driver}>{driver}</option>
                            ))}
                        </select>
                    </div>

                    <div className="flex justify-center">
                        <div className="bg-gray-800 rounded-full p-4 border border-gray-700">
                            <div className="text-gray-500 font-black text-2xl">VS</div>
                        </div>
                    </div>

                    {/* Driver 2 */}
                    <div className="space-y-2">
                        <label className="text-red-400 font-bold uppercase tracking-widest text-sm">Contendiente 2</label>
                        <select
                            className="w-full bg-gray-800 border-2 border-red-500/30 rounded-xl px-4 py-4 text-xl font-bold text-white focus:border-red-500 outline-none"
                            value={d2}
                            onChange={(e) => setD2(e.target.value)}
                        >
                            <option value="">Seleccionar Piloto</option>
                            {driverList.filter((d: string) => d !== d1).map((driver: string) => (
                                <option key={driver} value={driver}>{driver}</option>
                            ))}
                        </select>
                    </div>
                </div>

                {/* Track Selection */}
                <div className="mt-8">
                    <label className="text-gray-500 font-bold uppercase tracking-widest text-sm block mb-2 text-center">Circuito a Disputar</label>
                    <input
                        type="text"
                        value={track}
                        onChange={(e) => setTrack(e.target.value)}
                        placeholder="Ej: Imola, Monza, Spa..."
                        className="w-full bg-gray-800 border border-gray-700 rounded-xl px-4 py-3 text-center text-white font-mono focus:ring-2 focus:ring-yellow-500 outline-none"
                    />
                </div>

                <button
                    disabled={!d1 || !d2 || !track}
                    onClick={() => onStart(d1, d2, track)}
                    className="w-full mt-10 bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-2xl py-6 rounded-2xl shadow-[0_0_30px_rgba(220,38,38,0.4)] transition-all transform hover:scale-[1.02] active:scale-95 uppercase tracking-widest flex items-center justify-center gap-3"
                >
                    <Flame className="w-8 h-8 animate-pulse" />
                    Iniciar Batalla
                </button>
            </div>
        </div>
    );
}

// 2. Battle Visualization
function BattleArena({ query }: { query: URLSearchParams }) {
    const d1 = query.get('p1')!;
    const d2 = query.get('p2')!;
    const track = query.get('track')!;

    const [live1, setLive1] = useState<any>(null);
    const [live2, setLive2] = useState<any>(null);

    // Fetch Comparison
    const { data: stats, isLoading, error } = useQuery({
        queryKey: ['battle', d1, d2, track],
        queryFn: async () => {
            const res = await axios.get(
                `${API_URL}/telemetry/compare/${encodeURIComponent(d1)}/${encodeURIComponent(d2)}`,
                { params: { track } }
            );
            return res.data;
        },
        refetchInterval: 10000 // Slow poll for aggregate updates
    });

    // WebSocket Connection
    useEffect(() => {
        const ws = new WebSocket(WS_URL);

        ws.onopen = () => {
            // WebSocket Connected
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                // Assume data has { driver_name, speed, rpm, gear, ... }
                const liveName = data.driver_name || data.driver;
                if (liveName === d1) setLive1(data);
                if (liveName === d2) setLive2(data);
            } catch (e) {
                console.error("WS Parse Error", e);
            }
        };

        return () => ws.close();
    }, [d1, d2]);

    if (isLoading) return <div className="min-h-screen bg-black flex items-center justify-center text-white text-2xl font-black animate-pulse uppercase">Calculando Probabilidades...</div>;
    if (error) return <div className="min-h-screen bg-black flex items-center justify-center text-red-500 font-bold">Error: Datos insuficientes para generar la batalla</div>;
    if (!stats) return null;

    const s1 = stats.driver_1;
    const s2 = stats.driver_2;

    const formatTime = (ms: number) => {
        const m = Math.floor(ms / 60000);
        const s = Math.floor((ms % 60000) / 1000);
        const mil = ms % 1000;
        return `${m}:${s.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
    }

    return (
        <div className="min-h-screen bg-gray-950 text-white overflow-hidden flex flex-col relative">
            {/* BACKGROUND WARRIORS */}
            <div className="absolute inset-0 grid grid-cols-2">
                <div className="bg-blue-900/5 border-r border-white/5 relative overflow-hidden">
                    <div className="absolute -bottom-20 -left-20 text-[20rem] font-black text-blue-500/10 select-none">1</div>
                </div>
                <div className="bg-red-900/5 relative overflow-hidden">
                    <div className="absolute -top-20 -right-20 text-[20rem] font-black text-red-500/10 select-none">2</div>
                </div>
            </div>

            {/* HEADER */}
            <header className="relative z-10 p-6 flex justify-between items-center border-b border-white/10 bg-gray-950/50 backdrop-blur-sm">
                <div className="flex items-center gap-4">
                    <Swords className="w-10 h-10 text-yellow-500" />
                    <div>
                        <h1 className="text-2xl font-black uppercase tracking-tighter italic">Battle Arena</h1>
                        <span className="text-sm text-gray-400 font-mono uppercase tracking-widest">{stats.track_name}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2 px-6 py-2 bg-yellow-500/10 border border-yellow-500/30 rounded-full">
                    <Activity className="w-4 h-4 text-yellow-500 animate-pulse" />
                    <span className="text-yellow-500 font-bold font-mono tracking-widest text-xs">LIVE TELEMETRY</span>
                </div>
            </header>

            {/* MAIN STAGE */}
            <main className="flex-1 relative z-10 flex items-center justify-center px-12 gap-12">

                {/* BLUE CORNER */}
                <motion.div
                    initial={{ x: -100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex-1 text-right"
                >
                    <div className="mb-6">
                        <div className="text-blue-500 font-bold tracking-widest text-sm mb-1">BLUE CORNER</div>
                        <h2 className="text-6xl font-black uppercase tracking-tighter text-white">{s1.driver_name}</h2>

                        {/* Live Telemetry Box */}
                        <div className="mt-4 flex justify-end gap-4">
                            <LiveStat label="SPEED" value={live1?.speed || 0} unit="KM/H" color="text-blue-400" />
                            <LiveStat label="GEAR" value={live1?.gear || 'N'} color="text-white" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <StatRow label="BEST LAP" value={formatTime(s1.best_lap)} isWin={s1.best_lap < s2.best_lap} color="text-blue-400" align="right" />
                        <StatRow label="CONSISTENCY" value={s1.consistency.toFixed(1)} isWin={s1.consistency < s2.consistency} color="text-blue-400" align="right" unit="ms var" />
                    </div>
                </motion.div>

                {/* VS CENTER */}
                <div className="w-32 flex flex-col items-center">
                    <div className="w-1 h-32 bg-gradient-to-b from-transparent via-white/20 to-transparent"></div>
                    <div className="bg-gray-900 border-4 border-white/10 rounded-full w-24 h-24 flex items-center justify-center shadow-[0_0_50px_rgba(255,255,255,0.1)] relative z-20 my-8">
                        <span className="text-4xl font-black italic text-transparent bg-clip-text bg-gradient-to-br from-yellow-400 to-orange-600">VS</span>
                    </div>
                    {/* GAP INDICATOR */}
                    <div className="bg-gray-800 rounded-lg px-4 py-2 border border-gray-700 text-center w-48">
                        <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">GAP</div>
                        <div className="text-2xl font-mono font-black text-white">
                            +{formatTime(Math.abs(stats.time_gap))}
                        </div>
                    </div>
                    <div className="w-1 h-32 bg-gradient-to-t from-transparent via-white/20 to-transparent mt-8"></div>
                </div>

                {/* RED CORNER */}
                <motion.div
                    initial={{ x: 100, opacity: 0 }}
                    animate={{ x: 0, opacity: 1 }}
                    className="flex-1 text-left"
                >
                    <div className="mb-6">
                        <div className="text-red-500 font-bold tracking-widest text-sm mb-1">RED CORNER</div>
                        <h2 className="text-6xl font-black uppercase tracking-tighter text-white">{s2.driver_name}</h2>

                        {/* Live Telemetry Box */}
                        <div className="mt-4 flex justify-start gap-4">
                            <LiveStat label="SPEED" value={live2?.speed || 0} unit="KM/H" color="text-red-400" />
                            <LiveStat label="GEAR" value={live2?.gear || 'N'} color="text-white" />
                        </div>
                    </div>

                    <div className="space-y-6">
                        <StatRow label="BEST LAP" value={formatTime(s2.best_lap)} isWin={s2.best_lap < s1.best_lap} color="text-red-400" align="left" />
                        <StatRow label="CONSISTENCY" value={s2.consistency.toFixed(1)} isWin={s2.consistency < s1.consistency} color="text-red-400" align="left" unit="ms var" />
                    </div>
                </motion.div>
            </main>

            {/* QR CODE OVERLAY (Demo Trigger) */}
            <div className="absolute bottom-4 right-4 z-50">
                <button
                    onClick={() => setLive1(null)} // Trigger reset logic or specific state
                    className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white/50 hover:text-white transition-colors"
                    title="Simular Fin de Carrera"
                >
                    <QrCode size={20} />
                </button>
            </div>

            <BattleResultOverlay
                stats={stats}
                d1={d1}
                d2={d2}
            />
        </div>
    );
}

function BattleResultOverlay({ stats, d1, d2 }: any) {
    const [isOpen, setIsOpen] = useState(false);

    // Auto-open logic could go here (e.g. if websocket sends "FINISHED")
    // For demo, we leave it manual or triggered by parent

    // Mock finish trigger for demo purposes
    useEffect(() => {
        const timer = setTimeout(() => setIsOpen(true), 30000); // Auto show after 30s of "battle"
        return () => clearTimeout(timer);
    }, []);

    if (!isOpen) return null;

    const winner = stats.driver_1.best_lap < stats.driver_2.best_lap ? d1 : d2;
    // URL for the winner's passport
    const passportUrl = `${window.location.origin}/passport?driver=${encodeURIComponent(winner)}`;

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="absolute inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-8"
            >
                <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-yellow-500/50 rounded-3xl p-12 max-w-2xl w-full text-center relative shadow-2xl shadow-yellow-500/10">
                    <button
                        onClick={() => setIsOpen(false)}
                        className="absolute top-4 right-4 text-gray-400 hover:text-white"
                    >
                        <X size={32} />
                    </button>

                    <Trophy className="w-24 h-24 text-yellow-500 mx-auto mb-6 animate-bounce" />

                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter mb-2">
                        Victoria para
                    </h2>
                    <div className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500 uppercase mb-8">
                        {winner}
                    </div>

                    <div className="bg-white p-6 rounded-2xl inline-block mb-6 shadow-xl">
                        <QRCodeSVG
                            value={passportUrl}
                            size={200}
                            level="H"
                            includeMargin={false}
                        />
                    </div>

                    <p className="text-gray-400 font-medium text-lg max-w-md mx-auto">
                        ¡Escanea para guardar el resultado en tu <strong className="text-white">Pasaporte de Piloto</strong> y compartirlo!
                    </p>
                </div>
            </motion.div>
        </AnimatePresence>
    );
}

function StatRow({ label, value, isWin, color, align, unit, size = 'md' }: any) {
    return (
        <div className={`flex flex-col ${align === 'right' ? 'items-end' : 'items-start'}`}>
            <div className="text-xs text-gray-600 font-black uppercase tracking-widest mb-1">{label}</div>
            <div className={`flex items-baseline gap-2 ${align === 'right' ? 'flex-row-reverse' : 'flex-row'}`}>
                <div className={`font-mono font-black ${size === 'lg' ? 'text-5xl' : 'text-3xl'} ${isWin ? color : 'text-gray-600'} transition-colors duration-500`}>
                    {value}
                    {unit && <span className="text-sm text-gray-600 ml-1 font-bold">{unit}</span>}
                </div>
                {isWin && (
                    <Trophy className="w-5 h-5 text-yellow-500 animate-bounce" />
                )}
            </div>
        </div>
    )
}

function LiveStat({ label, value, unit, color }: any) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-lg px-3 py-2 min-w-[80px] text-center">
            <div className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1">{label}</div>
            <div className={`${color} font-mono font-black text-xl`}>
                {value} <span className="text-[10px] text-gray-600">{unit}</span>
            </div>
        </div>
    )
}

export default function BattleMode() {
    const [searchParams] = useSearchParams();
    const navigate = useNavigate();

    const hasParams = searchParams.get('p1') && searchParams.get('p2') && searchParams.get('track');

    if (hasParams) {
        return <BattleArena query={searchParams} />;
    }

    return <BattleSetup onStart={(p1, p2, tr) => navigate(`?p1=${p1}&p2=${p2}&track=${tr}`)} />;
}
