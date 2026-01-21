import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useTelemetry } from '../hooks/useTelemetry';
import { API_URL } from '../config';
import { cn } from '../lib/utils';
import { Activity, AlertTriangle, Flag, Zap, Loader2 } from 'lucide-react';

// Format lap time from milliseconds
const formatLapTime = (ms: number) => {
    if (!ms || ms <= 0) return "--:--.---";
    const minutes = Math.floor(ms / 60000);
    const seconds = Math.floor((ms % 60000) / 1000);
    const millis = Math.round(ms % 1000);
    return `${minutes}:${seconds.toString().padStart(2, '0')}.${millis.toString().padStart(3, '0')}`;
};

// Driver colors
const DRIVER_COLORS = ['#ef4444', '#3b82f6', '#22c55e', '#eab308', '#a855f7', '#f97316', '#06b6d4', '#ec4899'];
const getDriverColor = (stationId: string | number) => {
    const idx = typeof stationId === 'string' ? parseInt(stationId, 10) : stationId;
    return DRIVER_COLORS[(idx - 1) % DRIVER_COLORS.length];
};

// Fallback track paths for when AC files aren't available
const FALLBACK_TRACKS: Record<string, { path: string; viewBox: string }> = {
    default: {
        viewBox: "0 0 1000 800",
        path: "M 200,400 Q 150,200 300,100 L 700,100 Q 850,200 850,400 Q 850,600 700,700 L 300,700 Q 150,600 200,400 Z"
    }
};

// Calculate position on SVG path
const getPointOnPath = (pathElement: SVGPathElement | null, normalizedPos: number) => {
    if (!pathElement) return { x: 500, y: 400 };
    try {
        const length = pathElement.getTotalLength();
        const point = pathElement.getPointAtLength(normalizedPos * length);
        return { x: point.x, y: point.y };
    } catch {
        return { x: 500, y: 400 };
    }
};

// ============================================================================
// MAIN COMPONENT - TV OPTIMIZED LIVE MAP
// ============================================================================
const LiveMapPage = () => {
    const { liveCars, isConnected } = useTelemetry();
    const [selectedStation, setSelectedStation] = useState<string | null>(null);
    const pathRef = useRef<SVGPathElement>(null);
    const [driverPositions, setDriverPositions] = useState<Record<string, { x: number; y: number }>>({});

    const allCars = useMemo(() => Object.values(liveCars), [liveCars]);

    // Sort cars by track position (leader first)
    const sortedCars = useMemo(() =>
        [...allCars].sort((a, b) => (b.normalized_pos || 0) - (a.normalized_pos || 0)),
        [allCars]
    );

    // Get current track name from telemetry
    const currentTrackName = sortedCars[0]?.track || '';

    // Fetch track outline from backend (parses fast_lane.ai)
    const { data: trackData, isLoading: trackLoading, error: trackError } = useQuery({
        queryKey: ['trackOutline', currentTrackName],
        queryFn: async () => {
            if (!currentTrackName) return null;
            try {
                // Convert track name to ID format (e.g., "ks_monza" -> "ks_monza")
                const trackId = currentTrackName.toLowerCase().replace(/\s+/g, '_');
                const res = await axios.get(`${API_URL}/tracks/${trackId}/outline`);
                return res.data;
            } catch (err) {
                console.warn('Track outline not available, using fallback:', err);
                return null;
            }
        },
        enabled: !!currentTrackName,
        staleTime: 60000, // Cache for 1 minute
        retry: false
    });

    // Use fetched track data or fallback
    const activeTrack = useMemo(() => {
        if (trackData?.path) {
            return {
                path: trackData.path,
                viewBox: trackData.viewBox || "0 0 1000 800",
                name: trackData.trackName || currentTrackName
            };
        }
        return {
            ...FALLBACK_TRACKS.default,
            name: currentTrackName || 'Esperando circuito...'
        };
    }, [trackData, currentTrackName]);

    // Update driver positions on path
    useEffect(() => {
        if (!pathRef.current) return;

        const newPositions: Record<string, { x: number; y: number }> = {};
        sortedCars.forEach(car => {
            const pos = getPointOnPath(pathRef.current, car.normalized_pos || 0);
            newPositions[car.station_id] = pos;
        });
        setDriverPositions(newPositions);
    }, [sortedCars, activeTrack]);

    return (
        <div className="h-screen w-screen bg-black overflow-hidden flex flex-col font-sans">
            {/* ==================== HEADER BAR ==================== */}
            <header className="h-20 bg-gradient-to-r from-gray-900 to-black border-b border-white/10 flex items-center justify-between px-8">
                <div className="flex items-center gap-6">
                    {/* Live Indicator */}
                    <div className="flex items-center gap-3">
                        <div className="relative">
                            <div className="w-4 h-4 rounded-full bg-red-600 animate-pulse" />
                            <div className="absolute inset-0 w-4 h-4 rounded-full bg-red-500 animate-ping opacity-50" />
                        </div>
                        <span className="text-2xl font-black text-white uppercase tracking-tight">EN VIVO</span>
                    </div>
                    {/* Divider */}
                    <div className="w-px h-10 bg-white/20" />
                    {/* Track Name */}
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider font-bold">Circuito</div>
                        <div className="text-xl font-bold text-white flex items-center gap-2">
                            {activeTrack.name}
                            {trackLoading && <Loader2 size={16} className="animate-spin text-blue-400" />}
                        </div>
                    </div>
                </div>

                {/* Right side info */}
                <div className="flex items-center gap-8">
                    {/* Drivers Count */}
                    <div className="flex items-center gap-3 px-5 py-2 bg-green-500/10 border border-green-500/30 rounded-xl">
                        <Activity size={20} className="text-green-400" />
                        <span className="text-2xl font-black text-green-400">{allCars.length}</span>
                        <span className="text-green-400/80 uppercase text-sm font-bold">Pilotos</span>
                    </div>
                    {/* Connection Status */}
                    <div className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg border",
                        isConnected ? "bg-green-500/10 border-green-500/30" : "bg-red-500/10 border-red-500/30"
                    )}>
                        <div className={cn("w-3 h-3 rounded-full", isConnected ? "bg-green-500" : "bg-red-500")} />
                        <span className={cn("text-sm font-bold uppercase", isConnected ? "text-green-400" : "text-red-400")}>
                            {isConnected ? "Conectado" : "Sin conexión"}
                        </span>
                    </div>
                </div>
            </header>

            {/* ==================== MAIN CONTENT ==================== */}
            <div className="flex-1 flex min-h-0">
                {/* ==================== TRACK VISUALIZATION ==================== */}
                <div className="flex-1 p-6 flex flex-col">
                    <div className="flex-1 relative rounded-3xl border-2 border-white/10 bg-gradient-to-br from-gray-900/50 to-black overflow-hidden">
                        {/* Background Grid */}
                        <div
                            className="absolute inset-0 opacity-10"
                            style={{
                                backgroundImage: 'radial-gradient(circle, #fff 1px, transparent 1px)',
                                backgroundSize: '40px 40px'
                            }}
                        />

                        {sortedCars.length > 0 ? (
                            <svg
                                viewBox={activeTrack.viewBox}
                                className="w-full h-full"
                                preserveAspectRatio="xMidYMid meet"
                            >
                                {/* Track Glow */}
                                <path
                                    d={activeTrack.path}
                                    fill="none"
                                    stroke="rgba(59, 130, 246, 0.15)"
                                    strokeWidth="60"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                                {/* Track Surface */}
                                <path
                                    d={activeTrack.path}
                                    fill="none"
                                    stroke="#1e293b"
                                    strokeWidth="45"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                                {/* Track Inner */}
                                <path
                                    d={activeTrack.path}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.08)"
                                    strokeWidth="40"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />
                                {/* Center Line (reference path for positioning) */}
                                <path
                                    ref={pathRef}
                                    d={activeTrack.path}
                                    fill="none"
                                    stroke="rgba(255,255,255,0.15)"
                                    strokeWidth="2"
                                    strokeDasharray="15 20"
                                    strokeLinejoin="round"
                                    strokeLinecap="round"
                                />

                                {/* Driver markers */}
                                {sortedCars.map((car, idx) => {
                                    const pos = driverPositions[car.station_id] || { x: 500, y: 400 };
                                    const color = getDriverColor(car.station_id);
                                    const isSelected = selectedStation === car.station_id;
                                    const isLeader = idx === 0;

                                    return (
                                        <g key={car.station_id}>
                                            {/* Outer glow for leader */}
                                            {isLeader && (
                                                <circle
                                                    cx={pos.x} cy={pos.y} r={28}
                                                    fill="rgba(234,179,8,0.3)"
                                                    className="animate-pulse"
                                                />
                                            )}
                                            {/* Driver glow */}
                                            <circle
                                                cx={pos.x} cy={pos.y}
                                                r={isSelected ? 22 : 16}
                                                fill={color}
                                                opacity={0.4}
                                            />
                                            {/* Driver dot */}
                                            <circle
                                                cx={pos.x} cy={pos.y}
                                                r={isSelected ? 14 : 10}
                                                fill={color}
                                                stroke="white"
                                                strokeWidth={isSelected ? 3 : 2}
                                                style={{
                                                    filter: `drop-shadow(0 0 12px ${color})`,
                                                    cursor: 'pointer',
                                                    transition: 'all 0.3s ease'
                                                }}
                                                onClick={() => setSelectedStation(
                                                    selectedStation === car.station_id ? null : car.station_id
                                                )}
                                            />
                                            {/* Position number inside */}
                                            <text
                                                x={pos.x} y={pos.y + 4}
                                                textAnchor="middle"
                                                fill="white"
                                                fontSize={isSelected ? "12" : "10"}
                                                fontWeight="bold"
                                            >
                                                {idx + 1}
                                            </text>
                                            {/* Name tag */}
                                            <g transform={`translate(${pos.x}, ${pos.y - 30})`}>
                                                <rect
                                                    x="-45" y="-12"
                                                    width="90" height="22"
                                                    rx="4"
                                                    fill="rgba(0,0,0,0.85)"
                                                />
                                                <text
                                                    x="0" y="4"
                                                    textAnchor="middle"
                                                    fill="white"
                                                    fontSize="11"
                                                    fontWeight="bold"
                                                >
                                                    {(car.driver || `P${car.station_id}`).slice(0, 12)}
                                                </text>
                                            </g>
                                        </g>
                                    );
                                })}
                            </svg>
                        ) : (
                            <div className="flex-1 h-full flex flex-col items-center justify-center text-gray-500">
                                <Activity size={64} className="mb-6 opacity-30 animate-pulse" />
                                <p className="text-2xl font-bold">Esperando telemetría...</p>
                                <p className="text-gray-600 mt-2">Conecta un simulador para ver datos en tiempo real</p>
                            </div>
                        )}

                        {/* Track Name Overlay */}
                        <div className="absolute bottom-6 left-6 bg-black/60 backdrop-blur-sm px-4 py-2 rounded-xl border border-white/10">
                            <div className="flex items-center gap-2">
                                <Flag size={16} className="text-green-400" />
                                <span className="text-sm font-bold text-white">{currentTrackName || 'Sin pista'}</span>
                                {trackData?.pointCount && (
                                    <span className="text-xs text-gray-500">({trackData.pointCount} puntos)</span>
                                )}
                            </div>
                        </div>
                    </div>
                </div>

                {/* ==================== LEADERBOARD SIDEBAR ==================== */}
                <div className="w-[420px] bg-gradient-to-b from-gray-900/80 to-black border-l border-white/10 p-5 overflow-y-auto">
                    <div className="flex items-center justify-between mb-5">
                        <h2 className="text-lg font-black text-white uppercase tracking-wider">Clasificación</h2>
                        <div className="text-xs text-gray-500 uppercase">{sortedCars.length} en pista</div>
                    </div>

                    <div className="space-y-3">
                        {sortedCars.map((car, idx) => {
                            const color = getDriverColor(car.station_id);
                            const isSelected = selectedStation === car.station_id;
                            const progress = (car.normalized_pos || 0) * 100;
                            const hasAlert = (car.engine_temp || 0) > 105;

                            return (
                                <div
                                    key={car.station_id}
                                    onClick={() => setSelectedStation(isSelected ? null : car.station_id)}
                                    className={cn(
                                        "relative p-4 rounded-2xl border cursor-pointer transition-all duration-300",
                                        isSelected
                                            ? "bg-white/10 border-white/30 shadow-xl scale-[1.02]"
                                            : "bg-white/5 border-white/5 hover:bg-white/8"
                                    )}
                                >
                                    {/* Position Badge */}
                                    <div
                                        className="absolute -left-2 -top-2 w-10 h-10 rounded-xl flex items-center justify-center font-black text-lg shadow-lg"
                                        style={{ backgroundColor: color }}
                                    >
                                        {idx + 1}
                                    </div>

                                    {/* Alert Indicator */}
                                    {hasAlert && (
                                        <div className="absolute top-2 right-2">
                                            <AlertTriangle size={18} className="text-red-400 animate-pulse" />
                                        </div>
                                    )}

                                    {/* Content */}
                                    <div className="flex items-start justify-between pl-8">
                                        <div>
                                            <div className="text-white font-bold text-xl">{car.driver || 'Piloto'}</div>
                                            <div className="text-xs text-gray-500 mt-0.5">{car.car || 'Vehículo'}</div>
                                        </div>
                                        <div className="text-right">
                                            <div className="text-3xl font-black tabular-nums" style={{ color }}>
                                                {Math.round(car.speed_kmh || 0)}
                                                <span className="text-sm text-gray-500 ml-1">km/h</span>
                                            </div>
                                            <div className="text-sm text-yellow-400/80 font-mono tabular-nums mt-1">
                                                {formatLapTime(car.lap_time_ms)}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Progress Bar */}
                                    <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
                                        <div
                                            className="h-full rounded-full transition-all duration-500"
                                            style={{ width: `${progress}%`, backgroundColor: color }}
                                        />
                                    </div>

                                    {/* Stats Row */}
                                    <div className="grid grid-cols-4 gap-2 mt-3">
                                        <div className="text-center p-2 bg-white/5 rounded-lg">
                                            <div className="text-[10px] text-gray-500">RPM</div>
                                            <div className="text-sm font-bold tabular-nums">{Math.round(car.rpm || 0)}</div>
                                        </div>
                                        <div className="text-center p-2 bg-white/5 rounded-lg">
                                            <div className="text-[10px] text-gray-500">FUEL</div>
                                            <div className="text-sm font-bold tabular-nums">{Math.round(car.fuel || 0)}L</div>
                                        </div>
                                        <div className={cn(
                                            "text-center p-2 rounded-lg",
                                            hasAlert ? "bg-red-500/20" : "bg-white/5"
                                        )}>
                                            <div className="text-[10px] text-gray-500">TEMP</div>
                                            <div className={cn("text-sm font-bold", hasAlert && "text-red-400")}>
                                                {Math.round(car.engine_temp || 0)}°
                                            </div>
                                        </div>
                                        <div className="text-center p-2 bg-white/5 rounded-lg">
                                            <div className="text-[10px] text-gray-500">GEAR</div>
                                            <div className="text-sm font-bold">{car.gear || 'N'}</div>
                                        </div>
                                    </div>
                                </div>
                            );
                        })}

                        {sortedCars.length === 0 && (
                            <div className="text-center py-16 text-gray-600">
                                <Zap size={48} className="mx-auto mb-4 opacity-30" />
                                <p className="text-lg font-medium">Sin pilotos activos</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LiveMapPage;
