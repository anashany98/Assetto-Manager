import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import Leaderboard from './Leaderboard'; // Default export
import { HallOfFame } from './HallOfFame'; // Named export
import { LiveMap } from '../components/LiveMap'; // Reusing existing
import EventCountdown from '../components/EventCountdown';
import { useQuery } from '@tanstack/react-query';
import { useTelemetry } from '../hooks/useTelemetry';
import { getEvents } from '../api/events';
import axios from 'axios';
import { TournamentLeaderboard } from '../components/TournamentLeaderboard';
import { TournamentVersusWrapper } from '../components/TournamentVersusWrapper';
import TournamentBracket from '../components/TournamentBracket';
import { Trophy } from 'lucide-react';


const VIEWS = ['LEADERBOARD', 'HALL_OF_FAME', 'LIVE_MAP', 'COUNTDOWN', 'TOURNAMENT', 'BRACKET'];
const ROTATION_INTERVAL = 15000; // Faster rotation 15s

export const TVMode = () => {
    const [currentViewIndex, setCurrentViewIndex] = useState(0);
    const { liveCars } = useTelemetry();
    const hasLiveCars = Object.keys(liveCars).length > 0;

    // Get Screen ID from URL
    const searchParams = new URLSearchParams(window.location.search);
    const screenId = searchParams.get('screen') || '1';

    // Fetch upcoming events
    const { data: upcomingEvents } = useQuery({
        queryKey: ['events', 'upcoming'],
        queryFn: () => getEvents('upcoming'),
        refetchInterval: 60000 // Check every minute
    });
    const nextEvent = upcomingEvents && upcomingEvents.length > 0 ? upcomingEvents[0] : null;

    // Fetch active event for Tournament View
    const { data: activeEvent } = useQuery({
        queryKey: ['event_active'],
        queryFn: async () => {
            const res = await axios.get(`http://${window.location.hostname}:8000/events/active`);
            return res.data;
        },
        refetchInterval: 60000
    });

    // Poll Settings for Remote Control
    const { data: settings } = useQuery({
        queryKey: ['settings_tv'],
        queryFn: async () => {
            const res = await axios.get(`http://${window.location.hostname}:8000/settings`);
            return res.data;
        },
        refetchInterval: 2000
    });

    // Resolve settings for THIS screen
    const modeKey = `tv_mode_${screenId}`;
    const viewKey = `tv_view_${screenId}`;

    const tvMode = settings?.find((s: any) => s.key === modeKey)?.value || 'auto';
    const remoteView = settings?.find((s: any) => s.key === viewKey)?.value;

    // Filter available views based on activity
    let availableViews = VIEWS.slice(); // Copy

    if (!hasLiveCars) {
        availableViews = availableViews.filter(v => v !== 'LIVE_MAP');
    }

    if (!nextEvent) {
        availableViews = availableViews.filter(v => v !== 'COUNTDOWN');
    }

    // Auto Rotation
    useEffect(() => {
        if (tvMode === 'manual') return; // Stop rotation in manual mode

        const timer = setInterval(() => {
            setCurrentViewIndex(prev => (prev + 1) % availableViews.length);
        }, ROTATION_INTERVAL);

        return () => clearInterval(timer);
    }, [availableViews.length, tvMode]);

    // Manual Override Logic
    useEffect(() => {
        if (tvMode === 'manual' && remoteView) {
            if (remoteView === 'TOURNAMENT') {
                // Special handling if needed
            } else {
                const idx = availableViews.indexOf(remoteView);
                if (idx !== -1) setCurrentViewIndex(idx);
            }
        }
    }, [tvMode, remoteView, availableViews]);

    const activeView = (tvMode === 'manual' && remoteView) ? remoteView : availableViews[currentViewIndex];

    const getCurrentComponent = () => {
        switch (activeView) {
            case 'LEADERBOARD':
                return (
                    <div className="h-full overflow-hidden transform scale-90 origin-top">
                        <div className="pointer-events-none">
                            <Leaderboard />
                        </div>
                    </div>
                );
            case 'HALL_OF_FAME':
                return (
                    <div className="h-full overflow-hidden transform scale-90 origin-top">
                        <HallOfFame />
                    </div>
                );
            case 'LIVE_MAP':
                return (
                    <div className="h-full w-full relative grid grid-cols-12 gap-4 p-8">
                        {/* Left: Map */}
                        <div className="col-span-8 h-full">
                            <LiveMap drivers={Object.values(liveCars).map((c: any) => ({
                                id: c.station_id,
                                name: c.driver || 'Desconocido',
                                x: c.x || 0,
                                z: c.z || 0,
                                normPos: c.normalized_pos || 0,
                                color: c.station_id === 1 ? '#ef4444' : c.station_id === 2 ? '#3b82f6' : c.station_id === 3 ? '#22c55e' : '#eab308',
                                isOnline: true
                            }))} trackName={Object.values(liveCars)[0]?.track || 'Circuito'} />
                        </div>

                        {/* Right: Driver Status Cards */}
                        <div className="col-span-4 flex flex-col space-y-4 overflow-hidden">
                            <h2 className="text-xl font-black italic tracking-tighter text-yellow-500 uppercase">Estado de Pista</h2>
                            {Object.values(liveCars).slice(0, 4).map((car: any) => (
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
                                                {car.damage ? Math.round(car.damage.reduce((a: any, b: any) => a + b, 0) * 10) : 0}%
                                            </div>
                                        </div>
                                    </div>

                                    {/* Tyre Temps Mini Bar */}
                                    <div className="mt-2 flex space-x-1 h-1">
                                        {(car.tyre_temp || [0, 0, 0, 0]).map((t: number, i: number) => (
                                            <div key={i} className="flex-1 rounded-full" style={{ backgroundColor: t > 100 ? '#ef4444' : t > 80 ? '#22c55e' : '#3b82f6' }} />
                                        ))}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 'COUNTDOWN':
                return nextEvent ? (
                    <div className="h-full w-full">
                        <EventCountdown
                            eventName={nextEvent.name}
                            targetDate={nextEvent.start_date}
                        />
                    </div>
                ) : null;

            case 'TOURNAMENT':
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
                if (!activeEvent) return null;
                return (
                    <TournamentVersusWrapper eventId={activeEvent.id} track={activeEvent.track_name} />
                );

            default:
                return (
                    <div className="h-full w-full flex items-center justify-center bg-black">
                        <div className="text-center animate-pulse">
                            <img src="/logo.png" className="w-32 opacity-50 mx-auto" alt="Logo" />
                        </div>
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

            {/* TV Footer / Overlay */}
            <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black to-transparent z-20 flex items-center justify-between px-8 pb-4">
                <div className="flex items-center space-x-4">
                    <img src="/logo.png" className="h-8 w-auto opacity-70" alt="Logo" />
                    <span className="text-white/50 text-sm font-bold uppercase tracking-widest">Modo Kiosco • Assetto Manager</span>
                </div>
                <div className="flex space-x-2">
                    {availableViews.map((v, _) => (
                        <div
                            key={v}
                            className={`h-1.5 rounded-full transition-all duration-500 ${v === activeView ? 'w-8 bg-yellow-500' : 'w-2 bg-gray-700'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
