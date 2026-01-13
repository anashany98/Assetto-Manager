import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Gauge, Activity, Zap } from 'lucide-react';
import { Loader2 } from 'lucide-react';

interface TelemetryPoint {
    t: number;
    s: number; // Speed
    r: number; // RPM
    g: number; // Gear
    n: number; // Normalized Pos
}

interface SimpleTelemetryProps {
    lapId: number;
}

export const SimpleTelemetry = ({ lapId }: SimpleTelemetryProps) => {
    const { data: telemetry, isLoading, error } = useQuery({
        queryKey: ['telemetry', lapId],
        queryFn: async () => {
            const res = await axios.get<TelemetryPoint[]>(`${API_URL}/telemetry/lap/${lapId}/telemetry`);
            return res.data;
        },
        enabled: !!lapId,
        retry: false
    });

    const metrics = useMemo(() => {
        if (!telemetry || telemetry.length === 0) return null;

        const maxSpeed = Math.max(...telemetry.map(p => p.s));
        const avgSpeed = telemetry.reduce((acc, p) => acc + p.s, 0) / telemetry.length;

        // Simple "Aggressiveness" metric based on high RPM usage
        // Let's assume redline is ~7500 for generic cars, counting points above 6000
        const aggressivePoints = telemetry.filter(p => p.r > 6000).length;
        const aggressiveness = Math.min(100, Math.round((aggressivePoints / telemetry.length) * 100 * 1.5)); // 1.5x multiplier for pop

        return {
            topSpeed: Math.round(maxSpeed),
            avgSpeed: Math.round(avgSpeed),
            aggressiveness
        };
    }, [telemetry]);

    if (isLoading) return (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
            <Loader2 className="animate-spin mb-2" />
            <span className="text-xs uppercase font-bold tracking-widest">Calculando Métricas...</span>
        </div>
    );

    if (error || !metrics) return (
        <div className="h-64 flex flex-col items-center justify-center text-gray-500">
            <p className="text-xs uppercase font-bold tracking-widest">Sin datos disponibles</p>
        </div>
    );

    return (
        <div className="grid grid-cols-2 gap-4 p-2">
            {/* Top Speed */}
            <div className="bg-gray-900/50 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-yellow-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Gauge className="text-yellow-500 mb-2" size={24} />
                <div className="text-3xl font-black text-white italic tracking-tighter">
                    {metrics.topSpeed}
                    <span className="text-xs text-gray-400 font-normal ml-1 not-italic">Km/h</span>
                </div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">Velocidad Punta</div>
            </div>

            {/* Avg Speed */}
            <div className="bg-gray-900/50 p-4 rounded-xl border border-white/5 flex flex-col items-center justify-center relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-br from-blue-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <Activity className="text-blue-500 mb-2" size={24} />
                <div className="text-3xl font-black text-white italic tracking-tighter">
                    {metrics.avgSpeed}
                    <span className="text-xs text-gray-400 font-normal ml-1 not-italic">Km/h</span>
                </div>
                <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest mt-1">Velocidad Media</div>
            </div>

            {/* Aggressiveness / Style */}
            <div className="col-span-2 bg-gray-900/50 p-4 rounded-xl border border-white/5 flex items-center justify-between relative overflow-hidden group">
                <div className="absolute inset-0 bg-gradient-to-r from-red-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

                <div className="flex items-center space-x-3 z-10">
                    <div className="w-10 h-10 rounded-full bg-gray-800 flex items-center justify-center text-red-500">
                        <Zap size={20} />
                    </div>
                    <div>
                        <div className="text-2xl font-black text-white italic tracking-tighter leading-none">
                            {metrics.aggressiveness}%
                        </div>
                        <div className="text-[10px] uppercase font-bold text-gray-500 tracking-widest">Agresividad</div>
                    </div>
                </div>

                {/* Visual Bar */}
                <div className="flex space-x-1 h-8 items-end">
                    {[...Array(10)].map((_, i) => (
                        <div
                            key={i}
                            className={`w-1.5 rounded-sm transition-all duration-500 ${i < (metrics.aggressiveness / 10)
                                ? 'bg-gradient-to-t from-red-900 to-red-500'
                                : 'bg-gray-800'
                                }`}
                            style={{ height: `${20 + (i * 8)}%` }}
                        />
                    ))}
                </div>
            </div>
        </div>
    );
};
