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
            const res = await axios.get(`http://${window.location.hostname}:8000/settings`); // Use explicit URL to avoid circular dep
            return res.data;
        },
        refetchInterval: 2000
    });

    const tvMode = settings?.find((s: any) => s.key === 'tv_mode')?.value || 'auto';
    const remoteView = settings?.find((s: any) => s.key === 'tv_view')?.value;

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
            // Map remote view string to index or handle special cases
            if (remoteView === 'TOURNAMENT') {
                // Special handling for tournament view?
                // For now, we don't have it in the main list, so we might need to handle it in render
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
                    <div className="h-full w-full relative">
                        <div className="absolute top-8 left-8 z-10 bg-red-600 animate-pulse px-4 py-2 rounded-lg font-black text-white text-2xl uppercase tracking-widest shadow-lg">
                            🔴 En Vivo
                        </div>
                        <LiveMap cars={Object.values(liveCars)} trackName="monza" />
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

                // We need to know WHO to compare. 
                // For now, let's hardcode a reliable wrapper or specialized "TournamentVersus" component
                // But wait, existing logic is clean.
                // Let's instantiate a wrapper here that fetches leaderboard quickly
                return (
                    <TournamentVersusWrapper eventId={activeEvent.id} track={activeEvent.track_name} />
                );

            default:
            // ...
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

            {/* TV Footer / Overlay */}
            <div className="absolute bottom-0 left-0 w-full h-16 bg-gradient-to-t from-black to-transparent z-20 flex items-center justify-between px-8 pb-4">
                <div className="flex items-center space-x-4">
                    <img src="/logo.png" className="h-8 w-auto opacity-70" alt="Logo" />
                    <span className="text-white/50 text-sm font-bold uppercase tracking-widest">Modo Kiosco • Assetto Manager</span>
                </div>
                <div className="flex space-x-2">
                    {availableViews.map((v, i) => (
                        <div
                            key={v}
                            className={`h-1.5 rounded-full transition-all duration-500 ${i === currentViewIndex ? 'w-8 bg-yellow-500' : 'w-2 bg-gray-700'}`}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
