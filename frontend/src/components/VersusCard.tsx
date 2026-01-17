import { useQuery } from '@tanstack/react-query';
import { compareDrivers } from '../api/telemetry';
import { Swords } from 'lucide-react';
import { cn } from '../lib/utils';
import { motion } from 'framer-motion';

interface Props {
    drivers: string[];
    track: string;
}

export function VersusCard({ drivers, track }: Props) {
    const { data, isLoading } = useQuery({
        queryKey: ['versus', drivers, track],
        queryFn: async () => {
            if (drivers.length < 2) return null;
            return await compareDrivers({ drivers, track });
        },
        refetchInterval: 10000
    });

    if (isLoading) return <div className="text-center text-4xl text-white animate-pulse font-black italic mt-40">ANALIZANDO RIVALES...</div>;
    if (!data || !data.drivers) return <div className="text-center text-red-500 mt-20 text-2xl">Datos insuficientes para el duelo</div>;

    const stats = data.drivers;
    // Ascending sort (Fastest first)
    const sortedByTime = [...stats].sort((a, b) => a.best_lap - b.best_lap);
    const bestTime = sortedByTime[0].best_lap;

    // Determine grid columns based on driver count (Max 4)
    const gridCols = drivers.length === 2 ? 'grid-cols-2' :
        drivers.length === 3 ? 'grid-cols-3' : 'grid-cols-4';

    const getColumnColor = (index: number) => {
        const colors = [
            'from-blue-600/20 to-blue-900/10 border-blue-500/30',
            'from-red-600/20 to-red-900/10 border-red-500/30',
            'from-green-600/20 to-green-900/10 border-green-500/30',
            'from-yellow-600/20 to-yellow-900/10 border-yellow-500/30'
        ];
        return colors[index % colors.length];
    };

    const getAvatarColor = (index: number) => {
        const colors = ['bg-blue-600', 'bg-red-600', 'bg-green-600', 'bg-yellow-600'];
        return colors[index % colors.length];
    }

    return (
        <div className="h-full w-full bg-gray-950 text-white flex flex-col p-4 md:p-8 overflow-hidden relative">
            {/* Background Texture */}
            <div className="absolute inset-0 opacity-10 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]"></div>

            <header className="text-center mb-8 relative z-10 shrink-0">
                <div className="inline-flex items-center justify-center p-3 bg-red-600/20 rounded-full mb-2 animate-pulse border border-red-500/50">
                    <Swords className="w-12 h-12 text-red-500" />
                </div>
                <h1 className="text-5xl md:text-7xl font-black uppercase italic tracking-tighter text-transparent bg-clip-text bg-gradient-to-b from-white to-gray-400">
                    Duelo en la Cima
                </h1>
                <p className="text-2xl text-gray-400 mt-2 font-mono tracking-widest uppercase">{track}</p>
            </header>

            <div className={cn("flex-1 grid gap-4 md:gap-8 relative z-10", gridCols)}>
                {stats.map((driver: { driver_name: string; best_lap: number; consistency?: number; total_laps?: number; win_count?: number }, idx: number) => {
                    // Check if this driver is P1
                    const isP1 = driver.best_lap === bestTime;
                    const gap = driver.best_lap - bestTime;
                    const rank = sortedByTime.findIndex((d: { driver_name: string }) => d.driver_name === driver.driver_name) + 1;

                    return (
                        <motion.div
                            key={driver.driver_name}
                            initial={{ opacity: 0, y: 50 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.2 }}
                            className={cn(
                                "flex flex-col relative rounded-3xl border-2 overflow-hidden bg-gradient-to-b shadow-2xl backdrop-blur-sm",
                                getColumnColor(idx),
                                isP1 ? "border-yellow-500 shadow-[0_0_30px_rgba(234,179,8,0.3)] scale-[1.02] z-20" : "border-gray-800"
                            )}
                        >
                            {/* Rank Badge */}
                            <div className={cn(
                                "absolute top-4 right-4 text-4xl font-black italic opacity-50 z-0",
                                isP1 ? "text-yellow-500" : "text-gray-600"
                            )}>
                                P{rank}
                            </div>

                            {/* Driver Header */}
                            <div className="p-6 text-center flex flex-col items-center border-b border-white/5 bg-black/20">
                                <div className={cn(
                                    "w-32 h-32 md:w-40 md:h-40 rounded-full mb-4 flex items-center justify-center border-4 shadow-lg text-6xl font-bold",
                                    getAvatarColor(idx),
                                    isP1 ? "border-yellow-400" : "border-white/20"
                                )}>
                                    {driver.driver_name.charAt(0)}
                                </div>
                                <h2 className="text-2xl md:text-4xl font-black uppercase italic tracking-tight line-clamp-1">
                                    {driver.driver_name}
                                </h2>
                            </div>

                            {/* Stats */}
                            <div className="flex-1 p-6 flex flex-col justify-center space-y-6">
                                {/* Best Lap */}
                                <div>
                                    <p className="text-xs uppercase tracking-widest text-gray-500 font-bold mb-1">Mejor Vuelta</p>
                                    <p className={cn(
                                        "text-4xl md:text-5xl font-mono font-bold tracking-tighter",
                                        isP1 ? "text-yellow-400" : "text-white"
                                    )}>
                                        {new Date(driver.best_lap).toISOString().substr(14, 9)}
                                    </p>
                                    {/* GAP */}
                                    {!isP1 && (
                                        <div className="inline-block bg-red-500/20 px-2 py-0.5 rounded text-red-400 font-mono font-bold text-lg mt-1">
                                            +{new Date(gap).toISOString().substr(17, 6)}
                                        </div>
                                    )}
                                </div>

                                {/* Consistency */}
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Consistencia</p>
                                        <p className="text-2xl font-bold text-gray-300">
                                            {driver.consistency}ms
                                        </p>
                                    </div>
                                    <div className="bg-black/30 p-3 rounded-xl border border-white/5">
                                        <p className="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Vueltas</p>
                                        <p className="text-2xl font-bold text-gray-300">
                                            {driver.total_laps}
                                        </p>
                                    </div>
                                </div>
                            </div>

                            {/* Win Counters (Optional, from API) */}
                            {driver.win_count > 0 && (
                                <div className="bg-white/5 p-2 flex justify-center space-x-1">
                                    {[...Array(driver.win_count)].map((_, i) => (
                                        <div key={i} className="w-2 h-2 rounded-full bg-yellow-500" />
                                    ))}
                                </div>
                            )}

                        </motion.div>
                    );
                })}
            </div>
        </div>
    );
}
