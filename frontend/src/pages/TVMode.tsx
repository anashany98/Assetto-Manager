import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Leaderboard from './Leaderboard';
import { HallOfFame } from './HallOfFame';
import { LiveMap } from '../components/LiveMap';
import EventCountdown from '../components/EventCountdown';
import { useQuery } from '@tanstack/react-query';
import { useTelemetry, type TelemetryPacket } from '../hooks/useTelemetry';
import { getEvents } from '../api/events';
import axios from 'axios';
import { API_URL } from '../config';
import { TournamentLeaderboard } from '../components/TournamentLeaderboard';
import { TournamentVersusWrapper } from '../components/TournamentVersusWrapper';
import TournamentBracket from '../components/TournamentBracket';
import { Trophy, AlertTriangle } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { TelemetryGauges } from '../components/TelemetryGauges';

const VIEWS = ['LEADERBOARD', 'HALL_OF_FAME', 'LIVE_MAP', 'COUNTDOWN', 'TOURNAMENT', 'BRACKET', 'SPONSORSHIP', 'JOIN_QR', 'SPY_VIEW', 'BATTLE_VIEW'];

export const TVMode = () => {
    const [currentViewIndex, setCurrentViewIndex] = useState(0);
    const { liveCars } = useTelemetry();
    const hasLiveCars = Object.keys(liveCars).length > 0;

    // Get Screen ID from URL
    const searchParams = new URLSearchParams(window.location.search);
    const screenId = searchParams.get('screen') || '1';

    // Fetch upcoming events
    const { data: upcomingEvents, error: eventsError } = useQuery({
        queryKey: ['events', 'upcoming'],
        queryFn: async () => {
            const res = await getEvents('upcoming');
            return Array.isArray(res) ? res : [];
        },
        refetchInterval: 60000 // Check every minute
    });

    if (eventsError) {
        console.error("Error fetching events:", eventsError);
    }
    const nextEvent = upcomingEvents && upcomingEvents.length > 0 ? upcomingEvents[0] : null;

    // Fetch active event for Tournament View
    const { data: activeEvent } = useQuery({
        queryKey: ['event_active'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/events/active`);
            return res.data;
        },
        refetchInterval: 60000
    });

    // Poll Settings for Remote Control
    const { data: settings } = useQuery({
        queryKey: ['settings_tv'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/settings/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        refetchInterval: 2000,
        initialData: []
    });

    // Resolve settings for THIS screen
    const modeKey = `tv_mode_${screenId}`;
    const viewKey = `tv_view_${screenId}`;

    const safeSettings = Array.isArray(settings) ? settings : [];

    const intervalSetting = safeSettings.find((s: { key: string; value: string }) => s.key === `tv_interval_${screenId}`)?.value;
    const playlistSetting = safeSettings.find((s: { key: string; value: string }) => s.key === `tv_playlist_${screenId}`)?.value;

    const tvMode = safeSettings.find((s: { key: string; value: string }) => s.key === modeKey)?.value || 'auto';
    const remoteView = safeSettings.find((s: { key: string; value: string }) => s.key === viewKey)?.value;

    const rotationInterval = intervalSetting ? parseInt(intervalSetting) * 1000 : 15000;

    // Filter available views based on activity
    let availableViews = VIEWS.slice(); // Copy

    // Apply Playlist Filter if exists
    if (playlistSetting) {
        try {
            const enabledViews = JSON.parse(playlistSetting);
            if (Array.isArray(enabledViews) && enabledViews.length > 0) {
                availableViews = availableViews.filter(v => enabledViews.includes(v));
            }
        } catch (e) {
            console.error("Invalid playlist settings", e);
        }
    }

    if (!hasLiveCars) {
        availableViews = availableViews.filter(v => v !== 'LIVE_MAP');
    }

    if (!nextEvent) {
        availableViews = availableViews.filter(v => v !== 'COUNTDOWN');
    }

    // fallback if everything is filtered out
    if (availableViews.length === 0) availableViews = ['LEADERBOARD'];

    // Auto Rotation
    useEffect(() => {
        if (tvMode === 'manual') return; // Stop rotation in manual mode

        const timer = setInterval(() => {
            setCurrentViewIndex(prev => (prev + 1) % availableViews.length);
        }, rotationInterval);

        return () => clearInterval(timer);
    }, [availableViews.length, tvMode, rotationInterval]);

    // Manual Override Logic
    useEffect(() => {
        // Optional handling for manual overrides
    }, [tvMode, remoteView, availableViews]);

    const activeView = (tvMode === 'manual' && remoteView) ? remoteView : availableViews[currentViewIndex];

    const getCurrentComponent = () => {
        switch (activeView) {
            case 'LEADERBOARD':
                // ... (existing Leaderboard case)
                return (
                    <div className="h-full w-full overflow-hidden">
                        <Leaderboard />
                    </div>
                );
            case 'HALL_OF_FAME':
                // ... (existing HallOfFame case)
                return (
                    <div className="h-full w-full overflow-hidden">
                        <HallOfFame />
                    </div>
                );
            case 'LIVE_MAP':
                // ... (existing LiveMap case)
                return (
                    <div className="h-full w-full relative grid grid-cols-12 gap-4 p-8">
                        {/* Left: Map */}
                        <div className="col-span-8 h-full">
                            <LiveMap drivers={Array.isArray(Object.values(liveCars)) ? Object.values(liveCars).map((c) => ({
                                id: Number(c.station_id) || 0,
                                name: c.driver || 'Desconocido',
                                x: c.x || 0,
                                z: c.z || 0,
                                normPos: c.normalized_pos || 0,
                                color: c.station_id === '1' ? '#ef4444' : c.station_id === '2' ? '#3b82f6' : c.station_id === '3' ? '#22c55e' : '#eab308',
                                isOnline: true
                            })) : []} trackName={(Array.isArray(Object.values(liveCars)) && Object.values(liveCars).length > 0) ? Object.values(liveCars)[0]?.track || 'Circuito' : 'Circuito'} />
                        </div>

                        {/* Right: Driver Status Cards */}
                        <div className="col-span-4 flex flex-col space-y-4 overflow-hidden">
                            <h2 className="text-xl font-black italic tracking-tighter text-yellow-500 uppercase">Estado de Pista</h2>
                            {Array.isArray(Object.values(liveCars)) && Object.values(liveCars).slice(0, 4).map((car) => (
                                <div key={car.station_id} className="bg-gray-900/80 border-l-4 border-yellow-500 p-4 rounded-r-xl shadow-xl transition-all hover:translate-x-1">
                                    <div className="flex justify-between items-start mb-2">
                                        <div className="font-black text-lg uppercase leading-none tracking-tighter italic">{car.driver}</div>
                                        <div className="text-[10px] bg-yellow-500 text-black px-1.5 py-0.5 rounded font-black italic">{Math.round(car.speed_kmh)} KM/H</div>
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[8px] uppercase font-bold text-gray-400">
                                        <div className="bg-white/5 p-1 px-2 rounded">
                                            <div className="text-gray-500">Motor</div>
                                            <div className={car.engine_temp > 100 ? 'text-red-500' : 'text-white'}>{Math.round(car.engine_temp || 0)}°C</div>
                                        </div>
                                        <div className="bg-white/5 p-1 px-2 rounded">
                                            <div className="text-gray-500">Combustible</div>
                                            <div className="text-white">{Math.round(car.fuel || 0)}L</div>
                                        </div>
                                        <div className="bg-white/5 p-1 px-2 rounded">
                                            <div className="text-gray-500">Daño</div>
                                            <div className={car.damage?.some((d: number) => d > 0.1) ? 'text-red-500' : 'text-green-500'}>
                                                {car.damage ? Math.round((car.damage as number[]).reduce((a: number, b: number) => a + b, 0) * 10) : 0}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tyre Temps Mini Bar */}
                                    <div className="mt-2 flex space-x-1 h-1">
                                        {Array.isArray(car.tyre_temp || [0, 0, 0, 0]) && (car.tyre_temp || [0, 0, 0, 0]).map((t: number, i: number) => (
                                            <div key={i} className="flex-1 rounded-full" style={{ backgroundColor: t > 100 ? '#ef4444' : t > 80 ? '#22c55e' : '#3b82f6' }} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'COUNTDOWN':
                // ... (existing Countdown case)
                return nextEvent ? (
                    <div className="h-full w-full">
                        <EventCountdown
                            eventName={nextEvent.name}
                            targetDate={nextEvent.start_date}
                        />
                    </div>
                ) : null;
            case 'TOURNAMENT':
                // ... (existing Tournament case)
                if (!activeEvent) {
                    return (
                        <div className="h-full w-full flex items-center justify-center bg-gray-900">
                            <div className="text-center">
                                <Trophy className="w-24 h-24 text-gray-700 mx-auto mb-4" />
                                <h1 className="text-4xl text-gray-500">No hay torneo activo</h1>
                            </div>
                        </div>
                    );
                }

                return (
                    <TournamentLeaderboard
                        eventId={activeEvent.id}
                        eventName={activeEvent.name}
                        description={activeEvent.description}
                    />
                );
            case 'BRACKET':
                // ... (existing Bracket case)
                if (!activeEvent) return null;
                return (
                    <div className="h-full w-full p-8 flex flex-col">
                        <h2 className="text-3xl font-black text-yellow-500 text-center uppercase tracking-widest mb-4">
                            Fase Eliminatoria: {activeEvent.name}
                        </h2>
                        <div className="flex-1 bg-gray-900/50 rounded-2xl border border-white/10 overflow-hidden">
                            <TournamentBracket eventId={activeEvent.id} isAdmin={false} />
                        </div>
                    </div>
                );
            case 'VERSUS':
                // ... (existing Versus case)
                if (!activeEvent) return null;
                return (
                    <TournamentVersusWrapper eventId={activeEvent.id} track={activeEvent.track_name} />
                );

            // --- NEW VIEWS ---
            case 'SPONSORSHIP':
                return <AdsView />;

            case 'JOIN_QR': {
                const publicUrl = safeSettings.find((s: { key: string; value: string }) => s.key === 'bar_public_url')?.value || window.location.origin + '/mobile';
                return <JoinView url={publicUrl} />;
            }

            case 'SPY_VIEW': {
                // Pick the first live car for spy view, or show placeholder
                const carsArray = Object.values(liveCars);
                if (carsArray.length === 0) {
                    return (
                        <div className="h-full w-full flex items-center justify-center bg-gray-900">
                            <div className="text-center">
                                <div className="w-24 h-24 border-4 border-yellow-500/30 border-t-yellow-500 rounded-full animate-spin mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-gray-500 uppercase tracking-widest">Esperando Telemetría</h2>
                                <p className="text-gray-600 text-sm mt-2">Conecta un simulador con un piloto activo</p>
                            </div>
                        </div>
                    );
                }
                const activeCar = carsArray[0];
                return <SpyView data={activeCar} />;
            }

            case 'BATTLE_VIEW': {
                // Show up to 4 live drivers in a 2x2 grid
                const carsArray = Object.values(liveCars).slice(0, 4);
                if (carsArray.length < 2) {
                    return (
                        <div className="h-full w-full flex items-center justify-center bg-gray-900">
                            <div className="text-center">
                                <div className="w-24 h-24 border-4 border-red-500/30 border-t-red-500 rounded-full animate-spin mx-auto mb-4" />
                                <h2 className="text-2xl font-bold text-gray-500 uppercase tracking-widest">Esperando Contendientes</h2>
                                <p className="text-gray-600 text-sm mt-2">Se necesitan al menos 2 pilotos activos</p>
                            </div>
                        </div>
                    );
                }
                return <BattleView drivers={carsArray} />;
            }

            default:
                return (
                    <div className="h-full w-full flex items-center justify-center bg-black">
                        {eventsError ? (
                            <div className="text-center text-red-500">
                                <AlertTriangle size={48} className="mx-auto mb-4 opacity-50" />
                                <p className="font-bold uppercase tracking-widest text-xs">Error de Conexión</p>
                            </div>
                        ) : (
                            <div className="text-center animate-pulse">
                                <img src="/logo.png" className="w-32 opacity-50 mx-auto" alt="Logo" />
                            </div>
                        )}
                    </div>
                );
        }
    };

    return (
        <div className="h-screen w-screen bg-black overflow-hidden relative text-white">
            {/* Ambient Background */}
            <div className="absolute inset-0 bg-gradient-to-br from-gray-900 to-black z-0 pointer-events-none" />

            <AnimatePresence mode='wait'>
                <motion.div
                    key={activeView}
                    initial={{ opacity: 0, x: 100 }}
                    animate={{ opacity: 1, x: 0 }}
                    exit={{ opacity: 0, x: -100 }}
                    transition={{ duration: 0.8, ease: "easeInOut" }}
                    className="h-full w-full relative z-10 pt-10" // Padding top to avoid cutting headers
                >
                    {getCurrentComponent()}
                </motion.div>
            </AnimatePresence>

            {/* Screen Identity Watermark */}
            <div className="absolute top-4 right-4 z-50 opacity-30 text-[10px] uppercase font-bold text-white border border-white/30 px-2 py-0.5 rounded">
                PANTALLA {screenId}
            </div>

        </div>
    );
};

// --- HELPER COMPONENTS ---

function AdsView() {
    const { data: ads, isLoading } = useQuery({
        queryKey: ['ads', 'active'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/ads/active`);
            return res.data;
        },
        refetchInterval: 30000
    });

    const [currentAdIndex, setCurrentAdIndex] = useState(0);

    useEffect(() => {
        if (!ads || ads.length === 0) return;

        const duration = (ads?.[currentAdIndex]?.display_duration || 10) * 1000;
        const timer = setTimeout(() => {
            setCurrentAdIndex((prev) => (prev + 1) % ads.length);
        }, duration);

        return () => clearTimeout(timer);
    }, [currentAdIndex, ads]);

    if (isLoading) return null;
    if (!ads || ads.length === 0) {
        return (
            <div className="h-full flex items-center justify-center">
                <p className="text-gray-600 uppercase tracking-widest font-bold">Espacio Publicitario Disponible</p>
            </div>
        );
    }

    const currentAd = ads[currentAdIndex];

    return (
        <div className="h-full w-full relative">
            <AnimatePresence mode='wait'>
                <motion.div
                    key={currentAd.id}
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 1 }}
                    className="absolute inset-0"
                >
                    <img
                        src={`${API_URL}/static/${currentAd.image_path}`}
                        className="w-full h-full object-cover"
                        alt={currentAd.title}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent flex flex-col justify-end p-12">
                        <h2 className="text-4xl md:text-6xl font-black text-white uppercase tracking-tighter mb-2 drop-shadow-lg">{currentAd.title}</h2>
                    </div>
                </motion.div>
            </AnimatePresence>
        </div>
    );
}

function JoinView({ url }: { url: string }) {
    return (
        <div className="h-full w-full flex items-center justify-center bg-gray-900 relative overflow-hidden">
            {/* Background Effects */}
            <div className="absolute inset-0 opacity-20">
                <div className="absolute top-0 left-0 w-96 h-96 bg-blue-600 rounded-full blur-[100px] -translate-x-1/2 -translate-y-1/2" />
                <div className="absolute bottom-0 right-0 w-96 h-96 bg-purple-600 rounded-full blur-[100px] translate-x-1/2 translate-y-1/2" />
            </div>

            <div className="relative z-10 flex flex-col md:flex-row items-center gap-12 p-8 max-w-6xl w-full">

                <div className="flex-1 text-center md:text-left space-y-6">
                    <div className="inline-block px-4 py-1 rounded-full bg-blue-500/20 text-blue-400 font-bold uppercase tracking-widest text-sm mb-2 border border-blue-500/30">
                        Portal del Piloto
                    </div>
                    <h1 className="text-5xl md:text-7xl font-black text-white uppercase tracking-tighter leading-none">
                        Únete a la <br /> <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-400">Carrera</span>
                    </h1>
                    <p className="text-xl text-gray-400 max-w-lg">
                        Escanea el código para ver tus estadísticas en tiempo real, comparar tiempos y acceder a tu pasaporte de piloto.
                    </p>
                    <div className="flex items-center space-x-4 justify-center md:justify-start pt-4">
                        <div className="flex -space-x-3">
                            <div className="w-10 h-10 rounded-full bg-gray-700 border-2 border-gray-900" />
                            <div className="w-10 h-10 rounded-full bg-gray-600 border-2 border-gray-900" />
                            <div className="w-10 h-10 rounded-full bg-gray-500 border-2 border-gray-900 flex items-center justify-center text-[10px] font-bold text-gray-900">+50</div>
                        </div>
                        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">Pilotos Conectados</span>
                    </div>
                </div>

                <div className="flex-1 flex justify-center">
                    <div className="p-8 bg-white rounded-3xl shadow-2xl shadow-blue-500/20 transform rotate-3 transition-transform hover:rotate-0 duration-500">
                        <QRCodeSVG
                            value={url}
                            size={300}
                            level="H"
                            imageSettings={{
                                src: "/logo.png",
                                x: undefined,
                                y: undefined,
                                height: 40,
                                width: 40,
                                excavate: true,
                            }}
                        />
                        <div className="text-center mt-4">
                            <p className="text-black font-black text-xl uppercase tracking-widest">Escanéame</p>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

function SpyView({ data }: { data: TelemetryPacket }) {
    return (
        <div className="h-full w-full">
            <TelemetryGauges data={data} />
        </div>
    );
}

function BattleView({ drivers }: { drivers: TelemetryPacket[] }) {
    const colors = [
        { bg: 'from-blue-600/20 to-blue-900/10', border: 'border-blue-500', text: 'text-blue-400', label: 'BLUE' },
        { bg: 'from-red-600/20 to-red-900/10', border: 'border-red-500', text: 'text-red-400', label: 'RED' },
        { bg: 'from-green-600/20 to-green-900/10', border: 'border-green-500', text: 'text-green-400', label: 'GREEN' },
        { bg: 'from-yellow-600/20 to-yellow-900/10', border: 'border-yellow-500', text: 'text-yellow-400', label: 'YELLOW' },
    ];

    // Find fastest based on current speed
    const fastestDriver = drivers.reduce((prev, current) =>
        (current.speed_kmh || 0) > (prev.speed_kmh || 0) ? current : prev
    );

    const gridCols = drivers.length <= 2 ? 'grid-cols-2' : 'grid-cols-2';
    const gridRows = drivers.length <= 2 ? '' : 'grid-rows-2';

    return (
        <div className="h-full w-full bg-gray-950 text-white relative overflow-hidden">
            {/* Background */}
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]" />

            {/* Header */}
            <header className="absolute top-0 left-0 right-0 z-30 p-4 flex justify-between items-center bg-black/50 backdrop-blur-sm border-b border-white/10">
                <div className="flex items-center gap-3">
                    <div className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                    <h1 className="text-2xl font-black uppercase tracking-tighter italic">Battle Mode</h1>
                </div>
                <div className="text-sm font-mono text-gray-400 uppercase tracking-widest">
                    {drivers.length} PILOTOS ACTIVOS
                </div>
            </header>

            {/* Driver Grid */}
            <div className={`h-full pt-16 grid ${gridCols} ${gridRows} gap-1`}>
                {drivers.map((driver, idx) => {
                    const color = colors[idx % colors.length];
                    const isFastest = driver.station_id === fastestDriver.station_id;

                    return (
                        <motion.div
                            key={driver.station_id}
                            initial={{ opacity: 0, scale: 0.9 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ delay: idx * 0.1 }}
                            className={`relative bg-gradient-to-br ${color.bg} border-l-4 ${color.border} p-6 flex flex-col justify-between overflow-hidden`}
                        >
                            {/* Corner Label */}
                            <div className={`absolute top-4 right-4 text-6xl font-black italic opacity-20 ${color.text}`}>
                                {idx + 1}
                            </div>

                            {/* Driver Info */}
                            <div>
                                <div className={`text-xs font-bold uppercase tracking-widest ${color.text} mb-1`}>
                                    {color.label} CORNER
                                </div>
                                <h2 className="text-3xl font-black uppercase tracking-tighter text-white truncate">
                                    {driver.driver || 'PILOTO'}
                                </h2>
                                <p className="text-sm text-gray-500 font-mono truncate">{driver.car || '-'}</p>
                            </div>

                            {/* Speed */}
                            <div className="flex-1 flex items-center justify-center">
                                <div className="text-center">
                                    <div className={`text-7xl font-black tabular-nums ${isFastest ? 'text-yellow-400' : 'text-white'}`}>
                                        {Math.round(driver.speed_kmh || 0)}
                                    </div>
                                    <div className="text-sm font-bold text-gray-500 uppercase tracking-widest">KM/H</div>
                                </div>
                            </div>

                            {/* Stats Row */}
                            <div className="grid grid-cols-3 gap-2 text-center">
                                <div className="bg-black/30 p-2 rounded-lg">
                                    <div className="text-[10px] text-gray-500 uppercase">RPM</div>
                                    <div className="text-lg font-bold font-mono">{Math.round(driver.rpm || 0)}</div>
                                </div>
                                <div className="bg-black/30 p-2 rounded-lg">
                                    <div className="text-[10px] text-gray-500 uppercase">Marcha</div>
                                    <div className="text-lg font-bold">{driver.gear === 0 ? 'N' : driver.gear === -1 ? 'R' : driver.gear}</div>
                                </div>
                                <div className="bg-black/30 p-2 rounded-lg">
                                    <div className="text-[10px] text-gray-500 uppercase">Vuelta</div>
                                    <div className="text-lg font-bold">{driver.laps || 0}</div>
                                </div>
                            </div>

                            {/* Fastest Indicator */}
                            {isFastest && (
                                <div className="absolute bottom-4 right-4 bg-yellow-500 text-black px-3 py-1 rounded-full text-xs font-black uppercase">
                                    LÍDER
                                </div>
                            )}
                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
