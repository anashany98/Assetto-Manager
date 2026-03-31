import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { Zap, TrendingUp, Activity } from 'lucide-react';
import { API_URL } from '../../config';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid,
    Tooltip, ResponsiveContainer
} from 'recharts';

interface CoachSectionProps {
    lapId?: number;
}

export const CoachSection: React.FC<CoachSectionProps> = ({ lapId }) => {
    const { data: coachAnalysis, isLoading } = useQuery({
        queryKey: ['coach-analysis', lapId],
        queryFn: async () => {
            if (!lapId) return null;
            const res = await axios.get(`${API_URL}/telemetry/coach/${lapId}`);
            return res.data;
        },
        enabled: !!lapId
    });

    if (isLoading) return <div className="bg-gray-800/20 p-8 rounded-3xl border border-gray-700 animate-pulse text-center text-slate-400">Analizando telemetria...</div>;
    if (!coachAnalysis || coachAnalysis.tips.length === 0) return (
        <div className="bg-gray-800/20 p-6 rounded-3xl border border-gray-700 text-center">
            <p className="text-slate-400 italic">No hay suficientes datos para el analisis comparativo todavia.</p>
        </div>
    );

    const telemetryChartData = coachAnalysis.ghost_telemetry.map((g: any, i: number) => {
        const u = coachAnalysis.user_telemetry[i] || {};
        return {
            n: g.n,
            ghost: g.s,
            user: u.s
        };
    });

    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {coachAnalysis.tips.map((tip: any, idx: number) => (
                    <div key={idx} className={`p-4 rounded-2xl border flex gap-4 items-start ${tip.severity === 'high' ? 'bg-red-500/10 border-red-500/30' : 'bg-orange-500/10 border-orange-500/30'}`}>
                        <div className={`p-2 rounded-lg ${tip.severity === 'high' ? 'bg-red-500 text-white' : 'bg-orange-500 text-white'}`}>
                            {tip.type === 'braking' ? <Zap size={20} /> : tip.type === 'apex' ? <TrendingUp size={20} /> : <Zap size={20} />}
                        </div>
                        <div>
                            <h5 className="font-bold text-white uppercase text-xs mb-1 tracking-wider">
                                {tip.type === 'braking' ? 'Punto de frenada' : tip.type === 'apex' ? 'Velocidad en el vertice' : 'Traccion/Salida'}
                            </h5>
                            <p className="text-sm text-gray-300 leading-tight">{tip.message}</p>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-gray-900/50 p-6 rounded-3xl border border-gray-800">
                <div className="flex justify-between items-center mb-4">
                    <h4 className="text-white font-bold flex items-center gap-2">
                        <Activity size={18} className="text-green-400" /> VELOCIDAD VS GHOST ({coachAnalysis.reference_driver_name})
                    </h4>
                    <div className="flex gap-4 text-xs font-bold">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-amber-400 rounded-full"></div> TU</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-green-500 rounded-full"></div> GHOST</div>
                    </div>
                </div>
                <div className="h-48 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={telemetryChartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis dataKey="n" hide />
                            <YAxis hide domain={['auto', 'auto']} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '8px' }}
                                itemStyle={{ fontSize: '12px' }}
                            />
                            <Line type="monotone" dataKey="user" stroke="#3b82f6" strokeWidth={2} dot={false} />
                            <Line type="monotone" dataKey="ghost" stroke="#22c55e" strokeWidth={2} dot={false} strokeDasharray="5 5" />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>
        </div>
    );
};
