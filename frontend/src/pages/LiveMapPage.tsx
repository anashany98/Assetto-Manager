import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useTelemetry } from '../hooks/useTelemetry';
import { API_URL } from '../config';
import { cn } from '../lib/utils';
import { Video } from 'lucide-react';
// import { Link } from 'react-router-dom'; // Unused in kiosk mode

// ============================================================================
// CONFIG & HELPERS
// ============================================================================
const GRAPH_POINTS = 300; // Number of points in the graph history
const CAR_INTERPOLATION = 0.1; // Lower = smoother car movement
const BATTLE_THRESHOLD = 0.02; // ~2% of track length

// Helper to format time gaps
const formatGap = (ms: number, isLeader: boolean) => {
    if (isLeader) return "P1";
    if (!ms) return "-";
    return `+${(ms / 1000).toFixed(3)}`;
};

const formatTime = (ms: number) => {
    if (!ms) return "-:--.---";
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const mil = ms % 1000;
    return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
};

// Fallback track (Generic Loop)
const FALLBACK_TRACK = {
    viewBox: "0 0 1000 800",
    path: "M 200,400 Q 150,200 300,100 L 700,100 Q 850,200 850,400 Q 850,600 700,700 L 300,700 Q 150,600 200,400 Z"
};

// Calculate position on SVG path
const getPointOnPath = (pathElement: SVGPathElement | null, normalizedPos: number) => {
    if (!pathElement) return { x: 500, y: 400 };
    try {
        const length = pathElement.getTotalLength();
        // Safe clamp 0-1
        const pos = Math.max(0, Math.min(1, normalizedPos));
        const point = pathElement.getPointAtLength(pos * length);
        return { x: point.x, y: point.y };
    } catch {
        return { x: 500, y: 400 };
    }
};

// ============================================================================
// HOOKS
// ============================================================================

// Hook: Interpolates car positions for smooth 60fps movement
const useSmoothCars = (liveCars: Record<string, any>) => {
    const [smoothCars, setSmoothCars] = useState<Record<string, any>>({});
    const requestRef = useRef<number>(0);

    useEffect(() => {
        const animate = () => {
            setSmoothCars(prevSmooth => {
                const nextSmooth = { ...prevSmooth };

                Object.values(liveCars).forEach((targetCar: any) => {
                    const id = targetCar.station_id;
                    const prevCar = prevSmooth[id] || targetCar;

                    // Initialize if new
                    if (!prevSmooth[id]) {
                        nextSmooth[id] = targetCar;
                        return;
                    }

                    // Linear Interpolation for Normalized Pos
                    let currentPos = prevCar.normalized_pos;
                    let targetPos = targetCar.normalized_pos;

                    // Handle lap wrap-around (0.99 -> 0.01)
                    if (targetPos < 0.1 && currentPos > 0.9) {
                        targetPos += 1;
                    }

                    // Interpolate
                    const diff = targetPos - currentPos;
                    let newPos = currentPos + (diff * CAR_INTERPOLATION);

                    // Unwrap
                    if (newPos > 1) newPos -= 1;

                    nextSmooth[id] = {
                        ...targetCar,
                        normalized_pos: newPos
                    };
                });

                return nextSmooth;
            });
            requestRef.current = requestAnimationFrame(animate);
        };

        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [liveCars]);

    return smoothCars;
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const LiveMapPage = () => {
    const { liveCars: rawCars } = useTelemetry();
    const smoothCarsMap = useSmoothCars(rawCars); // Use interpolated cars

    // State
    const [selectedStationId, setSelectedStationId] = useState<string | null>(null);
    const [fastestLap, setFastestLap] = useState<{ time: number, driver: string } | null>(null);
    const [showRecordToast, setShowRecordToast] = useState(false);

    // Refs
    const pathRef = useRef<SVGPathElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const historyRef = useRef<{ throttle: number[], brake: number[] }>({
        throttle: new Array(GRAPH_POINTS).fill(0),
        brake: new Array(GRAPH_POINTS).fill(0)
    });

    const allCars = useMemo(() => Object.values(smoothCarsMap), [smoothCarsMap]);

    // Sort cars: Priority to those with lap data, then by position/lap
    const sortedCars = useMemo(() => {
        return [...allCars].sort((a, b) => {
            // If we have real "Position" data from race
            if (a.pos && b.pos) return a.pos - b.pos;
            // Fallback: Use laps completed + normalized pos
            const scoreA = (a.laps || 0) + (a.normalized_pos || 0);
            const scoreB = (b.laps || 0) + (b.normalized_pos || 0);
            return scoreB - scoreA;
        });
    }, [allCars]);

    // Track Fastest Lap
    useEffect(() => {
        allCars.forEach(car => {
            if (car.lap_time_ms > 0) {
                if (!fastestLap || car.lap_time_ms < fastestLap.time) {
                    setFastestLap({ time: car.lap_time_ms, driver: car.driver });
                    setShowRecordToast(true);
                    setTimeout(() => setShowRecordToast(false), 5000); // Hide after 5s
                }
            }
        });
    }, [allCars]); // Caution: this might trigger often, but logic handles check

    // Select the first car (leader) by default if none selected
    useEffect(() => {
        if (!selectedStationId && sortedCars.length > 0) {
            setSelectedStationId(sortedCars[0].station_id);
        }
    }, [sortedCars.length, selectedStationId]);

    const activeCar = selectedStationId ? smoothCarsMap[selectedStationId] : null;

    // Track Name Logic
    const currentTrackName = sortedCars[0]?.track || '';

    // Fetch Track Data
    const { data: trackData } = useQuery({
        queryKey: ['trackOutline', currentTrackName],
        queryFn: async () => {
            if (!currentTrackName) return null;
            try {
                const trackId = currentTrackName.toLowerCase().replace(/\s+/g, '_');
                const res = await axios.get(`${API_URL}/tracks/${trackId}/outline`);
                return res.data;
            } catch { return null; }
        },
        enabled: !!currentTrackName,
        staleTime: 60000
    });

    const activeTrack = useMemo(() => {
        if (trackData?.path) {
            return {
                path: trackData.path,
                viewBox: trackData.viewBox || "0 0 1000 800"
            };
        }
        return FALLBACK_TRACK;
    }, [trackData]);


    // ========================================================================
    // TELEMETRY GRAPH
    // ========================================================================
    useEffect(() => {
        if (!activeCar) return;
        const gas = (activeCar.gas || 0) * 100;
        const brake = (activeCar.brake || 0) * 100;

        historyRef.current.throttle.push(gas); historyRef.current.throttle.shift();
        historyRef.current.brake.push(brake); historyRef.current.brake.shift();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const w = canvas.width; const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.strokeStyle = '#333'; ctx.lineWidth = 1; ctx.beginPath();
        ctx.moveTo(0, h); ctx.lineTo(w, h); ctx.stroke();

        const drawLine = (data: number[], color: string) => {
            ctx.strokeStyle = color; ctx.lineWidth = 2; ctx.beginPath();
            const step = w / (GRAPH_POINTS - 1);
            data.forEach((val, i) => {
                const x = i * step; const y = h - (val / 100) * h;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            });
            ctx.stroke();
        };

        drawLine(historyRef.current.throttle, '#22c55e');
        drawLine(historyRef.current.brake, '#ef4444');
    }, [activeCar]); // Will update as smooth car updates 60fps


    // ========================================================================
    // RENDER
    // ========================================================================
    return (
        <div className="flex h-screen bg-[#0b0b0b] text-white overflow-hidden font-mono">

            {/* LEFT SIDEBAR */}
            <div className="w-80 flex flex-col border-r border-white/10 bg-[#111] z-20 shadow-2xl">
                {/* Header */}
                <div className="p-4 border-b border-white/10 bg-gradient-to-r from-blue-900/20 to-transparent">
                    <h1 className="text-xl font-black italic uppercase tracking-tighter">Live Telemetry</h1>
                    <div className="flex items-center gap-2 text-xs text-gray-400 mt-1">
                        <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        LIVE FEED • {sortedCars.length} CARS
                    </div>
                </div>

                {/* Driver List */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sortedCars.map((car, idx) => {
                        const isSelected = selectedStationId === car.station_id;
                        const isLeader = idx === 0;
                        const gap = formatGap(0, isLeader);
                        const isFastest = fastestLap && fastestLap.driver === car.driver;

                        return (
                            <div
                                key={car.station_id}
                                onClick={() => setSelectedStationId(car.station_id)}
                                className={cn(
                                    "relative flex items-center gap-3 p-3 rounded cursor-pointer transition-all overflow-hidden group",
                                    isSelected ? "bg-blue-600 text-white" : "bg-white/5 hover:bg-white/10 text-gray-300"
                                )}
                            >
                                {/* Active Indicator Bar */}
                                {isSelected && <div className="absolute left-0 top-0 bottom-0 w-1 bg-white" />}

                                <span className={cn("text-lg font-black w-6 text-center italic", isLeader ? "text-yellow-400" : "opacity-50")}>
                                    {car.pos || idx + 1}
                                </span>

                                <div className="flex-1 min-w-0">
                                    <div className="font-bold truncate leading-tight uppercase flex items-center gap-2">
                                        {car.driver}
                                        {isFastest && <span className="text-[9px] bg-purple-600 text-white px-1 rounded font-bold">FL</span>}
                                    </div>
                                    <div className="text-[10px] opacity-70 truncate">{car.car}</div>
                                </div>

                                <div className="text-right">
                                    <div className="text-xs font-bold tabular-nums">{Math.round(car.speed_kmh || 0)} <span className="text-[8px] opacity-70">KMH</span></div>
                                    <div className={cn("text-[10px] font-mono", isLeader ? "text-yellow-300" : "opacity-50")}>{gap}</div>
                                </div>
                            </div>
                        );
                    })}
                </div>

                {/* Footer Brand (Replaces Controls) */}
                <div className="mt-auto p-4 border-t border-white/10 bg-[#0f0f0f]">
                    <div className="flex items-center justify-center opacity-30">
                        <img src="/logo.png" alt="Assetto Manager" className="h-6" />
                    </div>
                </div>
            </div>


            {/* MAIN MAP AREA */}
            <div className="flex-1 relative bg-black">

                {/* SVG MAP */}
                <div className="absolute inset-0 w-full h-full">
                    <svg viewBox={activeTrack.viewBox} className="w-full h-full" preserveAspectRatio="xMidYMid meet">
                        {/* Defs for gradients/glows */}
                        <defs>
                            <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="4" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Track Outline (Base) */}
                        <path d={activeTrack.path} fill="none" stroke="#111" strokeWidth="60" strokeLinejoin="round" strokeLinecap="round" />

                        {/* SECTORS (Simulated styling for now) */}
                        {/* We use stroke-dasharray to fake sectors until real sector splits are available */}
                        {/* Sector 1: Purple, Sector 2: Green, Sector 3: White */}
                        <path
                            d={activeTrack.path}
                            fill="none"
                            stroke="#333"
                            strokeWidth="30"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                        {/* Center Line */}
                        <path
                            ref={pathRef}
                            d={activeTrack.path}
                            stroke="#444"
                            strokeWidth="2"
                            fill="none"
                            strokeDasharray="10 10"
                        />

                        {/* Cars */}
                        {sortedCars.map((car, idx) => {
                            const pos = getPointOnPath(pathRef.current, car.normalized_pos || 0);
                            const isSelected = selectedStationId === car.station_id;
                            const isLeader = idx === 0;

                            // Battle Mode Logic
                            const isInBattle = sortedCars.some(other => {
                                if (other.station_id === car.station_id) return false;
                                const dist = Math.abs((car.normalized_pos || 0) - (other.normalized_pos || 0));
                                return dist < BATTLE_THRESHOLD;
                            });

                            return (
                                <g key={car.station_id} style={{ transition: 'none' /* Handled by RequestAnimation */ }}>

                                    {/* Battle Mode Ring */}
                                    {isInBattle && (
                                        <circle cx={pos.x} cy={pos.y} r={25} fill="none" stroke="#ef4444" strokeWidth="2" opacity="0.8">
                                            <animate attributeName="r" values="20;30;20" dur="0.5s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.8;0.2;0.8" dur="0.5s" repeatCount="indefinite" />
                                        </circle>
                                    )}

                                    {/* Leader Pulsing Ring */}
                                    {isLeader && !isInBattle && (
                                        <circle cx={pos.x} cy={pos.y} r={20} fill="none" stroke="#eab308" strokeWidth="2" opacity="0.5">
                                            <animate attributeName="r" values="20;40" dur="1s" repeatCount="indefinite" />
                                            <animate attributeName="opacity" values="0.5;0" dur="1s" repeatCount="indefinite" />
                                        </circle>
                                    )}

                                    {/* Car Dot */}
                                    <circle
                                        cx={pos.x} cy={pos.y}
                                        r={isSelected ? 10 : 6}
                                        fill={isLeader ? "#eab308" : (isSelected ? "#3b82f6" : "#aaa")}
                                        stroke="black"
                                        strokeWidth="2"
                                        filter="url(#glow)"
                                    />

                                    {/* Driver Label */}
                                    {(isSelected || isLeader || isInBattle) && (
                                        <g transform={`translate(${pos.x}, ${pos.y - 30})`}>
                                            <rect x="-40" y="-15" width="80" height="20" rx="4" fill="rgba(0,0,0,0.8)" />
                                            <text
                                                x="0" y="0" dy="5"
                                                textAnchor="middle"
                                                fill="white"
                                                fontSize="10"
                                                fontWeight="bold"
                                                fontFamily="monospace"
                                            >
                                                {car.driver}
                                            </text>
                                        </g>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                </div>

                {/* OVERLAYS */}

                {/* Track Conditions Widget */}
                <div className="absolute top-8 right-8 flex flex-col items-end gap-2">
                    <div className="bg-black/60 backdrop-blur px-4 py-2 rounded border border-white/10 flex items-center gap-4">
                        <div className="text-right">
                            <div className="text-[9px] text-gray-400 uppercase">Track Temp</div>
                            <div className="text-sm font-bold text-white">
                                {activeCar?.track_temp ? `${activeCar.track_temp.toFixed(1)}°C` : '--°C'}
                            </div>
                        </div>
                        <div className="w-px h-6 bg-white/10"></div>
                        <div className="text-right">
                            <div className="text-[9px] text-gray-400 uppercase">Air Temp</div>
                            <div className="text-sm font-bold text-white">
                                {activeCar?.air_temp ? `${activeCar.air_temp.toFixed(1)}°C` : '--°C'}
                            </div>
                        </div>
                    </div>
                </div>

                {/* Fastest Lap Toast */}
                {showRecordToast && fastestLap && (
                    <div className="absolute top-24 right-8 bg-purple-900/90 backdrop-blur border border-purple-500/50 p-4 rounded shadow-2xl animate-in fade-in slide-in-from-right duration-500">
                        <div className="text-xs text-purple-200 font-bold uppercase tracking-wider mb-1">New Fastest Lap</div>
                        <div className="text-xl font-black italic text-white">{fastestLap.driver}</div>
                        <div className="text-2xl font-mono font-bold text-purple-300">{formatTime(fastestLap.time)}</div>
                    </div>
                )}

                {/* Top Center: Track Info */}
                <div className="absolute top-6 left-1/2 -translate-x-1/2 flex items-center gap-4 bg-black/60 backdrop-blur px-6 py-2 rounded-full border border-white/10">
                    <div className="flex flex-col items-center">
                        <span className="text-[10px] text-gray-400 uppercase tracking-widest">Circuit</span>
                        <span className="font-bold text-white uppercase">{currentTrackName || "Unknown Track"}</span>
                    </div>
                </div>

                {/* Bottom Right: Telemetry Graph */}
                {selectedStationId && (
                    <div className="absolute bottom-8 right-8 w-[400px] bg-black/80 backdrop-blur border border-white/10 rounded-xl overflow-hidden shadow-2xl">
                        {/* Header */}
                        <div className="flex justify-between items-center p-3 border-b border-white/10 bg-white/5">
                            <div className="flex items-center gap-2">
                                <Video size={14} className="text-red-500 animate-pulse" />
                                <span className="text-xs font-bold uppercase tracking-widest text-white">{activeCar?.driver} ONBOARD</span>
                            </div>
                            <div className="flex gap-3 text-[10px] font-bold uppercase">
                                <span className="text-green-500">Throttle</span>
                                <span className="text-red-500">Brake</span>
                            </div>
                        </div>

                        {/* Graph */}
                        <div className="p-4 relative">
                            <canvas ref={canvasRef} width={360} height={120} className="w-full h-[120px]" />

                            {/* Live Values Overlay */}
                            <div className="absolute top-4 right-4 flex flex-col items-end pointer-events-none">
                                <span className="text-2xl font-black italic tracking-tighter text-white">
                                    {Math.round(activeCar?.speed_kmh || 0)} <span className="text-sm text-gray-500 not-italic">KMH</span>
                                </span>
                                <div className="flex gap-1 mt-1">
                                    <div className="w-12 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                        <div className="h-full bg-green-500 transition-all duration-75" style={{ width: `${(activeCar?.gas || 0) * 100}%` }} />
                                    </div>
                                    <div className="w-12 h-1 bg-gray-700/50 rounded-full overflow-hidden">
                                        <div className="h-full bg-red-500 transition-all duration-75" style={{ width: `${(activeCar?.brake || 0) * 100}%` }} />
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Split Times (Simulated) */}
                        <div className="grid grid-cols-3 divide-x divide-white/10 border-t border-white/10 bg-black/50">
                            <div className="p-2 text-center">
                                <div className="text-[9px] text-gray-500 uppercase">Sector 1</div>
                                <div className="text-xs font-bold text-purple-400">23.412</div>
                            </div>
                            <div className="p-2 text-center">
                                <div className="text-[9px] text-gray-500 uppercase">Sector 2</div>
                                <div className="text-xs font-bold text-green-400">41.201</div>
                            </div>
                            <div className="p-2 text-center">
                                <div className="text-[9px] text-gray-500 uppercase">Lap Time</div>
                                <div className="text-xs font-bold text-white">{formatTime(activeCar?.lap_time_ms || 0)}</div>
                            </div>
                        </div>
                    </div>
                )}

            </div>
        </div>
    );
};

export default LiveMapPage;
