import React, { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTelemetry } from '../hooks/useTelemetry';
import { Car, Search, Trophy, MapPin, Zap, Activity as ActivityIcon, Share2, X, Gauge, LineChart as ChartIcon } from 'lucide-react';
import { TelemetryChart } from '../components/TelemetryChart';
import { cn } from '../lib/utils';
import axios from 'axios';
import html2canvas from 'html2canvas';

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


const API_URL = `http://${window.location.hostname}:8000`;

const getLeaderboard = async (track: string, car: string, period: string) => {
    const params = new URLSearchParams();
    if (track && track !== 'all') params.append('track', track);
    if (car && car !== 'all') params.append('car', car);
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

// Pilot Profile Modal Content
const PilotProfileContent = ({ driverName, onClose }: { driverName: string, onClose: () => void }) => {
    const { data: profile, isLoading } = useQuery({
        queryKey: ['pilot', driverName],
        queryFn: () => getPilotProfile(driverName)
    });

    // Social Share Logic
    const [shareImage, setShareImage] = React.useState<string | null>(null);

    const handleShare = async () => {
        if (!profile) return;
        const shareText = `🏁 ¡Soy Piloto Legendario! 🏁\n\nHe rodado ${profile.total_km}km y mi coche favorito es el ${profile.favorite_car.replace(/_/g, ' ' || '-')}.\n\n¿Puedes superar mis tiempos? Ven y compite contra mí. #SimRacing #BarLeague`;

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

                    <div className="relative z-10">
                        <div className="flex items-center space-x-2 mb-2">
                            <span className="px-2 py-0.5 bg-black/30 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                                {profile.rank_tier || 'ROOKIE'}
                            </span>
                            <span className="px-2 py-0.5 bg-black/30 backdrop-blur-md rounded text-[10px] font-bold text-white uppercase tracking-widest border border-white/10">
                                Nvl {Math.floor(profile.total_km / 100) + 1}
                            </span>
                        </div>
                        <h2 className="text-3xl font-black text-white italic tracking-tighter uppercase leading-none drop-shadow-lg">
                            {profile.name}
                        </h2>
                        <p className="text-white/80 text-xs font-bold uppercase tracking-wider mt-1">Piloto Oficial</p>
                    </div>
                </div>

                {/* Stats Grid */}
                <div className="p-6 space-y-6">
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-center">
                            <Gauge className="mx-auto text-yellow-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-white">{profile.total_km.toFixed(0)}</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">KM Totales</div>
                        </div>
                        <div className="bg-gray-800/50 p-4 rounded-2xl border border-gray-700/50 text-center">
                            <ActivityIcon className="mx-auto text-green-500 mb-2" size={24} />
                            <div className="text-2xl font-black text-white">{profile.consistency_rating}%</div>
                            <div className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Consistencia</div>
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
                            <h1 style={{ fontSize: '48px', fontWeight: 900, fontStyle: 'italic', margin: '5px 0', lineHeight: 1 }}>{profile.name}</h1>
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
                            <div style={{ fontSize: '48px', fontWeight: 'bold', color: '#10B981' }}>{profile.consistency_rating}</div>
                            <div style={{ fontSize: '12px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '1px' }}>Consistencia</div>
                        </div>
                    </div>

                    {/* Favs */}
                    <div style={{ background: '#1F2937', padding: '20px', borderRadius: '20px' }}>
                        <div style={{ marginBottom: '15px' }}>
                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Coche Favorito</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{profile.favorite_car.replace(/_/g, ' ')}</div>
                        </div>
                        <div>
                            <div style={{ fontSize: '10px', color: '#6B7280', textTransform: 'uppercase' }}>Circuito Favorito</div>
                            <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{profile.favorite_track.replace(/_/g, ' ')}</div>
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
    const [currentTab, setCurrentTab] = useState<'leaderboard' | 'live'>('leaderboard');

    // Telemetry Hook for Live Data
    const { liveCars, isConnected } = useTelemetry();

    // UI States
    const [selectedPilot, setSelectedPilot] = useState<string | null>(null);
    const [selectedAnalysisLap, setSelectedAnalysisLap] = useState<number | null>(null);

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
            const res = await axios.get(`${API_URL}/settings/branding`);
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
                                {Array.isArray(branding) ? branding.find((s: any) => s.key === 'bar_name')?.value || 'SimRacing Bar' : 'SimRacing Bar'}
                            </h1>
                            <div className="flex items-center space-x-2">
                                <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-gray-500'}`} />
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">
                                    {isConnected ? 'LIVE' : 'OFFLINE'}
                                </span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="flex space-x-4 mb-2">
                    <button
                        onClick={() => setCurrentTab('leaderboard')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'leaderboard'
                                ? "border-yellow-500 text-yellow-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        Clasificación
                    </button>
                    <button
                        onClick={() => setCurrentTab('live')}
                        className={cn(
                            "flex-1 pb-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all",
                            currentTab === 'live'
                                ? "border-red-500 text-red-500"
                                : "border-transparent text-gray-500 hover:text-gray-300"
                        )}
                    >
                        En Vivo 🔴
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
                                                    <span className="flex items-center gap-1"><Car size={10} /> {entry.car_model.replace(/_/g, ' ')}</span>
                                                    <span className="w-1 h-1 bg-gray-700 rounded-full" />
                                                    <span className="flex items-center gap-1 text-gray-400"><MapPin size={10} /> {entry.track_name.replace(/_/g, ' ')}</span>
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
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        setSelectedAnalysisLap(entry.lap_id);
                                                    }}
                                                    className="mt-2 text-xs flex items-center justify-end space-x-1 text-blue-500 hover:text-blue-400 transition-colors"
                                                >
                                                    <ChartIcon size={12} />
                                                    <span className="font-bold uppercase">Ver Telemetría</span>
                                                </button>
                                            )}
                                        </div>
                                    </div>

                                    {/* Decoration */}
                                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-blue-500/5 to-transparent skew-x-12 group-hover:from-blue-500/10 transition-all" />
                                </div>
                            ))}
                        </div>
                    )
                ) : (
                    // LIVE TIMING VIEW
                    <div className="space-y-4">
                        {Object.values(liveCars).length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-64 text-gray-500 space-y-4 animate-pulse">
                                <ActivityIcon size={48} className="opacity-20" />
                                <p className="text-xs font-black uppercase tracking-widest">Esperando coches en pista...</p>
                            </div>
                        ) : (
                            Object.values(liveCars).map((car: any) => (
                                <div key={car.station_id} className="bg-gray-800/50 rounded-2xl p-4 border border-gray-700/50 relative overflow-hidden animate-in fade-in slide-in-from-bottom-2">
                                    {/* Speed Background Effect */}
                                    <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-red-500/10 to-transparent skew-x-12" />

                                    <div className="flex justify-between items-start mb-4 relative z-10">
                                        <div className="flex items-center space-x-3">
                                            <div className="w-10 h-10 bg-gray-700 rounded-full flex items-center justify-center text-white font-black text-sm border-2 border-gray-600 shadow-lg">
                                                {car.pos || '-'}
                                            </div>
                                            <div>
                                                <h3 className="text-white font-black italic uppercase tracking-tight text-lg">{car.driver || 'Desconocido'}</h3>
                                                <p className="text-[10px] text-gray-400 font-bold uppercase">{car.car}</p>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-3xl font-black text-white font-mono leading-none">
                                                {Math.round(car.speed_kmh)} <span className="text-xs text-gray-500">KM/H</span>
                                            </div>
                                            <div className="flex items-center justify-end space-x-1 mt-1 text-gray-400">
                                                <Gauge size={12} />
                                                <span className="text-[10px] font-bold">{car.rpm} RPM</span>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Telemetry Details */}
                                    <div className="grid grid-cols-2 gap-2 relative z-10">
                                        <div className="bg-black/30 p-2 rounded-lg flex items-center justify-between">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Vuelta Actual</span>
                                            <span className="text-white font-mono font-bold text-sm">{formatTime(car.lap_time_ms)}</span>
                                        </div>
                                        <div className="bg-black/30 p-2 rounded-lg flex items-center justify-between">
                                            <span className="text-[10px] text-gray-500 uppercase font-bold">Marcha</span>
                                            <span className="text-yellow-500 font-black text-xl">{car.gear === 0 ? 'R' : car.gear === 1 ? 'N' : car.gear - 1}</span>
                                        </div>
                                    </div>

                                    {/* Progress Bar (Normalized Pos) */}
                                    <div className="h-1.5 bg-gray-700 mt-4 rounded-full overflow-hidden">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-400 to-red-500 transition-all duration-300 ease-out"
                                            style={{ width: `${(car.normalized_pos || 0) * 100}%` }}
                                        />
                                    </div>
                                </div>
                            ))
                        )}
                    </div>
                )}
            </div>

            {/* Profile Modal */}
            {selectedPilot && <PilotProfileContent driverName={selectedPilot} onClose={() => setSelectedPilot(null)} />}

            {/* Telemetry Analysis Modal */}
            {selectedAnalysisLap && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
                    <div className="bg-gray-900 border border-white/10 rounded-2xl w-full max-w-lg p-4 shadow-2xl relative">
                        <button
                            onClick={() => setSelectedAnalysisLap(null)}
                            className="absolute top-4 right-4 text-gray-500 hover:text-white"
                        >
                            <X size={20} />
                        </button>

                        <h2 className="text-lg font-black italic uppercase tracking-tight text-white mb-1">Análisis de Telemetría</h2>
                        <p className="text-xs text-gray-400 font-bold uppercase tracking-widest mb-6">Velocidad vs Tiempo</p>

                        <TelemetryChart lapId={selectedAnalysisLap} />

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
            )}
        </div >
    );
}
