import React, { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelemetry } from '../hooks/useTelemetry';
import { Car, Search, Trophy, MapPin, Zap, Activity as ActivityIcon, Share2, X, Gauge, Crown, Settings } from 'lucide-react';
import { TelemetryChart } from '../components/TelemetryChart';
import { SimpleTelemetry } from '../components/SimpleTelemetry';
import { LiveDashboard } from '../components/LiveDashboard';
import { LiveMap } from '../components/LiveMap';
import { HallOfFame } from './HallOfFame';
import { cn } from '../lib/utils';
import axios from 'axios';
import html2canvas from 'html2canvas';
// import GhostViewer from '../components/GhostViewer';
// import { PlayCircle } from 'lucide-react'; // Removed unused

// Types
interface LeaderboardEntry {
    driver_name: string;
    car_model: string;
    track_name: string;
    lap_time: number;
    lap_id: number;
    timestamp: string;
    gap_to_first?: number;
    sectors?: number[];
    is_personal_best?: boolean;
}


const API_URL = window.location.hostname === 'localhost'
    ? `http://${window.location.hostname}:8000`
    : 'https://khaki-donkeys-share.loca.lt'; // HARDCODED TUNNEL FOR TESTING

const getLeaderboard = async (track: string, car: string, period: string) => {
    const params = new URLSearchParams();
    if (track && track !== 'all') params.append('track_name', track);
    if (car && car !== 'all') params.append('car_model', car);
    if (period && period !== 'all') params.append('period', period);
    const response = await axios.get(`${API_URL}/telemetry/leaderboard?${params.toString()}`);
    return response.data;
};

const getTrackCarCombinations = async () => {
    const response = await axios.get(`${API_URL}/telemetry/combinations`);
    return response.data;
};

const getPilotProfile = async (driverName: string) => {
    const response = await axios.get(`${API_URL}/telemetry/pilot/${encodeURIComponent(driverName)}`);
    return response.data;
};

// Utils
const formatTime = (ms: number) => {
    if (!ms) return "--:--.---";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
};

const formatDate = (isoString: string) => {
    return new Date(isoString).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });
};

// --- COMPONENTS ---

// Update Interface locally or in types file (doing locally for speed as per previous patterns)
interface SessionSummary {
    session_id: number;
    track_name: string;
    car_model: string;
    date: string;
    best_lap: number;
    laps_count: number;
}

interface PilotProfile {
    driver_name: string;
    total_laps: number;
    total_km: number;
    favorite_car: string;
    avg_consistency: number;
    active_days: number;
    records: any[];
    recent_sessions: SessionSummary[];
    rank_tier?: string; // Derived or optional
}

// Pilot Profile Modal Content
const PilotProfileContent = ({ driverName, onClose }: { driverName: string, onClose: () => void }) => {
    const [compareMode, setCompareMode] = useState(false);
    const [comparisonData, setComparisonData] = useState<any>(null);

    const { data: profile, isLoading } = useQuery({
        queryKey: ['pilot', driverName],
        queryFn: async () => {
            const data = await getPilotProfile(driverName);
            return data as PilotProfile;
        }
    });

    const { data: allDrivers } = useQuery({
        queryKey: ['leaderboard'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/leaderboard`);
            // Extract unique names
            const unique = Array.from(new Set((res.data as any[]).map(d => d.Driver.Name)));
            return unique.filter((d: any) => d !== driverName);
        },
        enabled: compareMode
    });

    const fetchComparison = async (opp: string) => {
        // Fallbacks if data is missing
        const track = profile?.records?.[0]?.track_name || 'monza';
        const car = profile?.favorite_car || 'abarth500';

        console.log(`Comparing ${driverName} vs ${opp} on ${track} w/ ${car}`);

        try {
            const res = await axios.get(`${API_URL}/telemetry/compare/${encodeURIComponent(driverName)}/${encodeURIComponent(opp)}?track=${encodeURIComponent(track)}&car=${encodeURIComponent(car)}`);
            setComparisonData(res.data);
        } catch (e) {
            console.error(e);
            alert(`No se encontraron datos coincidentes para ${track} con el coche ${car}. Intenta que ambos pilotos conduzcan lo mismo.`);
        }
    };

    // Social Share Logic
    const [shareImage, setShareImage] = React.useState<string | null>(null);

    const handleShare = async () => {
        if (!profile) return;
        const shareText = `🏁 ¡Soy Piloto Legendario! 🏁\n\nHe rodado ${profile.total_km}km y mi coche favorito es el ${(profile.favorite_car || '-').replace(/_/g, ' ')}.\n\n¿Puedes superar mis tiempos? Ven y compite contra mí. #SimRacing #BarLeague`;

        try {
            // First attempt: Native Share with File (if supported)
            const cardElement = document.getElementById('social-share-card');
            if (cardElement) {
                const canvas = await html2canvas(cardElement, {
                    backgroundColor: '#111827',
                    scale: 2,
                    useCORS: true // Important if images are external, though usually local
                });

                // Try to create blob
                const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));

                if (blob && navigator.share) {
                    try {
                        const file = new File([blob], 'pilot-passport.png', { type: 'image/png' });
                        await navigator.share({
                            title: 'Pasaporte de Competición',
                            text: shareText,
                            files: [file]
                        });
                        return; // Success
                    } catch (err) {
                        console.warn("Navigator share with files failed, trying visual fallback", err);
                    }
                }

                // If we are here, either navigator.share doesn't exist OR it failed (not HTTPS, etc)
                // Fallback: Show Modal with Image
                const imgUrl = canvas.toDataURL('image/png');
                setShareImage(imgUrl);
            }
        } catch (error) {
            console.log('Error generating share image:', error);
            alert("No se pudo generar la imagen. Texto copiado.");
            navigator.clipboard.writeText(shareText);
        }
    };



    if (isLoading) return <div className="p-10 text-center text-white">Cargando perfil...</div>;
    if (!profile) return null;

    if (comparisonData) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 overflow-y-auto">
                <div className="bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative border border-gray-800 animate-in fade-in zoom-in duration-300 p-6">
                    <button onClick={() => setComparisonData(null)} className="absolute top-4 right-4 text-gray-400 hover:text-white"><X /></button>

                    <h2 className="text-2xl font-black text-center text-white mb-6 italic uppercase">
                        CARA A CARA
                    </h2>

                    <div className="flex justify-between items-center mb-8">
                        <div className="text-center w-1/3">
                            <div className="text-lg font-bold text-blue-400 truncate">{comparisonData.driver_1.driver_name}</div>
                            <div className="text-4xl font-black text-white">{comparisonData.driver_1.win_count}</div>
                        </div>
                        <div className="text-center w-1/3 font-mono text-gray-500 text-sm">VS</div>
                        <div className="text-center w-1/3">
                            <div className="text-lg font-bold text-red-500 truncate">{comparisonData.driver_2.driver_name}</div>
                            <div className="text-4xl font-black text-white">{comparisonData.driver_2.win_count}</div>
                        </div>
                    </div>

                    <div className="space-y-4">
                        {/* Stat Rows */}
                        <div className="bg-gray-800/50 p-3 rounded-lg flex justify-between items-center">
                            <span className={`text-sm font-bold ${comparisonData.driver_1.best_lap < comparisonData.driver_2.best_lap ? 'text-green-400' : 'text-gray-500'}`}>
                                {formatTime(comparisonData.driver_1.best_lap)}
                            </span>
                            <span className="text-xs uppercase text-gray-400 font-bold">Mejor Vuelta</span>
                            <span className={`text-sm font-bold ${comparisonData.driver_2.best_lap < comparisonData.driver_1.best_lap ? 'text-green-400' : 'text-gray-500'}`}>
                                {formatTime(comparisonData.driver_2.best_lap)}
                            </span>
                        </div>

                        <div className="bg-gray-800/50 p-3 rounded-lg flex justify-between items-center">
                            <span className={`text-sm font-bold ${comparisonData.driver_1.consistency < comparisonData.driver_2.consistency ? 'text-green-400' : 'text-gray-500'}`}>
                                {comparisonData.driver_1.consistency}s
                            </span>
                            <span className="text-xs uppercase text-gray-400 font-bold">Consistencia</span>
                            <span className={`text-sm font-bold ${comparisonData.driver_2.consistency < comparisonData.driver_1.consistency ? 'text-green-400' : 'text-gray-500'}`}>
                                {comparisonData.driver_2.consistency}s
                            </span>
                        </div>

                        <div className="bg-gray-800/50 p-3 rounded-lg flex justify-between items-center">
                            <span className={`text-sm font-bold ${comparisonData.driver_1.total_laps > comparisonData.driver_2.total_laps ? 'text-green-400' : 'text-gray-500'}`}>
                                {comparisonData.driver_1.total_laps}
                            </span>
                            <span className="text-xs uppercase text-gray-400 font-bold">Vueltas Totales</span>
                            <span className={`text-sm font-bold ${comparisonData.driver_2.total_laps > comparisonData.driver_1.total_laps ? 'text-green-400' : 'text-gray-500'}`}>
                                {comparisonData.driver_2.total_laps}
                            </span>
                        </div>
                    </div>
                </div>
            </div>
        )
    }

    if (compareMode) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 overflow-y-auto">
                <div className="bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative border border-gray-800 animate-in fade-in zoom-in duration-300 p-6 h-[500px] flex flex-col">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-xl font-bold text-white">Elegir Rival</h3>
                        <button onClick={() => setCompareMode(false)}><X className="text-white" /></button>
                    </div>
                    <div className="flex-1 overflow-y-auto space-y-2">
                        {allDrivers?.map((d: any) => (
                            <button
                                key={d}
                                onClick={() => fetchComparison(d)}
                                className="w-full p-4 bg-gray-800 rounded-xl text-left text-white font-bold hover:bg-gray-700 transition-colors"
                            >
                                {d}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
        )
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/95 p-4 overflow-y-auto">
            <div className="bg-gray-900 w-full max-w-md rounded-3xl overflow-hidden shadow-2xl relative border border-gray-800 animate-in fade-in zoom-in duration-300">
                <button onClick={onClose} className="absolute top-4 right-4 z-20 bg-black/50 p-2 rounded-full text-white hover:bg-white/20">
                    <X size={20} />
                </button>

                {/* Header Card */}
                <div className="relative h-48 bg-gradient-to-br from-yellow-500 to-orange-600 p-6 flex flex-col justify-end" id="social-share-card-header">
                    {/* Background Pattern */}
                    <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

                    <div className="relative z-10 flex justify-between items-end">
                        <div className="flex-1">
                            <div className="flex items-center space-x-2 mb-2">
                                <span className="px-2 py-0.5 bg-black/30 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                                    {profile.rank_tier || 'ROOKIE'}
                                </span>
                                <span className="px-2 py-0.5 bg-black/30 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                                    Nvl {Math.floor(profile.total_km / 100) + 1}
                                </span>
                            </div>
                            <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-lg">
                                {profile.driver_name}
                            </h2>
                            <p className="text-white/80 text-xs font-bold uppercase tracking-wider mt-1">Piloto Oficial</p>
                        </div>

                        <button
                            onClick={() => setCompareMode(true)}
                            className="bg-white/20 backdrop-blur-md hover:bg-white/30 text-white font-bold py-2 px-4 rounded-full text-xs uppercase tracking-widest border border-white/30 shadow-lg transition-all"
                        >
                            VS Comparar
                        </button>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-center">
                            <Gauge className="mx-auto text-yellow-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-white">{profile.avg_consistency}%</div>
                            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Consistencia</div>
                        </div>
                        <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-center">
                            <MapPin className="mx-auto text-blue-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-white">{profile.total_km}</div>
                            <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">KM Totales</div>
                        </div>
                        <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-center col-span-2 flex items-center justify-between px-6">
                            <div className="text-left">
                                <ActivityIcon className="text-green-500 mb-1" size={20} />
                                <div className="text-xl font-black text-white">{profile.active_days}</div>
                                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Días Activo</div>
                            </div>
                            <div className="h-8 w-px bg-gray-700" />
                            <div className="text-right">
                                <Car className="text-purple-500 mb-1 ml-auto" size={20} />
                                <div className="text-xs font-bold text-white max-w-[120px] truncate">{(profile.favorite_car || '-').replace(/_/g, ' ')}</div>
                                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Coche Fav.</div>
                            </div>
                        </div>
                    </div>

                    {/* Session History */}
                    <div>
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center">
                            <ActivityIcon size={12} className="mr-1.5" /> Historial Reciente
                        </h3>
                        <div className="space-y-2 max-h-48 overflow-y-auto pr-1 custom-scrollbar">
                            {profile.recent_sessions && profile.recent_sessions.length > 0 ? (
                                profile.recent_sessions.map((session, idx) => (
                                    <div key={idx} className="bg-gray-800/30 p-3 rounded-xl border border-white/5 flex items-center justify-between hover:bg-gray-800 transition-colors">
                                        <div>
                                            <div className="flex items-center space-x-2">
                                                <span className="text-xs font-black text-white uppercase tracking-tight">{(session.track_name || '').replace(/_/g, ' ')}</span>
                                                <span className="text-[10px] text-gray-500 font-bold px-1.5 py-0.5 bg-gray-700 rounded capitalize">{(session.car_model || '').split('_')[0]}</span>
                                            </div>
                                            <div className="text-[10px] text-gray-600 font-mono mt-0.5">
                                                {new Date(session.date).toLocaleDateString()} • {session.laps_count} vueltas
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold text-sm text-yellow-500">{formatTime(session.best_lap)}</div>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center py-4 text-gray-600 text-xs italic">Sin historial reciente</div>
                            )}
                        </div>
                    </div>

                    {/* Records List */}
                    <div className="space-y-3">
                        <h3 className="text-xs font-black text-gray-500 uppercase tracking-widest mb-2 flex items-center">
                            <Trophy size={12} className="mr-1" /> Mejores Marcas
                        </h3>
                        {profile.records.slice(0, 3).map((rec: any, idx: number) => (
                            <div key={idx} className="flex justify-between items-center bg-gray-800 p-3 rounded-xl border border-gray-700/50">
                                <div className="flex items-center space-x-3">
                                    <div className={`w-6 h-6 rounded flex items-center justify-center text-[10px] font-black ${idx === 0 ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-gray-400'}`}>
                                        {idx + 1}
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-white uppercase">{rec.track_name.replace(/_/g, ' ')}</div>
                                        <div className="text-[10px] text-gray-500 truncate w-32">{rec.car_model.replace(/_/g, ' ')}</div>
                                    </div>
                                </div>
                                <div className="text-right">
                                    <div className="text-sm font-black text-white font-mono">{formatTime(rec.lap_time)}</div>
                                    <div className="text-[10px] text-gray-500">{formatDate(rec.timestamp)}</div>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Action Buttons */}
                    <button
                        onClick={handleShare}
                        className="w-full bg-blue-600 hover:bg-blue-500 py-4 rounded-xl text-white font-black uppercase tracking-widest text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                        <Share2 size={18} />
                        <span>Compartir Logro</span>
                    </button>
                </div>
            </div>

            {/* Hidden Social Card for Generation */}
            <div id="social-share-card"
                style={{
                    position: 'fixed',
                    top: 0,
                    left: '-10000px', // Off-screen but NOT hidden
                    zIndex: -1000,
                    opacity: 1, // Must be visible for html2canvas
                    pointerEvents: 'none',
                    width: '600px',
                    height: '600px',
                    background: 'linear-gradient(to bottom right, #111827, #000000)',
                    fontFamily: 'sans-serif'
                }}
            >
                <div style={{ padding: '40px', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', color: 'white' }}>

                    {/* Header */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '2px solid #333', paddingBottom: '20px' }}>
                        <div>
                            <h2 style={{ fontSize: '14px', color: '#FBBF24', textTransform: 'uppercase', letterSpacing: '2px', fontWeight: 'bold' }}>SimRacing Bar</h2>
                            <h1 style={{ fontSize: '48px', fontWeight: 900, fontStyle: 'italic', margin: '5px 0', lineHeight: 1 }}>{profile.driver_name}</h1>
                        </div>
                        <div style={{ width: '60px', height: '60px', background: '#FBBF24', borderRadius: '15px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                            <span style={{ fontSize: '24px', fontWeight: 'bold', color: 'black' }}>#1</span>
                        </div>
                    </div>

                    {/* Core Stats */}
                    <div style={{ display: 'flex', justifyContent: 'space-around', margin: '40px 0' }}>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', fontWeight: 'bold', color: 'white' }}>{profile.total_km.toFixed(0)}</div>
                            <div style={{ fontSize: '12px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>KM Totales</div>
                        </div>
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#10B981' }}>{profile.avg_consistency}%</div>
                            <div style={{ fontSize: '12px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>Consistencia</div>
                        </div>
                    </div>

                    {/* Favs */}
                    <div style={{ background: '#1F2937', padding: '20px', borderRadius: '20px' }}>
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Coche Favorito</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{(profile.favorite_car || 'Unknown').replace(/_/g, ' ')}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Días Activo</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{profile.active_days}</div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div style={{ textAlign: 'center', fontSize: '12px', color: '#4B5563', marginTop: 'auto' }}>
                        Generado por AC Manager - SimRacing Bar
                    </div>
                </div>
            </div>

            {/* Fallback Display Modal */}
            {shareImage && (
                <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/90 p-6 backdrop-blur-sm" onClick={() => setShareImage(null)}>
                    <div className="bg-gray-900 p-6 rounded-2xl max-w-sm w-full shadow-2xl border border-gray-700" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-between items-center mb-4">
                            <h3 className="text-white font-bold text-lg">Tu Tarjeta de Piloto</h3>
                            <button onClick={() => setShareImage(null)} className="text-gray-400 hover:text-white">
                                <X size={24} />
                            </button>
                        </div>
                        <img src={shareImage} alt="Share" className="w-full rounded-lg shadow-lg mb-4 border border-gray-800" />
                        <p className="text-center text-gray-400 text-xs mb-4">
                            Mantén pulsada la imagen para guardarla o compartirla.
                        </p>
                        <button
                            onClick={() => setShareImage(null)}
                            className="w-full bg-blue-600 text-white font-bold py-3 rounded-xl hover:bg-blue-500 transition-colors"
                        >
                            Cerrar
                        </button>
                    </div>
                </div>
            )}

        </div>
    );
};


export default function MobileLeaderboard() {
    const [selectedTrack, setSelectedTrack] = useState<string>("all");
    const [selectedCar, setSelectedCar] = useState<string>("all");
    const [selectedPeriod] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [currentTab, setCurrentTab] = useState<'leaderboard' | 'live-map' | 'live-data' | 'hall-of-fame' | 'admin'>('leaderboard');

    // Telemetry Hook for Live Data
    const { liveCars, isConnected } = useTelemetry();

    // UI States
    const [selectedPilot, setSelectedPilot] = useState<string | null>(null);
    const [selectedAnalysisLap, setSelectedAnalysisLap] = useState<number | null>(null);
    const [isSimpleMode, setIsSimpleMode] = useState(true);
    const [viewingTrack, setViewingTrack] = useState<string | null>(null);

    // Replay State
    // const [replayData, setReplayData] = useState<any[]>([]); 
    // const [showReplay, setShowReplay] = useState(false);

    // const handleOpenReplay = async (lapId: number) => { ... } // Replay feature pending
    // try {
    //     const res = await axios.get(`${API_URL}/telemetry/lap/${lapId}/telemetry`);
    //     setReplayData(res.data);
    //     setShowReplay(true);
    // } catch (e) {
    //     alert("No hay datos de replay para esta vuelta (versión antigua o sin telemetría).");
    // }
    // };


    // Check if any car is active (assuming single user station for mobile view context usually)
    // Or just pick the first one
    const activeCar = Object.values(liveCars)[0];
    const isRaceActive = activeCar && isConnected && (Date.now() - (activeCar.timestamp || Date.now()) < 5000); // 5s timeout

    // Queries
    const { data: leaderboard, isLoading } = useQuery({
        queryKey: ['leaderboard', selectedTrack, selectedCar, selectedPeriod],
        queryFn: () => getLeaderboard(selectedTrack, selectedCar, selectedPeriod),
        refetchInterval: 30000,
    });

    const { data: combinations } = useQuery({
        queryKey: ['combinations'],
        queryFn: getTrackCarCombinations,
        refetchInterval: 60000
    });

    // Configurations
    const { data: branding } = useQuery({
        queryKey: ['branding'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return res.data;
        }
    });

    // Derived State
    const filteredLeaderboard = useMemo(() => {
        return leaderboard?.filter((entry: LeaderboardEntry) =>
            entry.driver_name.toLowerCase().includes(searchQuery.toLowerCase())
        );
    }, [leaderboard, searchQuery]);

    const tracks = useMemo(() => [...new Set(combinations?.map((c: any) => c.track_name).filter(Boolean) || [])], [combinations]);
    const cars = useMemo(() => [...new Set(combinations?.map((c: any) => c.car_model).filter(Boolean) || [])], [combinations]);

    // Track Logic for Live Map
    const activeTracks = useMemo(() => Array.from(new Set(Object.values(liveCars).map(c => c.track).filter(Boolean))), [liveCars]);
    const currentMapTrack = viewingTrack || activeTracks[0];

    // Auto-select track if none selected
    useEffect(() => {
        if (!viewingTrack && activeTracks.length > 0) {
            setViewingTrack(activeTracks[0]);
        }
    }, [activeTracks, viewingTrack]);

    return (
        <div className="min-h-screen bg-gray-950 text-white font-sans flex flex-col">
            {/* Header Sticky */}
            <div className="sticky top-0 z-40 bg-gray-900/95 backdrop-blur-xl border-b border-white/5 p-4 shadow-2xl">
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center space-x-3">
                        <div className="w-10 h-10 bg-gradient-to-br from-yellow-400 to-orange-600 rounded-xl flex items-center justify-center shadow-lg shadow-yellow-500/20">
                            <Trophy className="text-white" size={20} />
                        </div>
                        <div>
                            <h1 className="text-lg font-black uppercase italic tracking-tight">
                                {Array.isArray(branding) ? branding.find((s: any) => s.key === 'bar_name')?.value || 'SimRacing Bar' : (branding as any)?.bar_name || 'SimRacing Bar'}
                            </h1>
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${isRaceActive ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {isRaceActive ? 'LIVE' : 'OFFLINE'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-2 mb-2">
                    <button
                        onClick={() => setCurrentTab('leaderboard')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'leaderboard'
                                ? "border-yellow-500 text-yellow-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        Tiempos
                    </button>
                    <button
                        onClick={() => setCurrentTab('live-map')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'live-map'
                                ? "border-blue-500 text-blue-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        Mapa
                    </button>
                    <button
                        onClick={() => setCurrentTab('live-data')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'live-data'
                                ? "border-red-500 text-red-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        Telemetría
                    </button>
                    <button
                        onClick={() => setCurrentTab('hall-of-fame')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'hall-of-fame'
                                ? "border-purple-500 text-purple-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        Leyendas
                    </button>
                    <button
                        onClick={() => setCurrentTab('admin')}
                        className={cn(
                            "w-12 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all flex items-center justify-center",
                            currentTab === 'admin'
                                ? "border-gray-500 text-white"
                                : "border-transparent text-gray-600 hover:text-gray-400"
                        )}
                    >
                        <Settings size={14} />
                    </button>
                </div>

                {/* Filters (only for leaderboard) */}
                {currentTab === 'leaderboard' && (
                    <div className="space-y-3 animate-in slide-in-from-top-2 duration-300">
                        {/* Search */}
                        <div className="relative group">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <Search size={16} className="text-gray-500 group-focus-within:text-blue-500 transition-colors" />
                            </div>
                            <input
                                type="text"
                                placeholder="Buscar tu nombre..."
                                className="w-full bg-gray-800/50 border-2 border-transparent focus:border-blue-500/50 rounded-2xl py-3.5 pl-12 pr-4 text-sm font-bold placeholder:text-gray-600 outline-none transition-all shadow-inner text-white"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>

                        {/* Dropdowns */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-blue-500">
                                    <MapPin size={14} />
                                </div>
                                <select
                                    value={selectedTrack}
                                    onChange={(e) => setSelectedTrack(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-800 rounded-xl py-3 pl-9 pr-2 text-xs font-black uppercase appearance-none outline-none focus:ring-2 focus:ring-blue-500/20 text-white"
                                >
                                    <option value="all">TODOS LOS CIRCUITOS</option>
                                    {tracks.map((t: any) => <option key={t} value={t}>{(t || '').toUpperCase()}</option>)}
                                </select>
                            </div>
                            <div className="relative">
                                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">
                                    <Car size={14} />
                                </div>
                                <select
                                    value={selectedCar}
                                    onChange={(e) => setSelectedCar(e.target.value)}
                                    className="w-full bg-gray-900 border border-gray-800 rounded-xl py-3 pl-9 pr-2 text-xs font-black uppercase appearance-none outline-none focus:ring-2 focus:ring-blue-500/20 text-white"
                                >
                                    <option value="all">TODOS LOS COCHES</option>
                                    {cars.map((c: any) => <option key={c} value={c}>{(c || '').toUpperCase()}</option>)}
                                </select>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* CONTENT AREA */}
            <div className="flex-1 overflow-y-auto pb-20 p-4">

                {currentTab === 'leaderboard' ? (
                    isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20">
                            <Zap className="animate-bounce text-yellow-500 mb-4" size={32} />
                            <p className="text-gray-500 font-bold text-xs uppercase tracking-widest">Cargando Tiempos...</p>
                        </div>
                    ) : filteredLeaderboard?.length === 0 ? (
                        <div className="text-center py-20 opacity-50">
                            <p className="text-gray-400 font-bold">No hay registros</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {filteredLeaderboard?.map((entry: LeaderboardEntry, idx: number) => (
                                <div
                                    key={idx}
                                    onClick={() => setSelectedPilot(entry.driver_name)}
                                    className="group bg-gray-900/50 hover:bg-gray-800 border border-white/5 hover:border-blue-500/30 rounded-2xl p-4 transition-all active:scale-[0.98] relative overflow-hidden"
                                >
                                    <div className="flex items-center justify-between relative z-10">
                                        <div className="flex items-center space-x-4">
                                            <div className={cn(
                                                "w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shadow-inner",
                                                idx === 0 ? "bg-yellow-500 text-black shadow-yellow-500/50" :
                                                    idx === 1 ? "bg-gray-300 text-black" :
                                                        idx === 2 ? "bg-orange-700 text-white" :
                                                            "bg-gray-800 text-gray-500"
                                            )}>
                                                {idx + 1}
                                            </div>
                                            <div>
                                                <h3 className={cn(
                                                    "font-black italic uppercase tracking-tight text-lg leading-none mb-1 group-hover:text-blue-400 transition-colors",
                                                    idx === 0 ? "text-yellow-500" : "text-white"
                                                )}>
                                                    {entry.driver_name}
                                                </h3>
                                                <div className="flex items-center text-[10px] font-bold text-gray-500 space-x-2 uppercase tracking-wide">
                                                    <span className="flex items-center gap-1"><Car size={10} /> {(entry.car_model || '').replace(/_/g, ' ')}</span>
                                                    <span className="w-1 h-1 bg-gray-700 rounded-full" />
                                                    <span className="flex items-center gap-1 text-gray-400"><MapPin size={10} /> {(entry.track_name || '').replace(/_/g, ' ')}</span>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="text-right">
                                            <div className="font-mono font-black text-xl text-white tracking-tight">
                                                {formatTime(entry.lap_time)}
                                            </div>
                                            <div className="text-[10px] font-bold text-gray-600 uppercase tracking-widest mt-0.5">
                                                {formatDate(entry.timestamp)}
                                            </div>
                                            {entry.lap_id && (
                                                <div className="flex justify-end space-x-2 mt-2">
                                                    {/* <button
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            handleOpenReplay(entry.lap_id);
                                                        }}
                                                        className="text-xs flex items-center space-x-1 text-green-500 hover:text-green-400 transition-colors"
                                                    >
                                                        <PlayCircle size={12} />
                                                        <span className="font-bold uppercase">Replay 3D</span>
                                                    </button> */}
                                                </div>
                                            )}
                                        </div>
                                    </div>

                                    {/* Decoration */}
                                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-blue-500/5 to-transparent skew-x-12 group-hover:from-blue-500/10 transition-all" />
                                </div>
                            ))}
                        </div>
                    )
                ) : currentTab === 'live-map' ? (
                    // LIVE MAP VIEW
                    <div className="h-full p-2 flex flex-col">
                        {/* Track Selector (if multiple tracks) */}
                        {activeTracks.length > 1 && (
                            <div className="flex space-x-2 mb-2 overflow-x-auto pb-1">
                                {activeTracks.map(track => (
                                    <button
                                        key={track}
                                        onClick={() => setViewingTrack(track)}
                                        className={cn(
                                            "px-3 py-1 rounded-full text-[10px] font-bold uppercase whitespace-nowrap border transition-all",
                                            (currentMapTrack) === track
                                                ? "bg-blue-600 border-blue-400 text-white shadow-lg"
                                                : "bg-gray-800 border-gray-700 text-gray-400 hover:text-white"
                                        )}
                                    >
                                        {track.replace(/_/g, ' ')}
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* LIVE MAP CONTAINER */}
                        {Object.keys(liveCars).length > 0 && currentMapTrack ? (
                            <LiveMap
                                cars={Object.values(liveCars).filter(c => c.track === currentMapTrack)}
                                trackName={currentMapTrack}
                            />
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                                <MapPin size={48} className="opacity-20 translate-y-2" />
                                <p className="text-xs font-bold uppercase tracking-widest text-center">
                                    Esperando coches en pista...
                                </p>
                            </div>
                        )}
                    </div>
                ) : currentTab === 'hall-of-fame' ? (
                    <div className="h-full bg-gray-900">
                        <HallOfFame embedded={true} />
                    </div>
                ) : currentTab === 'admin' ? (
                    <div className="p-4 space-y-6">
                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
                            <h2 className="text-xl font-bold text-white mb-4 flex items-center">
                                <Crown className="mr-2 text-yellow-500" /> Panel de Control
                            </h2>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="bg-gray-900 p-4 rounded-lg text-center">
                                    <div className="text-gray-500 text-xs font-bold uppercase">Estado Servidor</div>
                                    <div className="text-green-500 font-black text-lg flex items-center justify-center mt-1">
                                        <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
                                        ONLINE
                                    </div>
                                </div>
                                <div className="bg-gray-900 p-4 rounded-lg text-center">
                                    <div className="text-gray-500 text-xs font-bold uppercase">Pilotos Activos</div>
                                    <div className="text-white font-black text-lg mt-1">{Object.keys(liveCars).length}</div>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 opacity-50 pointer-events-none">
                            <h3 className="text-lg font-bold text-gray-400 mb-2 flex items-center">
                                <Settings className="mr-2" /> Control Remoto TV
                            </h3>
                            <p className="text-xs text-gray-500 mb-4">Próximamente: Cambia la vista de la TV desde aquí.</p>
                            <div className="grid grid-cols-3 gap-2">
                                <button className="bg-blue-600/20 text-blue-500 font-bold py-2 rounded text-xs border border-blue-500/30">LADDER</button>
                                <button className="bg-blue-600/20 text-blue-500 font-bold py-2 rounded text-xs border border-blue-500/30">MAPA</button>
                                <button className="bg-blue-600/20 text-blue-500 font-bold py-2 rounded text-xs border border-blue-500/30">HOF</button>
                            </div>
                        </div>
                    </div>
                ) : (
                    // LIVE DATA/TELEMETRY VIEW
                    <div className="space-y-4">
                        {Object.keys(liveCars).length > 0 ? (
                            Object.values(liveCars).map(car => (
                                <LiveDashboard
                                    key={car.station_id}
                                    data={car}
                                    isActive={true}
                                    variant="inline"
                                />
                            ))
                        ) : (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-4 animate-pulse">
                                <ActivityIcon size={48} className="opacity-20" />
                                <p className="text-xs font-black uppercase tracking-widest">Esperando telemetría...</p>
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            {selectedPilot && <PilotProfileContent driverName={selectedPilot} onClose={() => setSelectedPilot(null)} />}

            {/* Telemetry Analysis Modal */}
            {
                selectedAnalysisLap && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg p-4 shadow-2xl relative">
                            <button
                                onClick={() => setSelectedAnalysisLap(null)}
                                className="absolute top-4 right-4 text-gray-500 hover:text-white"
                            >
                                <X size={20} />
                            </button>

                            <div className="flex items-center justify-between mb-2">
                                <div>
                                    <h2 className="text-lg font-black italic uppercase tracking-tight text-white mb-1">Análisis de Telemetría</h2>
                                    <p className="text-xs text-gray-400 font-bold uppercase tracking-widest">{isSimpleMode ? 'Resumen Principal' : 'Velocidad vs Tiempo'}</p>
                                </div>
                                <div className="flex bg-gray-800 rounded-lg p-1">
                                    <button
                                        onClick={() => setIsSimpleMode(true)}
                                        className={cn(
                                            "px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all",
                                            isSimpleMode ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                                        )}
                                    >
                                        Simple
                                    </button>
                                    <button
                                        onClick={() => setIsSimpleMode(false)}
                                        className={cn(
                                            "px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all",
                                            !isSimpleMode ? "bg-blue-600 text-white shadow-lg" : "text-gray-400 hover:text-white"
                                        )}
                                    >
                                        Experto
                                    </button>
                                </div>
                            </div>

                            {isSimpleMode ? (
                                <SimpleTelemetry lapId={selectedAnalysisLap} />
                            ) : (
                                <TelemetryChart lapId={selectedAnalysisLap} />
                            )}

                            <div className="mt-4 flex justify-end">
                                <button
                                    onClick={() => setSelectedAnalysisLap(null)}
                                    className="text-xs font-bold text-gray-500 hover:text-white uppercase tracking-widest"
                                >
                                    Cerrar
                                </button>
                            </div>
                        </div>
                    </div>
                )
            }
            {/* Live Dashboard Overlay REMOVED */}

            {/* <GhostViewer
                isOpen={showReplay}
                onClose={() => setShowReplay(false)}
                data={replayData}
            /> */}
        </div >
    );
}
