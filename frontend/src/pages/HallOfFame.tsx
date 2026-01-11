
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Trophy, Medal, Calendar } from 'lucide-react';
import { motion } from 'framer-motion';

// API URL Logic (Shared)
const API_URL = window.location.hostname === 'localhost'
    ? `http://${window.location.hostname}:8000`
    : window.location.origin.includes('loca.lt')
        ? 'https://khaki-donkeys-share.loca.lt' // Backend Tunnel
        : `http://${window.location.hostname}:8000`;

interface HallOfFameEntry {
    driver_name: string;
    lap_time: number;
    date: string;
}

interface HallOfFameCategory {
    track_name: string;
    car_model: string;
    records: HallOfFameEntry[];
}

const formatTime = (ms: number) => {
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = ms % 1000;
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
};

const formatDate = (iso: string) => new Date(iso).toLocaleDateString();

export const HallOfFame = ({ embedded = false }: { embedded?: boolean }) => {
    const { data: categories, isLoading } = useQuery({
        queryKey: ['hallOfFame'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/hall_of_fame`);
            return res.data as HallOfFameCategory[];
        },
        refetchInterval: 60000 // Refresh every minute
    });

    if (isLoading) return <div className="p-10 text-center text-white">Cargando Leyendas...</div>;

    const getMedalColor = (index: number) => {
        switch (index) {
            case 0: return "text-yellow-400 drop-shadow-[0_0_10px_rgba(250,204,21,0.5)]"; // Gold
            case 1: return "text-gray-300 drop-shadow-[0_0_5px_rgba(209,213,219,0.3)]";   // Silver
            case 2: return "text-orange-400 drop-shadow-[0_0_5px_rgba(251,146,60,0.3)]";  // Bronze
            default: return "text-gray-600";
        }
    };

    return (
        <div className={`${embedded ? 'h-full overflow-y-auto pb-24' : 'min-h-screen bg-[#0a0a0f] p-4 pb-20 md:p-8 overflow-y-auto'} text-white`}>

            {/* Header - Only show full header if NOT embedded */}
            {!embedded && (
                <div className="text-center mb-12 relative">
                    <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full h-32 bg-yellow-500/10 blur-[100px] rounded-full pointer-events-none" />
                    <h1 className="text-5xl md:text-7xl font-black italic tracking-tighter uppercase mb-2 bg-gradient-to-br from-white via-gray-200 to-gray-500 text-transparent bg-clip-text">
                        Salón de la Fama
                    </h1>
                    <p className="text-yellow-500 font-bold tracking-[0.5em] text-sm md:text-base uppercase">SimRacing Bar Hall of Legends</p>
                </div>
            )}

            {/* Embedded Header */}
            {embedded && (
                <div className="px-6 py-8">
                    <h2 className="text-3xl font-black italic tracking-tighter uppercase text-white mb-2">
                        Salón de la Fama
                    </h2>
                    <p className="text-gray-400 text-xs font-bold uppercase tracking-wider">Los Reyes de la Pista</p>
                </div>
            )}

            {/* Grid */}
            <div className={`grid grid-cols-1 ${embedded ? '' : 'md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4'} gap-6 ${embedded ? 'px-4' : 'max-w-7xl mx-auto'}`}>
                {categories?.map((cat, idx) => (
                    <motion.div
                        key={`${cat.track_name}-${cat.car_model}`}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: idx * 0.1 }}
                        className="bg-gray-900/60 backdrop-blur-sm border border-white/5 rounded-3xl overflow-hidden hover:border-yellow-500/30 transition-all duration-300 group"
                    >
                        {/* Card Header */}
                        <div className="p-5 border-b border-white/5 bg-gradient-to-r from-gray-800/50 to-transparent relative overflow-hidden">
                            <div className="absolute top-0 right-0 p-3 opacity-10 transform translate-x-1/3 -translate-y-1/3 group-hover:scale-110 transition-transform duration-500">
                                <Trophy size={120} />
                            </div>
                            <div className="relative z-10">
                                <h2 className="text-xl font-black uppercase italic tracking-tight text-white mb-1">
                                    {cat.track_name.replace(/_/g, ' ')}
                                </h2>
                                <span className="px-2 py-0.5 bg-yellow-500/10 text-yellow-500 rounded text-[10px] font-bold uppercase tracking-wider border border-yellow-500/20">
                                    {cat.car_model.replace(/_/g, ' ')}
                                </span>
                            </div>
                        </div>

                        {/* Records List */}
                        <div className="p-2">
                            {cat.records.map((record, rIdx) => (
                                <div key={rIdx} className={`flex items-center p-3 rounded-xl mb-1 ${rIdx === 0 ? 'bg-gradient-to-r from-yellow-500/10 to-transparent border border-yellow-500/10' : ''}`}>
                                    {/* Rank / Medal */}
                                    <div className="w-10 flex-shrink-0 text-center">
                                        {rIdx < 3 ? (
                                            <Medal className={`${getMedalColor(rIdx)} mx-auto`} size={20} fill={rIdx === 0 ? "currentColor" : "none"} />
                                        ) : (
                                            <span className="font-mono text-gray-600 font-bold">{rIdx + 1}</span>
                                        )}
                                    </div>

                                    {/* Driver Info */}
                                    <div className="flex-1 px-3 min-w-0">
                                        <div className={`font-bold truncate ${rIdx === 0 ? 'text-white text-lg' : 'text-gray-300'}`}>
                                            {record.driver_name}
                                        </div>
                                        <div className="flex items-center space-x-2 text-[10px] text-gray-500 uppercase font-medium">
                                            <span className="flex items-center"><Calendar size={10} className="mr-1" /> {formatDate(record.date)}</span>
                                        </div>
                                    </div>

                                    {/* Time */}
                                    <div className="text-right pl-2">
                                        <div className={`font-mono font-bold tracking-tight ${rIdx === 0 ? 'text-yellow-400 text-lg' : 'text-white/70'}`}>
                                            {formatTime(record.lap_time)}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {/* Empty Slots Filler */}
                            {[...Array(3 - cat.records.length)].map((_, i) => (
                                <div key={`empty-${i}`} className="flex items-center p-3 rounded-xl opacity-30">
                                    <div className="w-10 text-center"><div className="w-5 h-5 rounded-full border border-gray-600 mx-auto" /></div>
                                    <div className="flex-1 px-3 text-sm text-gray-600 font-bold uppercase italic">Vacante</div>
                                    <div className="font-mono text-gray-700">--:--.---</div>
                                </div>
                            ))}
                        </div>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};
