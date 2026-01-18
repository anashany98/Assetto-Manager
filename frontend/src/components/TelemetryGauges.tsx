import { motion } from 'framer-motion';

export interface TelemetryData {
    station_id: string;
    driver: string;
    car: string;
    track: string;
    speed_kmh: number;
    rpm: number;
    gear: number;
    gas?: number;
    brake?: number;
    steer?: number;
    g_lat?: number;
    g_lon?: number;
    fuel?: number;
    engine_temp?: number;
    tyre_temp?: number;
    damage?: number[];
    laps?: number;
    lap_time_ms?: number;
}

interface TelemetryGaugesProps {
    data: TelemetryData;
}

export function TelemetryGauges({ data }: TelemetryGaugesProps) {
    const maxRPM = 9000;
    const rpmPercent = Math.min((data.rpm / maxRPM) * 100, 100);
    const isRedline = data.rpm > 8000;

    return (
        <div className="h-full w-full bg-gradient-to-br from-gray-900 via-black to-gray-900 p-8 grid grid-cols-12 gap-6">
            {/* LEFT: Driver Info */}
            <div className="col-span-3 flex flex-col justify-center space-y-6">
                <div className="bg-gradient-to-r from-yellow-500/20 to-transparent border-l-4 border-yellow-500 p-6 rounded-r-2xl">
                    <p className="text-yellow-500 text-xs font-bold uppercase tracking-widest mb-1">Piloto</p>
                    <h2 className="text-4xl font-black text-white uppercase tracking-tighter leading-none">{data.driver || 'Desconocido'}</h2>
                </div>
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl space-y-2">
                    <InfoRow label="Coche" value={data.car || '-'} />
                    <InfoRow label="Circuito" value={data.track || '-'} />
                    <InfoRow label="Vueltas" value={String(data.laps || 0)} />
                </div>
            </div>

            {/* CENTER: Main Gauges */}
            <div className="col-span-6 flex flex-col items-center justify-center">
                {/* Speed */}
                <div className="relative w-72 h-72 mb-8">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                        {/* Background Arc */}
                        <circle
                            cx="50" cy="50" r="45"
                            stroke="rgba(255,255,255,0.1)"
                            strokeWidth="8"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray="212"
                            strokeDashoffset="0"
                        />
                        {/* Speed Arc */}
                        <motion.circle
                            cx="50" cy="50" r="45"
                            stroke="url(#speedGradient)"
                            strokeWidth="8"
                            fill="none"
                            strokeLinecap="round"
                            strokeDasharray="212"
                            initial={{ strokeDashoffset: 212 }}
                            animate={{ strokeDashoffset: 212 - (data.speed_kmh / 350) * 212 }}
                            transition={{ type: 'spring', stiffness: 100 }}
                        />
                        <defs>
                            <linearGradient id="speedGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                                <stop offset="0%" stopColor="#22c55e" />
                                <stop offset="50%" stopColor="#eab308" />
                                <stop offset="100%" stopColor="#ef4444" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                        <span className="text-7xl font-black text-white tabular-nums">{Math.round(data.speed_kmh)}</span>
                        <span className="text-sm font-bold text-gray-500 uppercase tracking-widest">KM/H</span>
                    </div>
                </div>

                {/* RPM Bar */}
                <div className="w-full max-w-md">
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>RPM</span>
                        <span className={isRedline ? 'text-red-500 animate-pulse font-bold' : ''}>{Math.round(data.rpm)}</span>
                    </div>
                    <div className="h-4 bg-gray-800 rounded-full overflow-hidden">
                        <motion.div
                            className={`h-full rounded-full ${isRedline ? 'bg-red-500' : 'bg-gradient-to-r from-green-500 via-yellow-500 to-red-500'}`}
                            initial={{ width: 0 }}
                            animate={{ width: `${rpmPercent}%` }}
                            transition={{ type: 'spring', stiffness: 150 }}
                        />
                    </div>
                </div>

                {/* Gear */}
                <div className="mt-6 text-center">
                    <span className="text-8xl font-black text-white">{data.gear === 0 ? 'N' : data.gear === -1 ? 'R' : data.gear}</span>
                    <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Marcha</p>
                </div>
            </div>

            {/* RIGHT: Pedals & Temps */}
            <div className="col-span-3 flex flex-col justify-center space-y-6">
                {/* Pedals */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-4">Pedales</h3>
                    <div className="flex justify-between gap-4">
                        <PedalBar label="Gas" value={data.gas || 0} color="green" />
                        <PedalBar label="Freno" value={data.brake || 0} color="red" />
                    </div>
                </div>

                {/* Steering */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Volante</h3>
                    <div className="h-2 bg-gray-800 rounded-full relative overflow-hidden">
                        <motion.div
                            className="absolute top-0 h-full w-8 bg-blue-500 rounded-full"
                            style={{ left: '50%', marginLeft: '-1rem' }}
                            animate={{ x: (data.steer || 0) * 50 }}
                            transition={{ type: 'spring', stiffness: 200 }}
                        />
                    </div>
                </div>

                {/* G-Forces */}
                <div className="bg-white/5 border border-white/10 p-4 rounded-xl">
                    <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-2">Fuerzas G</h3>
                    <div className="relative w-24 h-24 mx-auto bg-gray-800 rounded-full">
                        <motion.div
                            className="absolute w-4 h-4 bg-yellow-500 rounded-full"
                            style={{ top: '50%', left: '50%', marginTop: '-0.5rem', marginLeft: '-0.5rem' }}
                            animate={{
                                x: (data.g_lat || 0) * 30,
                                y: (data.g_lon || 0) * -30
                            }}
                            transition={{ type: 'spring', stiffness: 300 }}
                        />
                        <div className="absolute inset-0 border-2 border-white/10 rounded-full" />
                    </div>
                </div>

                {/* Temps */}
                <div className="grid grid-cols-2 gap-2">
                    <TempCard label="Motor" value={data.engine_temp || 0} unit="°C" warning={(data.engine_temp || 0) > 100} />
                    <TempCard label="Fuel" value={data.fuel || 0} unit="L" warning={(data.fuel ?? 100) < 5} />
                </div>
            </div>
        </div>
    );
}

function InfoRow({ label, value }: { label: string; value: string }) {
    return (
        <div className="flex justify-between">
            <span className="text-gray-500 text-sm">{label}</span>
            <span className="text-white font-bold text-sm truncate max-w-[150px]">{value}</span>
        </div>
    );
}

function PedalBar({ label, value, color }: { label: string; value: number; color: 'green' | 'red' }) {
    const bgColor = color === 'green' ? 'bg-green-500' : 'bg-red-500';
    return (
        <div className="flex-1 text-center">
            <div className="h-32 bg-gray-800 rounded-lg relative overflow-hidden">
                <motion.div
                    className={`absolute bottom-0 left-0 right-0 ${bgColor}`}
                    initial={{ height: 0 }}
                    animate={{ height: `${value * 100}%` }}
                    transition={{ type: 'spring', stiffness: 200 }}
                />
            </div>
            <p className="text-xs text-gray-400 mt-2 uppercase">{label}</p>
            <p className="text-sm font-bold text-white">{Math.round(value * 100)}%</p>
        </div>
    );
}

function TempCard({ label, value, unit, warning }: { label: string; value: number; unit: string; warning?: boolean }) {
    return (
        <div className={`p-3 rounded-xl text-center ${warning ? 'bg-red-500/20 border border-red-500/30' : 'bg-white/5 border border-white/10'}`}>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest">{label}</p>
            <p className={`text-xl font-bold ${warning ? 'text-red-400 animate-pulse' : 'text-white'}`}>
                {Math.round(value)}{unit}
            </p>
        </div>
    );
}

export default TelemetryGauges;
