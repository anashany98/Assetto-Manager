import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { motion, AnimatePresence } from 'framer-motion';
import { Trophy, Medal, Calendar, Clock, AlertTriangle } from 'lucide-react';
import { API_URL } from '../config';

// Reuse types or define locally for independence
interface HallOfFameEntry {
    driver_name: string;
    lap_time: number;
    date: string;
}

interface HallOfFameCategory {
    track_name: string;
    car_model: string; // Used as Category Name here (e.g. "GT3")
    records: HallOfFameEntry[];
}

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

// Helper to get category colors
const getCategoryColor = (cat: string) => {
    const c = cat.toLowerCase();
    if (c.includes('f1') || c.includes('formula')) return 'from-red-600 to-red-900 border-red-500';
    if (c.includes('gt3')) return 'from-pink-600 to-purple-900 border-pink-500';
    if (c.includes('gt4')) return 'from-blue-600 to-indigo-900 border-blue-500';
    if (c.includes('rally') || c.includes('wrc')) return 'from-yellow-600 to-orange-900 border-yellow-500';
    if (c.includes('drift')) return 'from-purple-600 to-violet-900 border-purple-500';
    if (c.includes('kart')) return 'from-green-600 to-emerald-900 border-green-500';
    return 'from-gray-700 to-gray-900 border-gray-500';
};

export const TVHallOfFame = () => {
    const [currentIndex, setCurrentIndex] = useState(0);

    const { data: slides, isLoading, error } = useQuery({
        queryKey: ['hallOfFameTV'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/hall_of_fame/categories`);
            // Flatten or just return list. The API returns List[HallOfFameCategory]
            // Each item corresponds to one "Slide" (Track + Category)
            return res.data as HallOfFameCategory[];
        },
        refetchInterval: 60000 // Refresh data every minute
    });

    // Auto-Rotate Logic
    useEffect(() => {
        if (!slides || slides.length === 0) return;

        const interval = setInterval(() => {
            setCurrentIndex((prev) => (prev + 1) % slides.length);
        }, 15000); // 15 seconds per slide

        return () => clearInterval(interval);
    }, [slides]);

    if (isLoading) return (
        <div className="min-h-screen bg-black text-white flex items-center justify-center">
            <div className="w-16 h-16 border-4 border-yellow-500 border-t-transparent rounded-full animate-spin"></div>
        </div>
    );

    if (error || !slides) return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">
            <AlertTriangle className="text-red-500 w-24 h-24 mb-4" />
            <h1 className="text-4xl font-bold uppercase">Sin conexión</h1>
            <p className="text-gray-500 mt-2">No se pudo cargar el Salón de la Fama.</p>
        </div>
    );

    if (slides.length === 0) return (
        <div className="min-h-screen bg-black text-white flex flex-col items-center justify-center p-10">
            <Trophy className="text-gray-700 w-32 h-32 mb-4" />
            <h1 className="text-4xl font-bold uppercase text-gray-500">Sin Récords</h1>
            <p className="text-gray-600 mt-2">¡Sé el primero en marcar un tiempo!</p>
        </div>
    );

    const currentSlide = slides[currentIndex];
    const categoryColorClass = getCategoryColor(currentSlide.car_model);

    return (
        <div className="fixed inset-0 bg-black text-white overflow-hidden font-sans cursor-none select-none">
            {/* Background Layer - Dynamic / Blurred */}
            <div className="absolute inset-0 z-0">
                <div className={`absolute inset-0 bg-gradient-to-br ${categoryColorClass} opacity-20`} />
                {/* We could add a track map image here if we had it easily accessible */}
                <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-black/20 via-black/80 to-black" />
            </div>

            {/* Content Layer */}
            <div className="relative z-10 w-full h-full flex flex-col p-12 lg:p-16">

                {/* Header */}
                <div className="flex items-end justify-between mb-12 pb-6 border-b border-white/10">
                    <div>
                        <motion.h2
                            initial={{ opacity: 0, y: -20 }}
                            animate={{ opacity: 1, y: 0 }}
                            key={`track-${currentIndex}`}
                            className="text-6xl lg:text-8xl font-black italic tracking-tighter uppercase text-white drop-shadow-2xl"
                        >
                            {currentSlide.track_name.replace(/_/g, ' ')}
                        </motion.h2>
                        <motion.div
                            initial={{ opacity: 0, x: -20 }}
                            animate={{ opacity: 1, x: 0 }}
                            key={`cat-${currentIndex}`}
                            className={`inline-block mt-4 px-6 py-2 rounded-lg bg-gradient-to-r ${categoryColorClass} border border-white/20 shadow-lg`}
                        >
                            <span className="text-2xl lg:text-3xl font-bold uppercase tracking-widest text-white drop-shadow-md">
                                {currentSlide.car_model} CLASS
                            </span>
                        </motion.div>
                    </div>

                    <div className="text-right">
                        <div className="flex items-center justify-end space-x-3 text-yellow-500 mb-2">
                            <Trophy size={48} className="animate-pulse" />
                        </div>
                        <p className="text-gray-500 font-mono text-xl uppercase tracking-widest">Hall of Fame</p>
                    </div>
                </div>

                {/* Leaderboard List */}
                <div className="flex-1 flex flex-col justify-center space-y-4 max-w-5xl mx-auto w-full">
                    <AnimatePresence mode='wait'>
                        <motion.div
                            key={`list-${currentIndex}`}
                            initial={{ opacity: 0, x: 50 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{ opacity: 0, x: -50 }}
                            transition={{ duration: 0.5, staggerChildren: 0.1 }}
                            className="space-y-4"
                        >
                            {currentSlide.records.map((record, idx) => (
                                <motion.div
                                    key={`${record.driver_name}-${idx}`}
                                    initial={{ opacity: 0, y: 20 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: idx * 0.1 }}
                                    className={`relative flex items-center p-6 rounded-2xl border ${idx === 0 ? 'bg-gradient-to-r from-yellow-500/20 to-yellow-900/10 border-yellow-500/50 scale-105 shadow-[0_0_30px_rgba(234,179,8,0.2)]' : 'bg-gray-900/40 border-white/5'}`}
                                >
                                    {/* Rank */}
                                    <div className="w-24 flex-shrink-0 text-center font-black italic text-4xl lg:text-5xl text-gray-700">
                                        {idx === 0 ? <span className="text-yellow-400 drop-shadow-lg">1</span> :
                                            idx === 1 ? <span className="text-gray-300">2</span> :
                                                idx === 2 ? <span className="text-orange-400">3</span> : idx + 1}
                                    </div>

                                    {/* Avatar (Generated) */}
                                    <img
                                        src={`https://api.dicebear.com/7.x/bottts-neutral/svg?seed=${encodeURIComponent(record.driver_name)}`}
                                        className="w-16 h-16 rounded-xl bg-gray-800 border-2 border-white/10 mr-6"
                                        alt="Avatar"
                                    />

                                    {/* Name & Date */}
                                    <div className="flex-1">
                                        <h3 className={`text-3xl lg:text-4xl font-bold uppercase tracking-tight ${idx === 0 ? 'text-white' : 'text-gray-300'}`}>
                                            {record.driver_name}
                                        </h3>
                                        <div className="flex items-center space-x-4 mt-1 opacity-60 text-sm font-medium uppercase tracking-wider">
                                            <span className="flex items-center"><Calendar size={14} className="mr-1" /> {formatDate(record.date)}</span>
                                            {idx === 0 && <span className="text-yellow-500 flex items-center"><Medal size={14} className="mr-1" /> Récord Actual</span>}
                                        </div>
                                    </div>

                                    {/* Time */}
                                    <div className={`text-right font-mono font-bold tracking-tighter text-4xl lg:text-5xl ${idx === 0 ? 'text-yellow-400 drop-shadow-lg' : 'text-gray-400'}`}>
                                        {formatTime(record.lap_time)}
                                    </div>
                                </motion.div>
                            ))}
                        </motion.div>
                    </AnimatePresence>
                </div>

                {/* Footer Progress Bar */}
                <div className="absolute bottom-0 left-0 w-full h-2 bg-gray-900">
                    <motion.div
                        key={currentIndex}
                        initial={{ width: "0%" }}
                        animate={{ width: "100%" }}
                        transition={{ duration: 15, ease: "linear" }}
                        className="h-full bg-yellow-500"
                    />
                </div>
            </div>
        </div>
    );
};

export default TVHallOfFame;
