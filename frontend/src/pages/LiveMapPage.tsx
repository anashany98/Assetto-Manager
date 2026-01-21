import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useTelemetry } from '../hooks/useTelemetry';
import { LiveMap } from '../components/LiveMap';
import { API_URL } from '../config';

const formatTime = (ms: number) => {
    if (!ms) return "0:00.000";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const milliseconds = Math.round(ms % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`;
};

const StatItem = ({ label, value, sub, alert = false }: { label: string, value: string | number, sub: string, alert?: boolean }) => (
    <div className={`bg-white/5 rounded-xl p-2.5 text-center border border-white/5 transition-colors ${alert ? 'bg-red-500/10 border-red-500/20' : ''}`}>
        <div className="text-[8px] text-gray-500 font-black uppercase mb-1 tracking-widest">{label}</div>
        <div className={`text-sm font-black italic leading-none tabular-nums ${alert ? 'text-red-500' : 'text-white'}`}>
            {value}
            <span className="text-[7px] ml-0.5 not-italic text-gray-500">{sub}</span>
        </div>
    </div>
);

const LiveMapPage = () => {
    const { liveCars } = useTelemetry();
    const [selectedStation, setSelectedStation] = useState<number | 'all'>('all');

    // Fetch stations for the selector
    const { data: stations } = useQuery({
        queryKey: ['stations'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/stations/`);
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        initialData: []
    });

    const allCars = Object.values(liveCars);
    const cars = selectedStation === 'all'
        ? allCars
        : allCars.filter((c) => c.station_id === String(selectedStation));

    return (
        <div className="h-screen w-screen bg-black overflow-hidden p-6 flex flex-col font-sans selection:bg-yellow-500/30">
            {/* Global Styles to hide scrollbars */}
            <style>{`
                .no-scrollbar::-webkit-scrollbar { display: none; }
                .no-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
            `}</style>

            {/* Ambient background glow */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-blue-500/10 blur-[120px] rounded-full pointer-events-none" />
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-yellow-500/5 blur-[120px] rounded-full pointer-events-none" />

            {/* Header Section */}
            <div className="flex justify-between items-end mb-8 relative z-10">
                <div className="flex flex-col">
                    <div className="flex items-center space-x-3 mb-1">
                        <div className="px-2 py-0.5 bg-yellow-500 text-black text-[10px] font-black uppercase italic skew-x-[-15deg]">
                            <span className="skew-x-[15deg] inline-block">LIVE TRACKER</span>
                        </div>
                        <div className="flex items-center space-x-1.5 overflow-hidden">
                            <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse shadow-[0_0_8px_rgba(239,68,68,0.8)]" />
                            <span className="text-[10px] font-bold text-white/40 tracking-[0.2em] uppercase">Telemetry Stream • 10Hz</span>
                        </div>
                    </div>
                    <h1 className="text-5xl font-black text-white italic tracking-tighter uppercase leading-none">
                        Deepmind <span className="text-transparent bg-clip-text bg-gradient-to-r from-white to-white/40 font-black">Raceway</span>
                    </h1>
                </div>

                <div className="flex space-x-8 items-center border-l border-white/10 pl-8">
                    <div className="text-right">
                        <div className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-1">Sesión</div>
                        <div className="text-white font-black uppercase text-xl italic leading-none">Practica Libre</div>
                    </div>
                    <div className="text-right">
                        <div className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-1">Circuito</div>
                        <div className="text-white font-black uppercase text-xl italic leading-none">{cars[0]?.track || '---'}</div>
                    </div>
                    <div className="text-right">
                        <div className="text-gray-500 font-bold text-[10px] uppercase tracking-widest mb-1">Estación</div>
                        <select
                            value={selectedStation}
                            onChange={(e) => setSelectedStation(e.target.value === 'all' ? 'all' : Number(e.target.value))}
                            className="bg-gray-900 border border-white/10 rounded-lg px-3 py-1 text-white font-bold uppercase text-sm cursor-pointer focus:ring-2 focus:ring-yellow-500 outline-none"
                        >
                            <option value="all">Todas ({allCars.length})</option>
                            {Array.isArray(stations) && stations.map((s: { id: number; name?: string }) => (
                                <option key={s.id} value={s.id}>
                                    {s.name || `Estación ${s.id}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>

            {/* Main Content Grid */}
            <div className="flex-1 grid grid-cols-12 gap-6 min-h-0 relative z-10">
                {/* Left: Map Visualization */}
                <div className="col-span-8 flex flex-col">
                    <div className="flex-1 bg-gradient-to-br from-gray-900/50 to-black/50 rounded-[2rem] border border-white/5 overflow-hidden p-2 backdrop-blur-md relative group">
                        <div className="absolute inset-0 bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')] opacity-[0.03] pointer-events-none" />
                        <LiveMap
                            drivers={Array.isArray(cars) ? cars.map((c) => ({
                                id: Number(c.station_id),
                                name: c.driver || '---',
                                x: c.x || 0,
                                z: c.z || 0,
                                normPos: c.normalized_pos || 0,
                                color: c.station_id === '1' ? '#ef4444' : c.station_id === '2' ? '#3b82f6' : c.station_id === '3' ? '#22c55e' : '#eab308',
                                isOnline: true
                            })) : []}
                            trackName={Array.isArray(cars) && cars.length > 0 ? cars[0]?.track : 'Cargando...'}
                        />
                    </div>
                </div>

                {/* Right: Driver Leaderboard/Telemetry Cards */}
                <div className="col-span-4 flex flex-col space-y-4 overflow-y-auto pr-2 no-scrollbar">
                    {/* Sort by track position (descending) */}
                    {Array.isArray(cars) && cars.length > 0 ? (
                        cars.slice(0, 4).sort((a, b) => (b.normalized_pos || 0) - (a.normalized_pos || 0)).map((car, idx) => (
                            <div key={car.station_id} className="relative group/card">
                                {/* Ranking Badge (Floating) */}
                                <div className="absolute -left-2 -top-2 w-8 h-8 bg-yellow-500 text-black font-black italic flex items-center justify-center rounded-lg z-20 shadow-lg skew-x-[-10deg] group-hover/card:scale-110 transition-transform">
                                    <span className="skew-x-[10deg]">{idx + 1}</span>
                                </div>

                                <div className="bg-gradient-to-r from-gray-900 via-gray-900/80 to-black border border-white/5 rounded-2xl p-5 transition-all duration-500 group-hover/card:border-yellow-500/40 group-hover/card:shadow-[0_0_30px_rgba(234,179,8,0.1)]">
                                    <div className="flex justify-between items-start mb-4">
                                        <div className="pl-6">
                                            <div className="text-white font-black uppercase text-xl italic leading-none tracking-tighter mb-1.5 group-hover/card:text-yellow-500 transition-colors">
                                                {car.driver || '---'}
                                            </div>
                                            <div className="flex items-center space-x-2">
                                                <div className="px-1.5 py-0.5 bg-white/5 rounded text-[9px] font-bold text-gray-400 uppercase tracking-widest border border-white/5">
                                                    {car.car || 'FS-24'}
                                                </div>
                                                <div className="w-1 h-1 rounded-full bg-gray-700" />
                                                <span className="text-[9px] font-bold text-gray-500 uppercase tracking-widest">P{idx + 1}</span>
                                            </div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-white font-black text-3xl italic leading-none flex items-baseline justify-end tabular-nums">
                                                {Math.round(car.speed_kmh || 0)}
                                                <span className="text-[10px] text-gray-500 ml-1 not-italic font-extrabold tracking-widest">KM/H</span>
                                            </div>
                                            <div className="text-[14px] font-mono font-black text-yellow-500/60 tracking-tighter mt-1 tabular-nums">
                                                {formatTime(car.lap_time_ms || 0)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="w-full h-1.5 bg-white/5 rounded-full mb-5 overflow-hidden border border-white/5">
                                        <div
                                            className="h-full bg-gradient-to-r from-yellow-600 to-yellow-400 shadow-[0_0_15px_rgba(234,179,8,0.4)] transition-all duration-300"
                                            style={{ width: `${(car.normalized_pos || 0) * 100}%` }}
                                        />
                                    </div>

                                    {/* Stats Grid - 4 Columns */}
                                    <div className="grid grid-cols-4 gap-3">
                                        <StatItem label="RPM" value={Math.round(car.rpm || 0)} sub="MAX" />
                                        <StatItem label="FUEL" value={Math.round(car.fuel || 0)} sub="LTR" />
                                        <StatItem
                                            label="TEMP"
                                            value={Math.round(car.engine_temp || 0)}
                                            sub="°C"
                                            alert={(car.engine_temp || 0) > 105}
                                        />
                                        <StatItem
                                            label="DMG"
                                            value={Math.round((Array.isArray(car.damage) ? (car.damage as number[]).reduce((a, b) => a + b, 0) : 0) * 10) || 0}
                                            sub="%"
                                            alert={Array.isArray(car.damage) && (car.damage as number[]).some((d) => d > 0.2)}
                                        />
                                    </div>
                                </div>
                            </div>
                        ))
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-gray-700 space-y-2 opacity-30">
                            <div className="w-12 h-12 border-2 border-dashed border-gray-700 rounded-full animate-spin-slow" />
                            <p className="text-[10px] font-black uppercase tracking-widest">Esperando Telemetría</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Footer with ticker info or credits */}
            <div className="h-10 border-t border-white/5 mt-6 flex items-center justify-between px-2 relative z-10">
                <div className="flex space-x-6">
                    <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold text-gray-600 uppercase">Status</span>
                        <div className="w-2 h-2 rounded-full bg-green-500" />
                    </div>
                </div>
                <div className="text-white/20 text-[10px] font-bold uppercase tracking-[0.3em]">
                    Advanced Agentic Coding • Assetto Manager Pro
                </div>
            </div>
        </div>
    );
};

export default LiveMapPage;
