import React, { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Car, MapPin, Activity, RefreshCw, PlusCircle, X, BarChart2, AlertTriangle, Trophy } from 'lucide-react';
import { cn } from '../lib/utils';
import axios from 'axios';
import { QRCodeSVG } from 'qrcode.react';
import ManualEntryModal from '../components/ManualEntryModal';
import { TelemetryChart } from '../components/TelemetryChart';
import { EloBadge } from '../components/EloBadge';


import { API_URL } from '../config';

interface LeaderboardEntry {
    rank: number;
    driver_name: string;
    car_model: string;
    track_name: string;
    lap_time: number;
    timestamp: string;
    gap: number;
    lap_id: number;
}

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
    // State reset is handled by parent key={track}
    const [imgSrc, setImgSrc] = useState(`/maps/${track}.png`);
    const [hasFailedOnce, setHasFailedOnce] = useState(false);
    const [isVisible, setIsVisible] = useState(true);

    // Removed useEffect that syncs state, handled by remounting


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
    const searchParams = new URLSearchParams(window.location.search);
    const screenId = searchParams.get('screen') || '1';
    const isTVMode = location.pathname.startsWith('/tv') || searchParams.get('tv') === 'true';

    // State
    const [selectedTrack] = useState('Monza');
    const [selectedCar] = useState<string | null>(null);
    const [selectedPeriod, setSelectedPeriod] = useState('all'); // all, month, week, today
    const [rotationIndex, setRotationIndex] = useState(0);
    const [isManualModalOpen, setIsManualModalOpen] = useState(false);

    // Telemetry State
    const [selectedLapId, setSelectedLapId] = useState<number | null>(null);
    const [compareLapId, setCompareLapId] = useState<number | null>(null);

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
    // Derived State for Track (handles TV rotation without useEffect state sync)
    const activeTrack = (isTVMode && combinations && combinations.length > 0)
        ? combinations[rotationIndex].track_name
        : selectedTrack;

    // Apply Rotation Side Effect (Set Car to null if needed? No, just use null when queried if in TV mode)
    // Actually, forcing car to null in TV mode was part of the original logic.
    // We can handle that in getLeaderboard args.

    const { data: leaderboard, isLoading, error } = useQuery<LeaderboardEntry[]>({
        queryKey: ['leaderboard', activeTrack, isTVMode ? null : selectedCar, selectedPeriod],
        queryFn: () => getLeaderboard(activeTrack, isTVMode ? null : selectedCar, selectedPeriod),
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

            // Check if TTS is enabled - note: getSetting is defined after this effect, so we skip for now
            // In production, restructure to define getSetting earlier or use context

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
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
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
    const safeBranding = Array.isArray(branding) ? branding : [];
    const getSetting = (key: string, defaultVal: string) => safeBranding.find((s: { key: string; value: string }) => s.key === key)?.value || defaultVal;

    const tickerSpeed = getSetting('ticker_speed', '80');
    const promoText = getSetting('promo_text', 'BUSCAMOS AL PILOTO MÁS RÁPIDO DEL MES');

    // Build Dynamic News Items based on Toggles
    const newsUrgent = getSetting(`news_urgent_${screenId}`, '');
    const newsItems: string[] = [];

    if (newsUrgent) {
        newsItems.push(`⚡ ÚLTIMA HORA: ${newsUrgent.toUpperCase()} ⚡`);
    }

    newsItems.push(
        `🏆 RÉCORD DE PISTA: ${leaderboard?.[0] ? `${leaderboard[0].driver_name} (${formatTime(leaderboard[0].lap_time)})` : "VACANTE"}`,
        `📍 CIRCUITO: ${(selectedTrack || '').toUpperCase()}`,
        "🌡️ ESTADO POSIBLE: PISTA ÓPTIMA",
    );

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
            {/* ERROR STATE */}
            {error && (
                <div className="fixed inset-0 z-[100] bg-black/90 flex items-center justify-center p-6">
                    <div className="bg-red-500/10 border border-red-500/20 p-8 rounded-2xl max-w-md text-center">
                        <AlertTriangle size={48} className="text-red-500 mx-auto mb-4" />
                        <h2 className="text-xl font-bold text-white mb-2">Error de Conexión</h2>
                        <p className="text-gray-400 mb-6">No se ha podido cargar el Leaderboard. Por favor, verifica tu conexión.</p>
                        <button
                            onClick={() => window.location.reload()}
                            className="bg-red-500 hover:bg-red-600 text-white px-6 py-2 rounded-lg font-bold transition-all"
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            )}

            {/* Header - Compact for TV */}
            <div className="bg-gray-800 border-b border-gray-700 py-2 px-6 flex justify-between items-center shadow-lg z-10 shrink-0">
                <div className="flex flex-col items-center">
                    <img
                        src={safeBranding.find((s: { key: string; value: string }) => s.key === 'bar_logo')?.value || '/logo.png'}
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
                            {/* Manual Entry Button */}
                            <button
                                onClick={() => setIsManualModalOpen(true)}
                                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold uppercase tracking-wide flex items-center transition-colors shadow-lg shadow-blue-600/20"
                            >
                                <PlusCircle size={16} className="mr-2" />
                                Registrar Tiempo
                            </button>

                            <div className="w-px h-6 bg-gray-700 mx-2"></div>

                            {/* Car Info */}
                            {selectedCar && (
                                <div className="px-3 py-1 bg-gray-700 rounded-lg border border-gray-600 flex items-center">
                                    <Car size={14} className="mr-2 text-blue-400" />
                                    <span className="font-bold uppercase text-xs">{selectedCar.replace(/_/g, ' ')}</span>
                                </div>
                            )}

                            {/* Period Tabs */}
                            <div className="flex bg-gray-700/50 rounded-lg p-1">
                                {Array.isArray(PERIODS) && PERIODS.map(p => (
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
                {/* Visual Section - Hidden on TV mode for full-screen table */}
                {!isTVMode && (
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
                                            value={getSetting('bar_public_url', 'http://localhost:3010/mobile')}
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
                )}

                {/* Ranking Table - Full width on TV, 3/4 on desktop */}
                <div className={`${isTVMode ? 'w-full' : 'w-3/4'} flex flex-col bg-gray-900`}>
                    <div className="flex-1 overflow-auto">
                        <table className="w-full text-left border-collapse">
                            <thead className="bg-gray-900 sticky top-0 z-20 shadow-md">
                                <tr>
                                    <th className="p-4 text-sm font-bold text-gray-500 uppercase tracking-widest w-20">Rank</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 uppercase tracking-widest">Piloto</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 uppercase tracking-widest">Coche</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 uppercase tracking-widest text-right">Tiempo</th>
                                    <th className="p-4 text-sm font-bold text-gray-500 uppercase tracking-widest text-right">Gap</th>
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
                                ) : !Array.isArray(leaderboard) || leaderboard.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="p-12 text-center text-gray-500">
                                            <p className="text-xl font-bold mb-2">Sin Tiempos Registrados</p>
                                            <p className="text-sm">Sé el primero en marcar una vuelta rápida en esta categoría.</p>
                                        </td>
                                    </tr>
                                ) : (Array.isArray(leaderboard) && leaderboard.map((entry: LeaderboardEntry, index: number) => (
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
                                                "w-10 h-10 flex items-center justify-center rounded-xl font-black font-mono text-lg transition-transform hover:scale-110",
                                                index === 0 ? "bg-gradient-to-br from-yellow-400 to-amber-600 text-black shadow-lg shadow-yellow-500/40 ring-2 ring-yellow-400/50" :
                                                    index === 1 ? "bg-gradient-to-br from-gray-300 to-gray-500 text-black shadow-lg shadow-gray-400/30 ring-2 ring-gray-400/30" :
                                                        index === 2 ? "bg-gradient-to-br from-orange-400 to-orange-700 text-white shadow-lg shadow-orange-500/30 ring-2 ring-orange-400/30" : "text-gray-400 bg-gray-800/80 border border-gray-700"
                                            )}>
                                                {entry.rank}
                                            </div>
                                        </td>
                                        <td className="px-6 py-5">
                                            <div className="flex items-center space-x-4">
                                                <div className="relative shrink-0">
                                                    <img
                                                        src={`https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(entry.driver_name)}`}
                                                        className="w-10 h-10 rounded-lg bg-gray-800 border border-gray-700 shadow-inner"
                                                        alt="Avatar"
                                                    />
                                                    {index === 0 && (
                                                        <div className="absolute -top-1 -right-1 bg-yellow-500 text-black p-0.5 rounded-full border border-gray-900">
                                                            <Trophy size={8} />
                                                        </div>
                                                    )}
                                                </div>
                                                <div>

                                                    <div className="font-bold text-gray-200 text-lg group-hover:text-white transition-all uppercase italic flex items-center gap-3">
                                                        {entry.driver_name}
                                                        {!isTVMode && <EloBadge driverName={entry.driver_name} size="sm" />}
                                                    </div>
                                                    <div className="text-xs text-gray-500 font-mono mt-0.5">
                                                        {new Date(entry.timestamp).toLocaleDateString()}
                                                    </div>

                                                </div>
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
                                            <div className="flex items-center justify-end space-x-3">
                                                <div className={cn(
                                                    "font-mono font-bold text-sm tabular-nums px-2 py-1 rounded inline-block",
                                                    index === 0 ? "text-yellow-500 bg-yellow-500/10" : "text-red-400 bg-red-400/10"
                                                )}>
                                                    {formatGap(entry.lap_time - leaderboard[0].lap_time)}
                                                </div>
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); setSelectedLapId(entry.lap_id); }}
                                                    className="p-2 bg-gray-700 hover:bg-blue-600 rounded text-gray-400 hover:text-white transition-colors group/btn"
                                                    title="Ver Telemetría"
                                                >
                                                    <BarChart2 size={16} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                )))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>


            <ManualEntryModal
                isOpen={isManualModalOpen}
                onClose={() => setIsManualModalOpen(false)}
                preselectedTrack={selectedTrack}
            />

            {/* TELEMETRY MODAL */}
            {selectedLapId && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
                    <div className="bg-gray-900 w-full max-w-5xl rounded-2xl shadow-2xl border border-gray-700 flex flex-col max-h-[90vh]">
                        <div className="flex items-center justify-between p-4 border-b border-gray-800">
                            <h3 className="text-xl font-black italic uppercase text-white flex items-center">
                                <Activity className="mr-2 text-yellow-500" />
                                Análisis de Telemetría
                            </h3>
                            <button
                                onClick={() => { setSelectedLapId(null); setCompareLapId(null); }}
                                className="p-2 hover:bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>

                        <div className="p-4 flex-1 overflow-y-auto">
                            <div className="flex items-center space-x-4 mb-4">
                                <div className="flex-1 bg-gray-800 p-3 rounded border border-gray-700">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Vuelta Principal</span>
                                    <span className="text-lg font-bold text-yellow-500">
                                        {leaderboard?.find(l => l.lap_id === selectedLapId)?.driver_name}
                                    </span>
                                </div>
                                <div className="flex-1 bg-gray-800 p-3 rounded border border-gray-700">
                                    <span className="text-[10px] uppercase font-bold text-gray-500 block">Comparar con...</span>
                                    <select
                                        className="w-full bg-transparent text-white font-bold outline-none border-none p-0 focus:ring-0 cursor-pointer"
                                        value={compareLapId || ""}
                                        onChange={(e) => setCompareLapId(e.target.value ? Number(e.target.value) : null)}
                                    >
                                        <option value="">-- Seleccionar Rival --</option>
                                        {Array.isArray(leaderboard) && leaderboard.filter(l => l.lap_id !== selectedLapId).map(l => (
                                            <option key={l.lap_id} value={l.lap_id} className="bg-gray-900">
                                                {l.rank}. {l.driver_name} ({formatTime(l.lap_time)})
                                            </option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <TelemetryChart lapId={selectedLapId} compareLapId={compareLapId || undefined} />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
