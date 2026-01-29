import { useState, useEffect } from 'react';
import { useTelemetry } from '../hooks/useTelemetry';
import StreamPlayer from '../components/StreamPlayer';
import axios from 'axios';
import { API_URL } from '../config';

// Demo telemetry data that animates
const useDemoTelemetry = (enabled: boolean) => {
    const [demo, setDemo] = useState({
        station_id: '1',
        driver: 'Carlos Sainz Jr.',
        car: 'Ferrari 488 GT3',
        track: 'Monza',
        speed_kmh: 280,
        rpm: 7500,
        gear: 6,
        lap_time_ms: 45000,
        laps: 5,
        gas: 0.8,
        brake: 0,
        pos: 1,
    });

    useEffect(() => {
        if (!enabled) return;

        const interval = setInterval(() => {
            setDemo(prev => {
                const isCorner = Math.random() > 0.7;
                const newSpeed = isCorner
                    ? Math.max(80, prev.speed_kmh - Math.random() * 60)
                    : Math.min(320, prev.speed_kmh + Math.random() * 20);
                const newRpm = Math.min(8500, Math.max(3000, prev.rpm + (Math.random() - 0.4) * 1500));
                const newGear = Math.max(1, Math.min(7, Math.round(newSpeed / 45)));

                return {
                    ...prev,
                    speed_kmh: Math.round(newSpeed),
                    rpm: Math.round(newRpm),
                    gear: newGear,
                    lap_time_ms: prev.lap_time_ms + 100,
                    gas: isCorner ? Math.random() * 0.3 : 0.7 + Math.random() * 0.3,
                    brake: isCorner ? 0.5 + Math.random() * 0.5 : 0,
                };
            });
        }, 100);

        return () => clearInterval(interval);
    }, [enabled]);

    return demo;
};

export default function TVSpectatorFullscreen() {
    const [stationId] = useState(() => {
        const params = new URLSearchParams(window.location.search);
        return params.get('station') || '1';
    });
    const demoMode = new URLSearchParams(window.location.search).get('demo') === '1';
    const [streamUrl, setStreamUrl] = useState<string | null>(null);

    const { liveCars } = useTelemetry();
    const demoTelemetry = useDemoTelemetry(demoMode);

    useEffect(() => {
        if (demoMode) return;

        // Fetch station details to get stream URL
        const fetchStation = async () => {
            try {
                const res = await axios.get(`${API_URL}/spectator/stations`);
                const station = res.data.find((s: any) => String(s.id) === stationId);
                if (station && station.is_streaming) {
                    setStreamUrl(station.stream_url);
                } else {
                    setStreamUrl(null); // Clear stream if not found or not streaming
                }
            } catch (e) {
                console.error("Error fetching station stream", e);
                setStreamUrl(null); // Clear stream on error
            }
        };

        fetchStation();
        const interval = setInterval(fetchStation, 5000);
        return () => clearInterval(interval);
    }, [stationId, demoMode]);

    const telemetry = demoMode
        ? demoTelemetry
        : Object.values(liveCars).find(c => String(c.station_id) === stationId);

    const formatLapTime = (ms: number) => {
        if (!ms) return '--:--.---';
        const min = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const mils = ms % 1000;
        return `${min}:${sec.toString().padStart(2, '0')}.${mils.toString().padStart(3, '0')}`;
    };

    return (
        <div className="fixed inset-0 bg-black">
            {/* Background - Video Stream */}
            <div className="absolute inset-0 bg-gray-900">
                {streamUrl ? (
                    (streamUrl.endsWith('.flv') || streamUrl.endsWith('.mp4')) ? (
                        <StreamPlayer url={streamUrl} />
                    ) : (
                        <iframe src={streamUrl} className="w-full h-full border-0" allow="autoplay" />
                    )
                ) : (
                    <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-black to-gray-800" />
                )}

                {/* Simulated track view for demo */}
                {demoMode && (
                    <div className="absolute inset-0 flex items-center justify-center opacity-20 bg-gradient-to-br from-gray-900 via-black to-gray-800">
                        <div className="text-[200px] font-black text-white/10">🏎️</div>
                    </div>
                )}
            </div>

            {/* TELEMETRY OVERLAY */}
            {telemetry && (
                <>
                    {/* Top Left - Driver Info */}
                    <div className="absolute top-8 left-8 bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/10">
                        <p className="text-4xl font-black text-white">{telemetry.driver || 'Piloto'}</p>
                        <p className="text-xl text-gray-400">{telemetry.car || 'Car'} • {telemetry.track || 'Track'}</p>
                    </div>

                    {/* Top Right - Lap Time */}
                    <div className="absolute top-8 right-8 bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/10 text-right">
                        <p className="text-lg text-gray-400 uppercase tracking-wider">Vuelta {telemetry.laps || 0}</p>
                        <p className="text-5xl font-mono font-bold text-white">
                            {formatLapTime(telemetry.lap_time_ms || 0)}
                        </p>
                    </div>

                    {/* Bottom Center - Speed & Gear */}
                    <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-8 bg-black/70 backdrop-blur-sm rounded-2xl px-10 py-6 border border-white/10">
                        {/* Speed */}
                        <div className="text-center">
                            <p className="text-8xl font-black text-white tabular-nums">
                                {Math.round(telemetry.speed_kmh || 0)}
                            </p>
                            <p className="text-lg text-gray-400 uppercase tracking-widest">km/h</p>
                        </div>

                        {/* Gear */}
                        <div className="text-center px-8 border-l border-r border-white/20">
                            <p className="text-8xl font-black text-yellow-400">
                                {telemetry.gear === 0 ? 'N' : telemetry.gear === -1 ? 'R' : telemetry.gear || '-'}
                            </p>
                            <p className="text-lg text-gray-400 uppercase tracking-widest">Marcha</p>
                        </div>

                        {/* RPM Bar */}
                        <div className="w-48">
                            <div className="flex justify-between text-lg text-gray-400 mb-2">
                                <span>RPM</span>
                                <span className="font-mono">{Math.round((telemetry.rpm || 0) / 1000)}k</span>
                            </div>
                            <div className="h-6 bg-gray-700 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
                                    style={{ width: `${Math.min(100, ((telemetry.rpm || 0) / 8000) * 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    {/* Bottom Left - Throttle/Brake Bars */}
                    <div className="absolute bottom-8 left-8 flex gap-4">
                        {/* Throttle */}
                        <div className="w-10 h-40 bg-gray-800/80 rounded-full overflow-hidden flex flex-col-reverse border-2 border-white/10">
                            <div
                                className="bg-green-500 transition-all"
                                style={{ height: `${(telemetry.gas || 0) * 100}%` }}
                            />
                        </div>
                        {/* Brake */}
                        <div className="w-10 h-40 bg-gray-800/80 rounded-full overflow-hidden flex flex-col-reverse border-2 border-white/10">
                            <div
                                className="bg-red-500 transition-all"
                                style={{ height: `${(telemetry.brake || 0) * 100}%` }}
                            />
                        </div>
                        <div className="flex flex-col justify-between text-sm text-gray-400 py-2 font-bold">
                            <span>100%</span>
                            <span>0%</span>
                        </div>
                    </div>

                    {/* Bottom Right - Position Indicator */}
                    <div className="absolute bottom-8 right-8 bg-black/70 backdrop-blur-sm rounded-2xl px-6 py-4 border border-white/10">
                        <p className="text-lg text-gray-400 uppercase">Posición</p>
                        <p className="text-6xl font-black text-white">P{telemetry.pos || 1}</p>
                    </div>
                </>
            )}

            {/* No telemetry message */}
            {!telemetry && (
                <div className="absolute inset-0 flex items-center justify-center">
                    <div className="text-center text-gray-500">
                        <p className="text-4xl font-bold mb-2">Esperando telemetría...</p>
                        <p className="text-xl">Estación {stationId}</p>
                        <p className="text-lg mt-4 opacity-50">Añade ?demo=1 a la URL para modo demo</p>
                    </div>
                </div>
            )}

            {/* Live indicator */}
            {telemetry && (
                <div className="absolute top-8 left-1/2 -translate-x-1/2">
                    <div className="flex items-center gap-3 bg-red-600 px-4 py-2 rounded-full animate-pulse">
                        <span className="w-3 h-3 bg-white rounded-full" />
                        <span className="text-white font-bold uppercase tracking-wider">EN VIVO</span>
                    </div>
                </div>
            )}
        </div>
    );
}
