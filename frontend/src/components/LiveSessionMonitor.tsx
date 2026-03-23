import type { FC } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Activity, Gauge, MapPin } from 'lucide-react';

interface LiveSessionMonitorProps {
    stationId: number;
    driverName?: string;
}

export const LiveSessionMonitor: FC<LiveSessionMonitorProps> = ({ stationId, driverName }) => {
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
                    <h1 className="text-5xl font-black text-[var(--text-primary)] italic tracking-tighter">{driverName || 'PILOTO'}</h1>
                    <p className="text-xl text-[var(--text-tertiary)] font-mono mt-1">{car} @ {track}</p>
                </div>
                <div className="text-right">
                    <div className="text-4xl font-mono font-bold text-[var(--text-primary)] tabular-nums">
                        {Math.floor(speed)} <span className="text-sm text-[var(--text-tertiary)]">KM/H</span>
                    </div>
                </div>
            </div>

            {/* Central Telemetry HUD */}
            <div className="relative z-10 w-full max-w-4xl flex items-center justify-center gap-12 my-auto">
                {/* Gear */}
                <div className="w-48 h-48 rounded-full border-8 border-[var(--border-default)] bg-[var(--bg-card)] flex items-center justify-center relative shadow-[0_0_50px_rgba(0,0,0,0.5)]">
                    <span className={`text-9xl font-black italic tracking-tighter ${isRedline ? 'text-red-500 animate-pulse' : 'text-[var(--text-primary)]'}`}>
                        {gear === 0 ? 'N' : gear === -1 ? 'R' : gear}
                    </span>
                    <div className="absolute -bottom-12 text-[var(--text-tertiary)] font-bold tracking-widest text-sm">MARCHA</div>
                </div>

                {/* RPM Bar */}
                <div className="flex-1 max-w-xl">
                    <div className="flex justify-between text-xs font-bold text-[var(--text-tertiary)] mb-2 uppercase tracking-widest">
                        <span>Idle</span>
                        <span>{maxRpm} RPM</span>
                    </div>
                    <div className="h-12 bg-[var(--bg-elevated)] rounded-xl overflow-hidden border border-[var(--border-default)] relative">
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
                <div className="bg-[var(--bg-elevated)]/60 p-6 rounded-2xl border border-[var(--border-default)] flex items-center gap-4">
                    <div className="p-3 bg-blue-500/20 rounded-xl text-blue-400"><Activity size={24} /></div>
                    <div>
                        <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Estado</div>
                        <div className="text-xl font-bold text-[var(--text-primary)]">CORRIENDO</div>
                    </div>
                </div>
                <div className="bg-[var(--bg-elevated)]/60 p-6 rounded-2xl border border-[var(--border-default)] flex items-center gap-4">
                    <div className="p-3 bg-green-500/20 rounded-xl text-green-400"><Gauge size={24} /></div>
                    <div>
                        <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Mejor Vuelta</div>
                        <div className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{telemetry?.laps?.best || '--:--.---'}</div>
                    </div>
                </div>
                <div className="bg-[var(--bg-elevated)]/60 p-6 rounded-2xl border border-[var(--border-default)] flex items-center gap-4">
                    <div className="p-3 bg-purple-500/20 rounded-xl text-purple-400"><MapPin size={24} /></div>
                    <div>
                        <div className="text-xs text-[var(--text-tertiary)] uppercase font-bold tracking-widest">Vuelta Actual</div>
                        <div className="text-xl font-bold text-[var(--text-primary)] tabular-nums">{telemetry?.laps?.current || 1}</div>
                    </div>
                </div>
            </div>
        </div>
    );
};
