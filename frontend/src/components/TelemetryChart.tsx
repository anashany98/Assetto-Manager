import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../config';

interface TelemetryPoint {
    t: number; // Time in ms
    s: number; // Speed in KM/H
    r: number; // RPM
    g: number; // Gear
    n: number; // Normalized Pos
    gas?: number; // Throttle 0-1
    brk?: number; // Brake 0-1
    str?: number; // Steer -1 to 1
    gl?: number; // G-Lat
    gn?: number; // G-Long
    tt?: number; // Tyre Temp
}

interface TelemetryChartProps {
    lapId: number;
    compareLapId?: number; // Optional compare
    onClose?: () => void;
}

type ChartTab = 'engine' | 'inputs' | 'physics';

export function TelemetryChart({ lapId, compareLapId }: TelemetryChartProps) {
    const [activeTab, setActiveTab] = React.useState<ChartTab>('engine');

    // Fetch Main Lap Telemetry
    const { data: mainLap, isLoading: loadingMain } = useQuery({
        queryKey: ['telemetry', lapId],
        queryFn: async () => {
            console.log(`Fetching telemetry for lap ${lapId}...`);
            try {
                const res = await axios.get<TelemetryPoint[]>(`${API_URL}/telemetry/lap/${lapId}/telemetry`);
                return res.data;
            } catch (err: any) {
                console.error(`Error fetching telemetry for lap ${lapId}:`, err.response?.status, err.response?.data);
                throw err;
            }
        },
        enabled: !!lapId,
        retry: false
    });

    // Fetch Compare Lap Telemetry (if selected)
    const { data: compareLap, isLoading: loadingCompare } = useQuery({
        queryKey: ['telemetry', compareLapId],
        queryFn: async () => {
            if (!compareLapId) return null;
            const res = await axios.get<TelemetryPoint[]>(`${API_URL}/telemetry/lap/${compareLapId}/telemetry`);
            return res.data;
        },
        enabled: !!compareLapId
    });

    if (loadingMain || loadingCompare) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                <Loader2 className="animate-spin mb-2" />
                <span className="text-xs uppercase font-bold tracking-widest">Cargando Telemetría...</span>
            </div>
        );
    }

    if (!mainLap || mainLap.length === 0) {
        return (
            <div className="h-64 flex flex-col items-center justify-center text-gray-500">
                <p className="text-xs uppercase font-bold tracking-widest">Sin datos de telemetría disponibles</p>
                <p className="text-[10px] mt-2">La telemetría solo está disponible para vueltas recientes.</p>
            </div>
        );
    }

    // Align Data for Chart?
    // If we compare, we need to map by "normalized pos" (n) or just overlay based on index/time.
    // Index alignment is simplest for V1.
    // Or Normalized Pos (0-1) is BEST for comparing different speeds.

    // Let's assume we use Index (Time usually) for single view.
    // For comparison, let's normalize to X-Axis (0 to 100%).

    const chartData = mainLap.map((p, i) => {
        // Downsample for performance (every 5th point if > 1000 points)
        // If array contains ~2500 points (4 mins at 10hz), recharts might lag on mobile.
        // Let's filter in render if needed.
        return {
            dist: i, // Should utilize normalized 'n' if reliable
            speed: p.s,
            rpm: p.r,
            gear: p.g,
            gas: p.gas || 0,
            brk: p.brk || 0,
            str: p.str || 0,
            gl: p.gl || 0,
            gn: p.gn || 0,
            tt: p.tt || 0,
            compareSpeed: compareLap ? (compareLap[i]?.s || null) : null
        };
    }).filter((_, i) => i % 2 === 0); // Quick 50% downsample

    return (
        <div className="w-full flex flex-col h-80">
            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-900 p-1 rounded-t-xl mb-1">
                <button
                    onClick={() => setActiveTab('engine')}
                    className={`flex-1 py-1 text-[10px] uppercase font-bold rounded ${activeTab === 'engine' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Motor
                </button>
                <button
                    onClick={() => setActiveTab('inputs')}
                    className={`flex-1 py-1 text-[10px] uppercase font-bold rounded ${activeTab === 'inputs' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Pedales
                </button>
                <button
                    onClick={() => setActiveTab('physics')}
                    className={`flex-1 py-1 text-[10px] uppercase font-bold rounded ${activeTab === 'physics' ? 'bg-gray-700 text-white' : 'text-gray-500 hover:text-gray-300'}`}
                >
                    Físicas
                </button>
            </div>

            <div className="flex-1 bg-gray-900/50 rounded-b-xl p-2 border border-white/5 relative">
                {activeTab === 'engine' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" hide />
                            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={10} domain={[0, 'auto']} tickFormatter={(val) => `${val}`} />
                            <YAxis yAxisId="right" orientation="right" stroke="#6B7280" fontSize={10} domain={[0, 9000]} hide />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                                itemStyle={{ color: '#F3F4F6' }}
                                labelStyle={{ display: 'none' }}
                                formatter={(value: any, name: any) => {
                                    if (name === 'Velocidad' || name === 'Comparativa') return [`${Math.round(Number(value))} km/h`, name];
                                    if (name === 'RPM') return [Math.round(Number(value)), name];
                                    return [value, name];
                                }}
                            />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#EAB308" strokeWidth={2} dot={false} name="Velocidad" animationDuration={500} />
                            <Line yAxisId="right" type="monotone" dataKey="rpm" stroke="#ef4444" strokeWidth={1} dot={false} strokeOpacity={0.5} name="RPM" animationDuration={500} />
                            {compareLap && <Line yAxisId="left" type="monotone" dataKey="compareSpeed" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Comparativa" animationDuration={500} />}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {activeTab === 'inputs' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" hide />
                            <YAxis stroke="#9CA3AF" fontSize={10} domain={[0, 1]} tickFormatter={(val) => `${val * 100}%`} />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#F3F4F6' }} labelStyle={{ display: 'none' }} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            <Line type="monotone" dataKey="gas" stroke="#22c55e" strokeWidth={2} dot={false} name="Acelerador" animationDuration={500} />
                            <Line type="monotone" dataKey="brk" stroke="#ef4444" strokeWidth={2} dot={false} name="Freno" animationDuration={500} />
                            <Line type="monotone" dataKey="str" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Volante" animationDuration={500} />
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {activeTab === 'physics' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" hide />
                            <YAxis yAxisId="g" stroke="#9CA3AF" fontSize={10} domain={[-3, 3]} label={{ value: 'G-Force', angle: -90, position: 'insideLeft', fill: '#6B7280', fontSize: 10 }} />
                            <YAxis yAxisId="temp" orientation="right" stroke="#f97316" fontSize={10} domain={[20, 150]} hide />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#F3F4F6' }} labelStyle={{ display: 'none' }} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            <Line yAxisId="g" type="monotone" dataKey="gl" stroke="#f472b6" strokeWidth={2} dot={false} name="G-Lateral" animationDuration={500} />
                            <Line yAxisId="g" type="monotone" dataKey="gn" stroke="#a78bfa" strokeWidth={2} dot={false} name="G-Long" animationDuration={500} />
                            <Line yAxisId="temp" type="monotone" dataKey="tt" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="2 2" name="Temp. Goma" animationDuration={500} />
                        </LineChart>
                    </ResponsiveContainer>
                )}
            </div>
        </div>
    );
}
