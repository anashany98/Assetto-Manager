import React, { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Activity, Gauge, MapPin, Zap } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface LiveSessionMonitorProps {
    stationId: number;
    driverName?: string;
}

export const LiveSessionMonitor: React.FC<LiveSessionMonitorProps> = ({ stationId, driverName }) => {
    // Poll for telemetry every 200ms
    const { data: telemetry } = useQuery({
        queryKey: ['telemetry-live', stationId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/telemetry/live/${stationId}`);
            return res.data;
        },
        refetchInterval: 200,
        retry: false
    });

    // Mock data if no telemetry (or simplify)
    const speed = telemetry?.physics?.speedKmh || 0;
    const gear = telemetry?.physics?.gear || 0;
    const rpm = telemetry?.physics?.rpm || 0;
    const maxRpm = telemetry?.static?.maxRpm || 8000;
    const track = telemetry?.static?.track || 'Desconocido';
    const car = telemetry?.static?.carModel || 'Coche Desconocido';

    // Calculate RPM bar width
    const rpmPercent = Math.min(100, (rpm / maxRpm) * 100);
    const isRedline = rpmPercent > 90;

    return (
        <div className="h-full w-full bg-black/90 flex flex-col items-center justify-between p-8 relative overflow-hidden">
            {/* Background Map Placeholder or Track Map */}
            <div className="absolute inset-0 opacity-20">
                <div className="w-full h-full bg-[url('/bg-kiosk.jpg')] bg-cover bg-center filter grayscale contrast-125" />
            </div>

            {/* Header */}
            <div className="relative z-10 w-full flex justify-between items-start animate-in slide-in-from-top duration-500">
                <div>
                    <div className="flex items-center gap-2 mb-2">
                        <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse" />
                        <h2 className="text-xl text-red-500 font-bold tracking-widest uppercase">EN PISTA - EN VIVO</h2>
                    </div>
                    <h1 className="text-5xl font-black text-white italic tracking-tighter">{driverName || 'PILOTO'}</h1>
                    <p className="text-xl text-gray-400 font-mono mt-1">{car} @ {track}</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold text-white tabular-nums">
                        {Math.floor(speed)} <span className="text-sm text-gray-400">KM/H</span>
                    </div>
                </div>
            </div>

            {/* Central Telemetry HUD */}
            <div className="relative z-10 w-full max-w-4xl flex items-center justify-center gap-12 my-auto">
                {/* Gear */}
                <div className="w-48 h-48 rounded-full border-8 border-gray-800 bg-gray-900 flex items-center justify-center relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                    <span className={`text-9xl font-black italic tracking-tighter ${isRedline ? 'text-red-500 animate-pulse' : 'text-white'}`}>
                        {gear === 0 ? 'N' : gear === -1 ? 'R' : gear}
                    </span>
                    <div className="absolute -bottom-12 text-gray-500 font-bold tracking-widest text-sm">MARCHA</div>
                </div>

                {/* RPM Bar */}
                <div className="flex-1 max-w-xl">
                    <div className="flex justify-between text-xs font-bold text-gray-500 mb-2 uppercase tracking-widest">
                        <span>Idle</span>
                        <span>{maxRpm} RPM</span>
                    </div>
                    <div className="h-12 bg-gray-800 rounded-xl overflow-hidden border border-gray-700 relative">
                        <div
                            className={`h-full transition-all duration-100 ease-linear ${isRedline ? 'bg-red-600' : 'bg-gradient-to-r from-blue-600 to-cyan-400'}`}
                            style={{ width: `${rpmPercent}%` }}
                        />
                        {/* Grid lines */}
                        <div className="absolute inset-0 grid grid-cols-10 divide-x divide-black/20">
                            {[...Array(10)].map((_, i) => <div key={i} />)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Footer Stats */}
            <div className="relative z-10 w-full grid grid-cols-3 gap-6 animate-in slide-in-from-bottom duration-500">
                <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><Activity size={24} /></div>
                    <div>
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-widest">Estado</div>
                        <div className="text-xl font-bold text-white">CORRIENDO</div>
                    </div>
                </div>
                <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 flex items-center gap-4">
                    <div className="p-3 bg-green-500/20 rounded-xl text-green-400"><Gauge size={24} /></div>
                    <div>
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-widest">Mejor Vuelta</div>
                        <div className="text-xl font-bold text-white tabular-nums">{telemetry?.laps?.best || '--:--.---'}</div>
                    </div>
                </div>
                <div className="bg-gray-800/60 p-6 rounded-2xl border border-gray-700 flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400"><MapPin size={24} /></div>
                    <div>
                        <div className="text-xs text-gray-400 uppercase font-bold tracking-widest">Vuelta Actual</div>
                        <div className="text-xl font-bold text-white tabular-nums">{telemetry?.laps?.current || 1}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
