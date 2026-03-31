import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { ChevronRight, Trophy } from 'lucide-react';
import { soundManager } from '../../utils/sound';
import { API_URL } from '../../config';
import type { KioskSelection, TranslationFunction, LeaderboardEntry, Driver } from './types';

interface DriverStepProps {
    t: TranslationFunction;
    driverName: string;
    setDriverName: (name: string) => void;
    driverEmail: string;
    setDriverEmail: (email: string) => void;
    onLogin: (driver: Driver) => void;
    selection: KioskSelection | null;
    leaderboardData: LeaderboardEntry[];
}

export const DriverStep: React.FC<DriverStepProps> = ({
    t, driverName, setDriverName, driverEmail, setDriverEmail, onLogin, leaderboardData
}) => {
    const { data: filteredDrivers = [] } = useQuery({
        queryKey: ['drivers-kiosk', driverName],
        queryFn: async () => {
            if (!driverName || driverName.length < 1) return [];
            const res = await axios.get(`${API_URL}/drivers/list-for-kiosk`, {
                params: { search: driverName, limit: 10 }
            });
            return res.data;
        },
        enabled: driverName.length > 0,
    });

    const handleSelectDriver = (driver: { name: string }) => {
        soundManager.playClick();
        setDriverName(driver.name);
    };

    const formatTime = (ms: number) => {
        const minutes = Math.floor(ms / 60000);
        const seconds = ((ms % 60000) / 1000).toFixed(3);
        return `${minutes}:${seconds.padStart(6, '0')}`;
    };

    const topTimes = (leaderboardData || []).map((entry: LeaderboardEntry, idx: number) => ({
        pos: idx + 1,
        name: entry.driver_name || 'Unknown',
        time: formatTime(entry.best_time || 0),
        car: entry.car_model || 'Unknown Car'
    })).slice(0, 8);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        soundManager.playConfirm();
        onLogin({ id: 1, name: (driverName || "Guest Driver").trim() });
    };

    const handleLeaderboardClick = (name: string) => {
        setDriverName(name);
    };

    return (
        <div className="h-full min-h-0 flex items-center justify-center animate-in fade-in slide-in-from-bottom-4 duration-500 px-2 md:px-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full max-w-6xl h-full min-h-0 text-left">
                <div className="flex flex-col justify-center min-h-0">
                    <h1 className="text-3xl md:text-5xl font-racing uppercase tracking-[0.16em] md:tracking-[0.2em] text-amber-200 mb-2">{t('kiosk.welcomeDriver')}</h1>
                    <p className="text-sm md:text-lg text-slate-300 mb-4 md:mb-6">{t('kiosk.identifyToSave')}</p>
                    <form onSubmit={handleSubmit} className="w-full max-w-xl space-y-4">
                        <div className="space-y-1.5 relative">
                            <label className="text-slate-400 font-bold ml-1">{t('kiosk.driverName')}</label>
                            <input
                                type="text"
                                className="w-full bg-slate-950/70 border border-white/10 focus:border-amber-400/60 rounded-2xl px-4 py-3 text-lg md:text-2xl text-white font-bold outline-none transition-all focus:scale-[1.01] placeholder:text-slate-600"
                                placeholder="Ej. Max Verstappen"
                                value={driverName}
                                onChange={e => setDriverName(e.target.value)}
                                required
                                autoComplete="off"
                            />
                            {driverName.length > 0 && filteredDrivers.length > 0 && (
                                <div className="absolute z-50 w-full max-w-xl mt-1 bg-slate-900 border border-white/10 rounded-xl shadow-xl max-h-60 overflow-y-auto">
                                    {filteredDrivers.map((driver: Driver) => (
                                        <button
                                            key={driver.id}
                                            type="button"
                                            onClick={() => handleSelectDriver(driver)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-800 flex items-center justify-between border-b border-white/5 last:border-0"
                                        >
                                            <span className="text-white font-bold">{driver.name}</span>
                                            <span className="text-amber-400 text-sm font-mono">
                                                {driver.best_time ? `${Math.floor(driver.best_time / 60000)}:${((driver.best_time % 60000) / 1000).toFixed(3).padStart(6, '0')}` : '-'}
                                            </span>
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                        <div className="space-y-1.5">
                            <label className="text-slate-400 font-bold ml-1">{t('kiosk.emailOptional')}</label>
                            <input
                                type="email"
                                className="w-full bg-slate-950/70 border border-white/10 focus:border-amber-400/60 rounded-2xl px-4 py-3 text-lg md:text-2xl text-white font-bold outline-none transition-all focus:scale-[1.01] placeholder:text-slate-600"
                                placeholder="max@redbull.com"
                                value={driverEmail}
                                onChange={e => setDriverEmail(e.target.value)}
                            />
                        </div>
                        <button
                            type="submit"
                            onMouseEnter={() => soundManager.playHover()}
                            className="w-full bg-amber-400 hover:bg-amber-300 text-black font-black text-lg md:text-2xl py-4 md:py-5 rounded-2xl shadow-xl shadow-amber-500/30 active:scale-95 hover:scale-[1.01] transition-all flex items-center justify-center gap-3"
                        >
                            {t('kiosk.start')} <ChevronRight size={24} />
                        </button>
                    </form>
                </div>
                <div className="bg-slate-950/60 rounded-3xl border border-white/10 p-4 md:p-5 backdrop-blur-sm animate-in slide-in-from-right-8 duration-700 min-h-0 overflow-hidden">
                    <h3 className="text-base md:text-xl font-bold text-white mb-3 flex items-center gap-2 uppercase tracking-widest">
                        <Trophy className="text-amber-300" /> {t('kiosk.topTimes')}
                    </h3>
                    <div className="space-y-2 text-left">
                        {topTimes.length === 0 && (
                            <div className="rounded-xl border border-white/10 bg-slate-900/40 p-3 text-sm text-slate-400">
                                Aun no hay tiempos registrados para esta combinacion.
                            </div>
                        )}
                        {topTimes.map((entry, idx) => (
                            <div 
                                key={entry.pos} 
                                onClick={() => handleLeaderboardClick(entry.name)}
                                className={`flex items-center gap-3 p-2.5 rounded-xl transition-all cursor-pointer hover:scale-[1.02] hover:border-amber-400/50 ${idx === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50 border border-transparent hover:border-amber-400/30'}`}
                            >
                                <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${idx === 0 ? 'bg-yellow-500 text-black' : idx === 1 ? 'bg-gray-400 text-black' : idx === 2 ? 'bg-orange-700 text-white' : 'bg-gray-700 text-gray-300'}`}>
                                    {entry.pos}
                                </div>
                                <div className="flex-1">
                                    <p className="font-bold text-white text-sm truncate">{entry.name}</p>
                                    <p className="text-xs text-gray-500">{entry.car}</p>
                                </div>
                                <div className={`font-mono font-bold text-sm md:text-base ${idx === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                    {entry.time}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};
