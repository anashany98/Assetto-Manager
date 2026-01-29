import { useState, useEffect } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import { Users, Trophy } from 'lucide-react';

interface DriverData {
    station_id: string;
    driver: string;
    car: string;
    track: string;
    speed_kmh: number;
    rpm: number;
    gear: number;
    lap_time_ms: number;
    laps: number;
    gas?: number;
    brake?: number;
    clutch?: number;
    pos?: number;
    best_lap_ms?: number;
    image?: string;
}

// Demo data for multiple drivers with racing car images
const demoDrivers: DriverData[] = [
    { station_id: '1', driver: 'Carlos Sainz', car: 'Ferrari 488 GT3', track: 'Monza', speed_kmh: 285, rpm: 7500, gear: 6, lap_time_ms: 92340, laps: 5, gas: 0.9, brake: 0, clutch: 0, pos: 1, image: 'https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?w=800&q=80' },
    { station_id: '2', driver: 'Max Verstappen', car: 'Red Bull X2019', track: 'Monza', speed_kmh: 278, rpm: 7200, gear: 6, lap_time_ms: 92890, laps: 5, gas: 0.85, brake: 0.1, clutch: 0.1, pos: 2, image: 'https://images.unsplash.com/photo-1544636331-e26879cd4d9b?w=800&q=80' },
    { station_id: '3', driver: 'Lewis Hamilton', car: 'Mercedes AMG GT3', track: 'Monza', speed_kmh: 265, rpm: 6800, gear: 5, lap_time_ms: 93450, laps: 5, gas: 0.7, brake: 0.3, clutch: 0, pos: 3, image: 'https://images.unsplash.com/photo-1503376780353-7e6692767b70?w=800&q=80' },
    { station_id: '4', driver: 'Fernando Alonso', car: 'Aston Martin GT3', track: 'Monza', speed_kmh: 255, rpm: 6500, gear: 5, lap_time_ms: 94120, laps: 5, gas: 0.5, brake: 0.5, clutch: 0.2, pos: 4, image: 'https://images.unsplash.com/photo-1552519507-da3b142c6e3d?w=800&q=80' },
];

const useDemoMulti = (enabled: boolean) => {
    const [drivers, setDrivers] = useState<DriverData[]>(demoDrivers);

    useEffect(() => {
        if (!enabled) return;

        const interval = setInterval(() => {
            setDrivers(prev => prev.map(d => {
                const isCorner = Math.random() > 0.7;
                const isShifting = Math.random() > 0.85; // Simulate gear shifts
                return {
                    ...d,
                    speed_kmh: Math.round(isCorner ? Math.max(80, d.speed_kmh - Math.random() * 50) : Math.min(320, d.speed_kmh + Math.random() * 15)),
                    rpm: Math.round(Math.min(8500, Math.max(3000, d.rpm + (Math.random() - 0.5) * 1000))),
                    gear: Math.max(1, Math.min(7, Math.round(d.speed_kmh / 45))),
                    lap_time_ms: d.lap_time_ms + 100,
                    gas: isCorner ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3,
                    brake: isCorner ? 0.5 + Math.random() * 0.5 : 0,
                    clutch: isShifting ? 0.8 + Math.random() * 0.2 : 0,
                };
            }));
        }, 100);

        return () => clearInterval(interval);
    }, [enabled]);

    return drivers;
};

export default function TVSpectatorMulti() {
    const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';

    const { liveCars } = useTelemetry();
    const demoDrivers = useDemoMulti(demoMode);

    const drivers: DriverData[] = demoMode
        ? demoDrivers
        : Object.values(liveCars).map(c => ({
            station_id: c.station_id,
            driver: c.driver || `Estación ${c.station_id}`,
            car: c.car || 'Unknown',
            track: c.track || 'Track',
            speed_kmh: c.speed_kmh || 0,
            rpm: c.rpm || 0,
            gear: c.gear || 0,
            lap_time_ms: c.lap_time_ms || 0,
            laps: c.laps || 0,
            gas: c.gas,
            brake: c.brake,
            pos: c.pos,
        }));

    const formatLapTime = (ms: number) => {
        if (!ms) return '--:--.---';
        const min = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const mils = ms % 1000;
        return `${min}:${sec.toString().padStart(2, '0')}.${mils.toString().padStart(3, '0')}`;
    };

    const getGridCols = () => {
        if (drivers.length <= 1) return 'grid-cols-1';
        if (drivers.length <= 2) return 'grid-cols-2';
        if (drivers.length <= 4) return 'grid-cols-2';
        if (drivers.length <= 6) return 'grid-cols-3';
        return 'grid-cols-4';
    };

    const getPositionColor = (pos: number | undefined) => {
        if (pos === 1) return 'text-yellow-400';
        if (pos === 2) return 'text-gray-300';
        if (pos === 3) return 'text-orange-400';
        return 'text-white';
    };

    return (
        <div className="fixed inset-0 bg-black overflow-hidden">
            {/* Header */}
            <div className="absolute top-0 left-0 right-0 bg-gradient-to-b from-black to-transparent z-10 px-8 py-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Trophy className="text-yellow-400" size={32} />
                        <div>
                            <h1 className="text-3xl font-black text-white">COMPETICIÓN EN VIVO</h1>
                            <p className="text-gray-400">{drivers[0]?.track || 'Circuit'}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-4">
                        <div className="flex items-center gap-2 text-gray-400">
                            <Users size={20} />
                            <span className="text-xl font-bold">{drivers.length} Pilotos</span>
                        </div>
                        <div className="flex items-center gap-2 bg-red-600 px-4 py-2 rounded-full animate-pulse">
                            <span className="w-3 h-3 bg-white rounded-full" />
                            <span className="text-white font-bold">EN VIVO</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Driver Grid */}
            <div className={`h-full pt-20 grid ${getGridCols()} gap-2 p-2`}>
                {drivers.map((driver, idx) => (
                    <div
                        key={driver.station_id}
                        className="relative bg-gray-900 rounded-xl overflow-hidden border-2 border-gray-800"
                    >
                        {/* Background Image for Demo */}
                        {driver.image && (
                            <img
                                src={driver.image}
                                alt=""
                                className="absolute inset-0 w-full h-full object-cover"
                            />
                        )}

                        {/* Dark overlay for readability */}
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/40" />

                        {/* Position gradient glow */}
                        <div className={`absolute inset-0 opacity-30 ${driver.pos === 1 ? 'bg-gradient-to-br from-yellow-500 to-transparent' :
                            driver.pos === 2 ? 'bg-gradient-to-br from-gray-400 to-transparent' :
                                driver.pos === 3 ? 'bg-gradient-to-br from-orange-500 to-transparent' :
                                    'bg-gradient-to-br from-blue-500 to-transparent'
                            }`} />

                        {/* Position Badge */}
                        <div className="absolute top-3 left-3 z-10">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center font-black text-2xl ${driver.pos === 1 ? 'bg-yellow-500 text-black' :
                                driver.pos === 2 ? 'bg-gray-400 text-black' :
                                    driver.pos === 3 ? 'bg-orange-500 text-black' :
                                        'bg-gray-700 text-white'
                                }`}>
                                {driver.pos || idx + 1}
                            </div>
                        </div>

                        {/* Driver Info */}
                        <div className="absolute top-3 left-20 right-3 z-10">
                            <p className={`text-2xl font-black truncate ${getPositionColor(driver.pos)}`}>
                                {driver.driver}
                            </p>
                            <p className="text-sm text-gray-400 truncate">{driver.car}</p>
                        </div>

                        {/* Bottom Telemetry Bar */}
                        <div className="absolute bottom-0 left-0 right-0 bg-black/80 backdrop-blur-sm p-3 z-10">
                            <div className="flex justify-between items-center gap-4">
                                {/* Lap Info */}
                                <div className="flex-1">
                                    <p className="text-[10px] text-gray-500 uppercase">Vuelta {driver.laps}</p>
                                    <p className="text-lg font-mono font-bold text-white">
                                        {formatLapTime(driver.lap_time_ms)}
                                    </p>
                                </div>

                                {/* Speed + Gear + RPM */}
                                <div className="flex items-center gap-4 bg-gray-900/50 rounded-lg px-4 py-2">
                                    {/* Speed */}
                                    <div className="text-center">
                                        <p className="text-3xl font-black text-white tabular-nums">
                                            {Math.round(driver.speed_kmh)}
                                        </p>
                                        <p className="text-[10px] text-gray-500 uppercase">km/h</p>
                                    </div>

                                    {/* Gear */}
                                    <div className="text-center border-l border-r border-gray-700 px-4">
                                        <p className="text-3xl font-black text-yellow-400">
                                            {driver.gear === 0 ? 'N' : driver.gear}
                                        </p>
                                        <p className="text-[10px] text-gray-500 uppercase">Marcha</p>
                                    </div>

                                    {/* RPM */}
                                    <div className="w-20">
                                        <div className="flex justify-between text-[10px] text-gray-500 mb-1">
                                            <span>RPM</span>
                                            <span>{Math.round(driver.rpm / 1000)}k</span>
                                        </div>
                                        <div className="h-2 bg-gray-700 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
                                                style={{ width: `${Math.min(100, (driver.rpm / 8000) * 100)}%` }}
                                            />
                                        </div>
                                    </div>
                                </div>

                                {/* Pedals: Throttle, Brake, Clutch */}
                                <div className="flex gap-1 items-end">
                                    {/* Throttle */}
                                    <div className="text-center">
                                        <div className="w-4 h-12 bg-gray-800 rounded overflow-hidden flex flex-col-reverse">
                                            <div
                                                className="bg-green-500 transition-all"
                                                style={{ height: `${(driver.gas || 0) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-[8px] text-gray-500 mt-1">A</p>
                                    </div>
                                    {/* Brake */}
                                    <div className="text-center">
                                        <div className="w-4 h-12 bg-gray-800 rounded overflow-hidden flex flex-col-reverse">
                                            <div
                                                className="bg-red-500 transition-all"
                                                style={{ height: `${(driver.brake || 0) * 100}%` }}
                                            />
                                        </div>
                                        <p className="text-[8px] text-gray-500 mt-1">F</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* No drivers message */}
            {drivers.length === 0 && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <Users size={64} className="mx-auto mb-4 opacity-50" />
                        <p className="text-3xl font-bold mb-2">Esperando pilotos...</p>
                        <p className="text-lg">Los simuladores aparecerán cuando se conecten</p>
                        <p className="text-lg mt-4 opacity-50">Añade ?demo=1 a la URL para modo demo</p>
                    </div>
                </div>
            )}
        </div>
    );
}
