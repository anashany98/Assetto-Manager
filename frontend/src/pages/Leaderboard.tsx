import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, MapPin, Activity, RefreshCw } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { useLocation } from 'react-router-dom';
import { QRCodeSVG } from 'qrcode.react';

interface LeaderboardEntry {
    rank: number;
    driver_name: string;
    car_model: string;
    track_name: string;
    lap_time: number;
    timestamp: string;
    gap: number;
}

const API_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt' // Backend Tunnel
        : `http://${window.location.hostname}:8000`;

const getLeaderboard = async (track: string, car: string | null, period: string) => {
    const params = new URLSearchParams();
    if (track && track !== 'all') params.append('track_name', track);
    if (car) params.append('car_model', car);
    if (period) params.append('period', period);

    const response = await axios.get(`${API_URL}/telemetry/leaderboard?${params.toString()}`);
    return response.data;
};

const getCombinations = async () => {
    const response = await axios.get(`${API_URL}/telemetry/combinations`);
    return response.data; // [{track: 'monza', car: 'ferrari'}, ...]
};

// Formatting Milliseconds to MM:SS.ms
const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
}

const formatGap = (ms: number) => {
    if (ms === 0) return '-';
    return `+${(ms / 1000).toFixed(3)}`;
}

const TrackMap = ({ track }: { track: string }) => {
    const [imgSrc, setImgSrc] = useState(`/maps/${track}.png`);
    const [hasFailedOnce, setHasFailedOnce] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    // Reset when track changes
    useEffect(() => {
        setImgSrc(`/maps/${track}.png`);
        setHasFailedOnce(false);
        setIsVisible(true);
    }, [track]);

    const handleError = () => {
        if (!hasFailedOnce) {
            setHasFailedOnce(true);
            setImgSrc(`${API_URL}/telemetry/map/${track}`);
        } else {
            setIsVisible(false);
        }
    };

    if (!isVisible) {
        return (
            <div className="w-full h-full flex flex-col items-center justify-center text-gray-600 opacity-50 border-2 border-dashed border-gray-700 rounded-xl">
                <MapPin size={48} className="mb-2" />
                <span className="text-xs font-bold uppercase">Mapa no disponible</span>
            </div>
        );
    }

    return (
        <img
            src={imgSrc}
            onError={handleError}
            className="w-full h-full object-contain opacity-80 group-hover:opacity-100 transition-all filter drop-shadow-[0_0_20px_rgba(255,255,255,0.05)]"
            alt="Circuit Map"
        />
    );
};

export default function LeaderboardPage() {
    const location = useLocation();
    const isTVMode = location.pathname.startsWith('/tv');

    // State
    const [selectedTrack, setSelectedTrack] = useState('monza');
    const [selectedCar, setSelectedCar] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, month, week, today
    const [rotationIndex, setRotationIndex] = useState(0);

    // Fetch Active Combos for Rotation
    const { data: combinations } = useQuery({
        queryKey: ['combinations'], // Fetch active car/track combos
        queryFn: getCombinations,
        refetchInterval: 60000
    });

    // Auto-Rotation Timer (TV Only)
    useEffect(() => {
        if (!combinations || combinations.length === 0 || !isTVMode) return;

        const interval = setInterval(() => {
            setRotationIndex(prev => (prev + 1) % combinations.length);
        }, 15000);

        return () => clearInterval(interval);
    }, [combinations, isTVMode]);

    // Apply Rotation
    useEffect(() => {
        if (!combinations || combinations.length === 0 || !isTVMode) return;

        const combo = combinations[rotationIndex];
        setSelectedTrack(combo.track);
        setSelectedCar(null);
    }, [rotationIndex, combinations, isTVMode]);

    const { data: leaderboard, isLoading } = useQuery({
        queryKey: ['leaderboard', selectedTrack, selectedCar, selectedPeriod],
        queryFn: () => getLeaderboard(selectedTrack, selectedCar, selectedPeriod),
        refetchInterval: 5000
    });

    // TTS: Track previous top record to announce changes
    const previousTopRecordRef = useRef<string | null>(null);

    // TTS Logic
    useEffect(() => {
        if (!isTVMode || !leaderboard || leaderboard.length === 0) return;

        const currentTop = leaderboard[0];
        const recordKey = `${currentTop.driver_name}-${currentTop.lap_time}-${selectedTrack}`;

        // If it's the first load, just set the ref without speaking
        if (previousTopRecordRef.current === null) {
            previousTopRecordRef.current = recordKey;
            return;
        }

        // If record changed, speak!
        if (previousTopRecordRef.current !== recordKey) {
            previousTopRecordRef.current = recordKey;

            // Check if TTS is enabled
            if (getSetting('enable_tts', 'true') !== 'true') return;

            // Helper to format time for speech
            const formatTimeForSpeech = (ms: number) => {
                const minutes = Math.floor(ms / 60000);
                const seconds = Math.floor((ms % 60000) / 1000);
                const millis = ms % 1000;

                let text = "";
                if (minutes > 0) text += `${minutes} minuto${minutes > 1 ? 's' : ''} `;
                if (seconds > 0) text += `${seconds} segundo${seconds !== 1 ? 's' : ''} `;
                if (millis > 0) text += `y ${millis} milésimas`;
                return text;
            };

            // Text to Speech
            const msg = new SpeechSynthesisUtterance();
            msg.text = `¡Atención pilotos! Tenemos un nuevo récord en ${selectedTrack}. ${currentTop.driver_name} se ha puesto primero con un tiempo de ${formatTimeForSpeech(currentTop.lap_time)}.`;
            msg.lang = 'es-ES';
            msg.rate = 1.1;

            // Try to find a good voice
            const voices = window.speechSynthesis.getVoices();
            const spanishVoice = voices.find(v => v.lang.includes('es'));
            if (spanishVoice) msg.voice = spanishVoice;

            window.speechSynthesis.cancel(); // Cancel previous
            window.speechSynthesis.speak(msg);
        }
    }, [leaderboard, isTVMode, selectedTrack]);

    const PERIODS = [
        { id: 'all', label: 'Histórico' },
        { id: 'month', label: 'Mes Actual' },
        { id: 'week', label: 'Semana' },
        { id: 'today', label: 'Hoy' },
    ];

    // Fetch Branding Settings
    const { data: branding } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings`);
            return res.data;
        }
    });

    // Fetch Global Stats for Ticker
    const { data: stats } = useQuery({
        queryKey: ['stats'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/stats`);
            return res.data;
        },
        refetchInterval: 30000 // Refresh stats every 30s
    });

    // Configuration Handlers
    const getSetting = (key: string, defaultVal: string) => branding?.find((s: any) => s.key === key)?.value || defaultVal;

    const tickerSpeed = getSetting('ticker_speed', '80');
    const promoText = getSetting('promo_text', 'BUSCAMOS AL PILOTO MÁS RÁPIDO DEL MES');

    // Build Dynamic News Items based on Toggles
    const newsItems: string[] = [
        `🏆 RÉCORD DE PISTA: ${leaderboard?.[0] ? `${leaderboard[0].driver_name} (${formatTime(leaderboard[0].lap_time)})` : "VACANTE"}`,
        `📍 CIRCUITO: ${(selectedTrack || '').toUpperCase()}`,
        "🌡️ ESTADO POSIBLE: PISTA ÓPTIMA",
    ];

    if (getSetting('show_stats_driver', 'true') === 'true' && stats?.top_driver)
        newsItems.push(`🥇 PILOTO MÁS ACTIVO: ${stats.top_driver}`);

    if (getSetting('show_stats_track', 'true') === 'true' && stats?.most_popular_track)
        newsItems.push(`🔥 PISTA MÁS JUGADA: ${(stats.most_popular_track || '').toUpperCase()}`);

    if (getSetting('show_stats_car', 'true') === 'true' && stats?.most_popular_car)
        newsItems.push(`🏎️ COCHE FAVORITO: ${(stats.most_popular_car || '').replace(/_/g, ' ').toUpperCase()}`);

    if (getSetting('show_stats_sessions', 'true') === 'true' && stats?.total_sessions > 0)
        newsItems.push(`📊 TOTAL SESIONES: ${stats.total_sessions}`);

    if (getSetting('show_stats_latest', 'true') === 'true' && stats?.latest_record)
        newsItems.push(`🆕 ÚLTIMO RÉCORD: ${stats.latest_record}`);

    if (getSetting('show_promo', 'true') === 'true')
        newsItems.push(`📢 PRÓXIMO EVENTO: ${(promoText || '').toUpperCase()}`);

    return (
        <div
            className="h-full flex flex-col bg-gray-900 text-white overflow-hidden"
            style={{ '--marquee-duration': `${tickerSpeed}s` } as React.CSSProperties}
        >
            {/* Header - Fixed for TV */}
            <div className="bg-gray-800 border-b border-gray-700 py-3 px-8 flex justify-between items-center shadow-lg z-10 shrink-0">
                <div className="flex flex-col items-center">
                    <img
                        src={branding?.find((s: any) => s.key === 'bar_logo')?.value || '/logo.png'}
                        alt="Logo"
                        className="h-14 w-auto object-contain drop-shadow-[0_0_15px_rgba(59,130,246,0.2)]"
                        onError={(e) => e.currentTarget.src = 'https://via.placeholder.com/150x50?text=LOGO'}
                    />
                    <p className="text-gray-500 text-[9px] font-black flex items-center tracking-[0.2em] uppercase opacity-50 mt-1">
                        <Activity size={10} className="mr-1.5 text-green-500 animate-pulse" />
                        Live Updates {isTVMode && " • Auto-Rotation ON"}
                    </p>
                </div>

                <div className="flex items-center space-x-6">
                    {/* QR Code for Mobile Access - Always Visible or just on TV */}


                    {/* Filters - Only for local station view, hidden on TV */}
                    {!isTVMode && (
                        <div className="flex items-center space-x-4">
                            {/* Car Info */}
                            {selectedCar && (
                                <div className="px-3 py-1 bg-gray-700 rounded-lg border border-gray-600 flex items-center">
                                    <Car size={14} className="mr-2 text-blue-400" />
                                    <span className="font-bold uppercase text-xs">{selectedCar.replace(/_/g, ' ')}</span>
                                </div>
                            )}

                            {/* Period Tabs */}
                            <div className="flex bg-gray-700/50 rounded-lg p-1">
                                {PERIODS.map(p => (
                                    <button
                                        key={p.id}
                                        onClick={() => setSelectedPeriod(p.id)}
                                        className={cn(
                                            "px-4 py-1.5 rounded-md text-xs font-bold transition-all",
                                            selectedPeriod === p.id
                                                ? "bg-blue-600 text-white shadow-md"
                                                : "text-gray-400 hover:text-white"
                                        )}
                                    >
                                        {p.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            <div className="flex-1 flex overflow-hidden">
                {/* Visual Section - Fixed width for TV */}
                <div className="w-1/4 bg-gray-800/50 p-6 pb-20 border-r border-gray-700 flex flex-col relative">
                    <div className="absolute inset-0 opacity-5 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

                    <div className="relative z-10 flex-1 flex flex-col">
                        <div className="mb-6">
                            <h2 className="text-3xl font-black uppercase italic text-white mb-1 truncate">{selectedTrack}</h2>
                            <span className="bg-white/10 text-white/60 px-2 py-0.5 rounded text-[10px] font-mono">MAPA DEL CIRCUITO</span>
                        </div>

                        <div className="flex-1 flex flex-col space-y-4 min-h-0">
                            {/* Map Box */}
                            <div className="flex-1 bg-gray-900/50 rounded-2xl border border-gray-700 p-4 relative flex items-center justify-center group overflow-hidden">
                                <div className="absolute top-4 right-4 z-20">
                                    <span className="flex items-center space-x-2 bg-black/60 backdrop-blur px-3 py-1.5 rounded-full text-[9px] font-black text-gray-400 border border-gray-700 uppercase tracking-widest">
                                        <MapPin size={10} className="text-gray-400" />
                                        <span>LAYOUT</span>
                                    </span>
                                </div>
                                <TrackMap track={selectedTrack} />
                            </div>

                            {/* QR Box */}
                            {/* QR Box - Always Visible as per design */}
                            <div className="flex-1 bg-gray-900/50 rounded-2xl border border-gray-700 p-6 flex flex-col items-center justify-center relative overflow-hidden group">
                                <div className="absolute inset-0 bg-blue-600/5 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                <div className="bg-white p-3 rounded-2xl shadow-2xl relative z-10 lg:scale-125 transition-transform group-hover:scale-140">
                                    <QRCodeSVG
                                        value={getSetting('bar_public_url', 'http://localhost:5173/mobile')}
                                        size={160}
                                        level="H"
                                        includeMargin={false}
                                    />
                                </div>
                                <div className="mt-8 text-center relative z-10">
                                    <p className="text-blue-400 font-black text-sm uppercase tracking-[0.3em] animate-pulse">Ver en móvil</p>
                                    <p className="text-blue-300 text-[11px] font-black uppercase mt-1 tracking-[0.15em] opacity-80">Escanea para seguir tiempos</p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Rotation Info - Moved below the boxes */}
                    <div className="mt-4 shrink-0">
                        {isTVMode && (
                            <div className="flex items-center justify-center space-x-2 text-gray-700 text-[8px] font-bold uppercase tracking-widest">
                                <RefreshCw size={8} className="animate-spin opacity-50" />
                                <span className="opacity-40">Actualización en Vivo</span>
                            </div>
                        )}
                    </div>
                </div>


                {/* Ranking Table - Fixed width for TV */}
                <div className="w-3/4 flex flex-col bg-gray-900 pb-16">
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-900 sticky top-0 z-20 shadow-md">
                                <tr>
                                    <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest w-20">Rank</th>
                                    <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Piloto</th>
                                    <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest">Coche</th>
                                    <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Tiempo</th>
                                    <th className="p-6 text-xs font-bold text-gray-500 uppercase tracking-widest text-right">Gap</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-gray-800">
                                {isLoading ? (
                                    [...Array(10)].map((_, i) => (
                                        <tr key={i} className="animate-pulse">
                                            <td className="p-6"><div className="h-6 w-8 bg-gray-800 rounded"></div></td>
                                            <td className="p-6"><div className="h-6 w-32 bg-gray-800 rounded"></div></td>
                                            <td className="p-6"><div className="h-6 w-24 bg-gray-800 rounded"></div></td>
                                            <td className="p-6 text-right"><div className="h-6 w-20 bg-gray-800 rounded ml-auto"></div></td>
                                            <td className="p-6 text-right"><div className="h-6 w-12 bg-gray-800 rounded ml-auto"></div></td>
                                        </tr>
                                    ))
                                ) : leaderboard?.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500">
                                            <p className="text-xl font-bold mb-2">Sin Tiempos Registrados</p>
                                            <p className="text-sm">Sé el primero en marcar una vuelta rápida en esta categoría.</p>
                                        </td>
                                    </tr>
                                ) : leaderboard?.map((entry: LeaderboardEntry, index: number) => (
                                    <tr
                                        key={index}
                                        className={cn(
                                            "group transition-colors border-l-4 border-transparent hover:bg-gray-800/50",
                                            index === 0 ? "bg-yellow-500/5 border-yellow-500" :
                                                index === 1 ? "bg-gray-400/5 border-gray-400" :
                                                    index === 2 ? "bg-orange-700/5 border-orange-700" : ""
                                        )}
                                    >
                                        <td className="px-6 py-5">
                                            <div className={cn(
                                                "w-8 h-8 flex items-center justify-center rounded-lg font-black font-mono text-lg",
                                                index === 0 ? "bg-yellow-500 text-black shadow-[0_0_15px_rgba(234,179,8,0.4)]" :
                                                    index === 1 ? "bg-gray-400 text-black" :
                                                        index === 2 ? "bg-orange-700 text-white" : "text-gray-500 bg-gray-800"
                                            )}>
                                                {entry.rank}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="font-bold text-gray-200 text-lg group-hover:text-white transition-colors uppercase italic">
                                                {entry.driver_name}
                                            </div>
                                            <div className="text-xs text-gray-500 font-mono mt-1">
                                                {new Date(entry.timestamp).toLocaleDateString()}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center text-gray-400 group-hover:text-blue-400 transition-colors">
                                                <Car size={16} className="mr-2" />
                                                <span className="font-medium text-sm">{entry.car_model.replace(/_/g, ' ')}</span>
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className="font-mono font-bold text-2xl text-white tracking-tight tabular-nums">
                                                {formatTime(entry.lap_time)}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5 text-right">
                                            <div className={cn(
                                                "font-mono font-bold text-sm tabular-nums px-2 py-1 rounded inline-block",
                                                index === 0 ? "text-yellow-500 bg-yellow-500/10" : "text-red-400 bg-red-400/10"
                                            )}>
                                                {formatGap(entry.lap_time - leaderboard[0].lap_time)}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {/* NEWS TICKER */}
            <div className="absolute bottom-0 left-0 right-0 h-14 bg-blue-900 border-t-4 border-blue-600 flex items-center z-50 shadow-[0_-5px_20px_rgba(0,0,0,0.5)]">
                <div className="px-6 bg-blue-800 h-full flex items-center font-black italic uppercase z-10 shadow-lg">
                    <span className="">NOTICIAS</span>
                </div>
                <div className="flex-1 overflow-hidden relative h-full flex items-center">
                    <div className="animate-marquee whitespace-nowrap flex space-x-12 absolute">
                        {[...newsItems, ...newsItems, ...newsItems].map((item, i) => (
                            <span key={i} className="text-lg font-bold text-white uppercase tracking-wider flex items-center">
                                <span className="w-2 h-2 bg-blue-400 rounded-full mr-4 animate-pulse"></span>
                                {item}
                            </span>
                        ))}
                    </div>
                </div>
            </div>
        </div>

    );
}
