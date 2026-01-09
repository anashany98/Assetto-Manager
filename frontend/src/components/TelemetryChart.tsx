import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';
import { Loader2 } from 'lucide-react';
import { API_URL } from '../api/stations';

interface TelemetryPoint {
    t: number; // Time in ms
    s: number; // Speed in KM/H
    r: number; // RPM
    g: number; // Gear
    n: number; // Normalized Pos
}

interface TelemetryChartProps {
    lapId: number;
    compareLapId?: number; // Optional compare
    onClose?: () => void;
}

export function TelemetryChart({ lapId, compareLapId }: TelemetryChartProps) {

    // Fetch Main Lap Telemetry
    const { data: mainLap, isLoading: loadingMain } = useQuery({
        queryKey: ['telemetry', lapId],
        queryFn: async () => {
            const res = await axios.get<TelemetryPoint[]>(`${API_URL}/telemetry/lap/${lapId}/telemetry`);
            return res.data;
        },
        enabled: !!lapId
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
            compareSpeed: compareLap ? (compareLap[i]?.s || null) : null
        };
    }).filter((_, i) => i % 2 === 0); // Quick 50% downsample

    return (
        <div className="w-full h-64 bg-gray-900/50 rounded-xl p-2 border border-white/5">
            <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                    <XAxis dataKey="dist" hide />
                    <YAxis
                        stroke="#9CA3AF"
                        fontSize={10}
                        domain={[0, 'auto']}
                        tickFormatter={(val) => `${val}`}
                    />
                    <Tooltip
                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                        itemStyle={{ color: '#F3F4F6' }}
                        labelStyle={{ display: 'none' }}
                    />
                    <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                    {/* Main Lap Speed */}
                    <Line
                        type="monotone"
                        dataKey="speed"
                        stroke="#EAB308"
                        strokeWidth={2}
                        dot={false}
                        name="Velocidad (Tú)"
                        animationDuration={500}
                    />

                    {/* Compare Lap Speed */}
                    {compareLap && (
                        <Line
                            type="monotone"
                            dataKey="compareSpeed"
                            stroke="#3B82F6"
                            strokeWidth={2}
                            dot={false}
                            strokeDasharray="5 5"
                            name="Comparativa"
                            animationDuration={500}
                        />
                    )}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
