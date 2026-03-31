import { useState, useEffect, useMemo, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { useTelemetry } from '../hooks/useTelemetry';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

// ============================================================================
// CONFIG & HELPERS
// ============================================================================
const GRAPH_POINTS = 200;
const CAR_INTERPOLATION = 0.12;
const BATTLE_THRESHOLD = 0.02;

const formatTime = (ms: number) => {
    if (!ms || ms <= 0) return '--:--.---';
    const min = Math.floor(ms / 60000);
    const sec = Math.floor((ms % 60000) / 1000);
    const mil = ms % 1000;
    return `${min}:${sec.toString().padStart(2, '0')}.${mil.toString().padStart(3, '0')}`;
};

export const formatGap = (ms: number, isLeader: boolean) => {
    if (isLeader) return 'LÍDER';
    if (!ms || ms <= 0) return '-';
    return `+${(ms / 1000).toFixed(3)}s`;
};

// Colores por posición
const CAR_COLORS = [
    '#f59e0b', // P1 - Oro
    '#e5e7eb', // P2 - Plata
    '#b45309', // P3 - Bronce
    '#3b82f6', // P4 - Azul
    '#22c55e', // P5 - Verde
    '#a855f7', // P6 - Morado
    '#ef4444', // P7 - Rojo
    '#06b6d4', // P8 - Cyan
    '#f97316', // P9 - Naranja
    '#84cc16', // P10 - Lima
];

const getCarColor = (idx: number) => CAR_COLORS[idx % CAR_COLORS.length];

const FALLBACK_TRACK = {
    viewBox: '0 0 1000 700',
    path: 'M 500,80 C 750,80 900,180 900,300 C 900,420 820,500 720,540 C 640,570 580,560 520,590 C 460,620 430,660 340,650 C 220,635 100,560 100,420 C 100,300 160,200 280,160 C 360,130 430,80 500,80 Z',
};

const getPointOnPath = (pathEl: SVGPathElement | null, normalizedPos: number) => {
    if (!pathEl) return { x: 500, y: 350 };
    try {
        const len = pathEl.getTotalLength();
        const pos = Math.max(0, Math.min(1, normalizedPos));
        const pt = pathEl.getPointAtLength(pos * len);
        return { x: pt.x, y: pt.y };
    } catch {
        return { x: 500, y: 350 };
    }
};

// ============================================================================
// SMOOTH CARS HOOK
// ============================================================================
const useSmoothCars = (liveCars: Record<string, any>) => {
    const [smoothCars, setSmoothCars] = useState<Record<string, any>>({});
    const rafRef = useRef<number>(0);

    useEffect(() => {
        const animate = () => {
            setSmoothCars(prev => {
                const next = { ...prev };
                Object.values(liveCars).forEach((target: any) => {
                    const id = String(target.station_id);
                    const p = prev[id] || target;
                    if (!prev[id]) { next[id] = target; return; }

                    let tPos = target.normalized_pos ?? 0;
                    const cPos = p.normalized_pos ?? 0;
                    if (tPos < 0.1 && cPos > 0.9) tPos += 1;
                    let newPos = cPos + (tPos - cPos) * CAR_INTERPOLATION;
                    if (newPos > 1) newPos -= 1;

                    next[id] = { ...target, normalized_pos: newPos };
                });
                return next;
            });
            rafRef.current = requestAnimationFrame(animate);
        };
        rafRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(rafRef.current);
    }, [liveCars]);

    return smoothCars;
};

// ============================================================================
// DRIVER CARD (sidebar izquierdo)
// ============================================================================
const DriverCard = ({
    car, idx, isSelected, isFastest, onClick
}: {
    car: any; idx: number; isSelected: boolean; isFastest: boolean; onClick: () => void;
}) => {
    const color = getCarColor(idx);
    const isLeader = idx === 0;
    return (
        <div
            onClick={onClick}
            className={cn(
                'relative flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-all border',
                isSelected
                    ? 'bg-white/10 border-white/30'
                    : 'bg-white/[0.03] border-white/[0.06] hover:bg-white/[0.07] hover:border-white/20'
            )}
        >
            {/* Color indicator */}
            <div className="w-1 self-stretch rounded-full flex-shrink-0" style={{ backgroundColor: color }} />

            {/* Position number */}
            <span className="text-sm font-black w-5 text-center tabular-nums" style={{ color }}>
                {car.pos || idx + 1}
            </span>

            {/* Driver info */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                    <span className="font-bold text-sm text-white truncate uppercase leading-tight">
                        {car.driver || `Station ${car.station_id}`}
                    </span>
                    {isFastest && (
                        <span className="text-[9px] bg-purple-600 text-white px-1 py-0.5 rounded font-bold flex-shrink-0">FL</span>
                    )}
                </div>
                <div className="text-[10px] text-white/40 truncate">{car.car || '-'}</div>
            </div>

            {/* Speed */}
            <div className="text-right flex-shrink-0">
                <div className="text-xs font-bold text-white tabular-nums">
                    {Math.round(car.speed_kmh || 0)}
                    <span className="text-[9px] text-white/40 ml-0.5">km/h</span>
                </div>
                <div className={cn('text-[10px] tabular-nums', isLeader ? 'text-yellow-400' : 'text-white/40')}>
                    {isLeader ? 'LÍDER' : `V${car.laps || 0}`}
                </div>
            </div>
        </div>
    );
};

// ============================================================================
// STATS PANEL (sidebar derecho)
// ============================================================================
const StatsPanel = ({ car, fastestLap }: { car: any; fastestLap: { time: number; driver: string } | null }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const histRef = useRef({ throttle: new Array(GRAPH_POINTS).fill(0), brake: new Array(GRAPH_POINTS).fill(0) });

    useEffect(() => {
        if (!car) return;
        histRef.current.throttle.push((car.gas || 0) * 100);
        histRef.current.throttle.shift();
        histRef.current.brake.push((car.brake || 0) * 100);
        histRef.current.brake.shift();

        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const w = canvas.width; const h = canvas.height;
        ctx.clearRect(0, 0, w, h);

        // Background grid
        ctx.strokeStyle = 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        [0.25, 0.5, 0.75].forEach(v => {
            ctx.beginPath();
            ctx.moveTo(0, h * (1 - v));
            ctx.lineTo(w, h * (1 - v));
            ctx.stroke();
        });

        const drawLine = (data: number[], color: string, fill: string) => {
            const step = w / (GRAPH_POINTS - 1);
            ctx.beginPath();
            data.forEach((val, i) => {
                const x = i * step;
                const y = h - (val / 100) * h;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            // Fill
            ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.closePath();
            ctx.fillStyle = fill;
            ctx.fill();
            // Stroke
            ctx.beginPath();
            data.forEach((val, i) => {
                const x = i * step;
                const y = h - (val / 100) * h;
                if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
            });
            ctx.strokeStyle = color;
            ctx.lineWidth = 1.5;
            ctx.stroke();
        };

        drawLine(histRef.current.throttle, '#22c55e', 'rgba(34,197,94,0.15)');
        drawLine(histRef.current.brake, '#ef4444', 'rgba(239,68,68,0.15)');
    }, [car]);

    if (!car) {
        return (
            <div className="w-72 flex flex-col border-l border-white/10 bg-[#111] items-center justify-center">
                <div className="text-white/20 text-sm text-center px-6">
                    Selecciona un piloto para ver sus estadísticas
                </div>
            </div>
        );
    }

    const isFL = fastestLap?.driver === car.driver;

    return (
        <div className="w-72 flex flex-col border-l border-white/10 bg-[#111] overflow-y-auto">
            {/* Header */}
            <div className="p-4 border-b border-white/10 bg-gradient-to-b from-white/5 to-transparent">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-1">Piloto Seleccionado</div>
                <div className="text-lg font-black uppercase text-white truncate">{car.driver}</div>
                <div className="text-xs text-white/50 truncate">{car.car}</div>
            </div>

            {/* Live telemetry bars */}
            <div className="p-4 border-b border-white/10 space-y-3">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Telemetría en Vivo</div>

                {/* Speed */}
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">Velocidad</span>
                        <span className="text-white font-bold tabular-nums">{Math.round(car.speed_kmh || 0)} km/h</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-blue-500 rounded-full transition-all duration-100"
                            style={{ width: `${Math.min(100, (car.speed_kmh || 0) / 300 * 100)}%` }}
                        />
                    </div>
                </div>

                {/* RPM */}
                <div>
                    <div className="flex justify-between text-xs mb-1">
                        <span className="text-white/60">RPM</span>
                        <span className="text-white font-bold tabular-nums">{Math.round(car.rpm || 0).toLocaleString()}</span>
                    </div>
                    <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                        <div
                            className="h-full bg-orange-500 rounded-full transition-all duration-100"
                            style={{ width: `${Math.min(100, (car.rpm || 0) / 9000 * 100)}%` }}
                        />
                    </div>
                </div>

                {/* Throttle / Brake */}
                <div className="grid grid-cols-2 gap-2">
                    <div>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-green-400">Acelerador</span>
                            <span className="text-green-400 font-bold">{Math.round((car.gas || 0) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-green-500 rounded-full transition-all duration-75"
                                style={{ width: `${(car.gas || 0) * 100}%` }}
                            />
                        </div>
                    </div>
                    <div>
                        <div className="flex justify-between text-[10px] mb-1">
                            <span className="text-red-400">Freno</span>
                            <span className="text-red-400 font-bold">{Math.round((car.brake || 0) * 100)}%</span>
                        </div>
                        <div className="h-2 bg-white/10 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-red-500 rounded-full transition-all duration-75"
                                style={{ width: `${(car.brake || 0) * 100}%` }}
                            />
                        </div>
                    </div>
                </div>

                {/* Gear */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-white/60">Marcha</span>
                    <div className="w-10 h-10 rounded-lg bg-white/10 flex items-center justify-center">
                        <span className="text-xl font-black text-white">{car.gear || '-'}</span>
                    </div>
                </div>
            </div>

            {/* Throttle/Brake Graph */}
            <div className="p-4 border-b border-white/10">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-[10px] text-white/40 uppercase tracking-widest">Gráfica de Pedales</span>
                    <div className="flex gap-2 text-[9px]">
                        <span className="text-green-400">● Acelerador</span>
                        <span className="text-red-400">● Freno</span>
                    </div>
                </div>
                <canvas ref={canvasRef} width={220} height={60} className="w-full h-[60px] rounded" />
            </div>

            {/* Race stats */}
            <div className="p-4 border-b border-white/10 space-y-2">
                <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Carrera</div>
                <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded-lg p-2.5">
                        <div className="text-[9px] text-white/40 uppercase">Vuelta</div>
                        <div className="text-lg font-black text-white">{car.laps || 0}</div>
                    </div>
                    <div className="bg-white/5 rounded-lg p-2.5">
                        <div className="text-[9px] text-white/40 uppercase">Posición</div>
                        <div className="text-lg font-black text-yellow-400">P{car.pos || '-'}</div>
                    </div>
                </div>

                <div className="bg-white/5 rounded-lg p-2.5">
                    <div className="text-[9px] text-white/40 uppercase mb-1">Tiempo de Vuelta</div>
                    <div className={cn('text-sm font-mono font-bold', isFL ? 'text-purple-400' : 'text-white')}>
                        {formatTime(car.lap_time_ms)}
                        {isFL && <span className="ml-2 text-[9px] bg-purple-600 px-1 py-0.5 rounded">BEST</span>}
                    </div>
                </div>

                {fastestLap && (
                    <div className="bg-purple-900/30 border border-purple-500/20 rounded-lg p-2.5">
                        <div className="text-[9px] text-purple-300 uppercase mb-1">Vuelta Rápida Global</div>
                        <div className="text-xs font-bold text-purple-200">{fastestLap.driver}</div>
                        <div className="text-sm font-mono font-black text-purple-300">{formatTime(fastestLap.time)}</div>
                    </div>
                )}
            </div>

            {/* Conditions */}
            {(car.track_temp || car.air_temp) && (
                <div className="p-4">
                    <div className="text-[10px] text-white/40 uppercase tracking-widest mb-2">Condiciones</div>
                    <div className="grid grid-cols-2 gap-2">
                        {car.track_temp && (
                            <div className="bg-white/5 rounded-lg p-2.5">
                                <div className="text-[9px] text-white/40 uppercase">Asfalto</div>
                                <div className="text-sm font-bold text-orange-300">{car.track_temp.toFixed(1)}°C</div>
                            </div>
                        )}
                        {car.air_temp && (
                            <div className="bg-white/5 rounded-lg p-2.5">
                                <div className="text-[9px] text-white/40 uppercase">Aire</div>
                                <div className="text-sm font-bold text-blue-300">{car.air_temp.toFixed(1)}°C</div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const LiveMapPage = () => {
    const { liveCars: rawCars, isConnected } = useTelemetry();
    const smoothCarsMap = useSmoothCars(rawCars);

    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [fastestLap, setFastestLap] = useState<{ time: number; driver: string } | null>(null);
    const [showFLToast, setShowFLToast] = useState(false);
    const [pathEl, setPathEl] = useState<SVGPathElement | null>(null);

    const allCars = useMemo(() => Object.values(smoothCarsMap), [smoothCarsMap]);

    const sortedCars = useMemo(() => {
        return [...allCars].sort((a, b) => {
            if (a.pos && b.pos) return a.pos - b.pos;
            const scoreA = (a.laps || 0) + (a.normalized_pos || 0);
            const scoreB = (b.laps || 0) + (b.normalized_pos || 0);
            return scoreB - scoreA;
        });
    }, [allCars]);

    // Auto-select leader
    useEffect(() => {
        if (!selectedId && sortedCars.length > 0) {
            setSelectedId(String(sortedCars[0].station_id));
        }
    }, [sortedCars.length, selectedId]);

    // Track fastest lap
    useEffect(() => {
        allCars.forEach(car => {
            if (car.lap_time_ms > 0) {
                if (!fastestLap || car.lap_time_ms < fastestLap.time) {
                    setFastestLap({ time: car.lap_time_ms, driver: car.driver });
                    setShowFLToast(true);
                    setTimeout(() => setShowFLToast(false), 4000);
                }
            }
        });
    }, [allCars]);

    const activeCar = selectedId ? smoothCarsMap[selectedId] : null;
    const currentTrack = sortedCars[0]?.track || '';

    const { data: trackData } = useQuery({
        queryKey: ['trackOutline', currentTrack],
        queryFn: async () => {
            if (!currentTrack) return null;
            try {
                const trackId = currentTrack.toLowerCase().replace(/\s+/g, '_');
                const res = await axios.get(`${API_URL}/tracks/${trackId}/outline`);
                return res.data;
            } catch { return null; }
        },
        enabled: !!currentTrack,
        staleTime: 60000,
    });

    const activeTrack = useMemo(() => {
        if (trackData?.path) return { path: trackData.path, viewBox: trackData.viewBox || '0 0 1000 700' };
        return FALLBACK_TRACK;
    }, [trackData]);

    return (
        <div className="flex h-screen bg-[#0a0a0a] text-white overflow-hidden" style={{ fontFamily: 'ui-monospace, monospace' }}>

            {/* ================================================================
                LEFT SIDEBAR — Lista de pilotos
            ================================================================ */}
            <div className="w-64 flex flex-col border-r border-white/10 bg-[#0f0f0f] z-10 flex-shrink-0">
                {/* Header */}
                <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                    <div>
                        <h1 className="text-sm font-black uppercase tracking-widest text-white">Live Race</h1>
                        <div className="flex items-center gap-1.5 mt-0.5">
                            <div className={cn('w-1.5 h-1.5 rounded-full', isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500')} />
                            <span className="text-[10px] text-white/40">
                                {isConnected ? `${sortedCars.length} PILOTOS` : 'SIN CONEXIÓN'}
                            </span>
                        </div>
                    </div>
                    <div className="text-[10px] text-white/20 uppercase">{currentTrack || '—'}</div>
                </div>

                {/* Driver list */}
                <div className="flex-1 overflow-y-auto p-2 space-y-1">
                    {sortedCars.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-40 gap-2">
                            <div className="w-6 h-6 border-2 border-white/20 border-t-white/60 rounded-full animate-spin" />
                            <span className="text-[10px] text-white/30 text-center">
                                Esperando<br />telemetría...
                            </span>
                        </div>
                    ) : (
                        sortedCars.map((car, idx) => (
                            <DriverCard
                                key={car.station_id}
                                car={car}
                                idx={idx}
                                isSelected={selectedId === String(car.station_id)}
                                isFastest={fastestLap?.driver === car.driver}
                                onClick={() => setSelectedId(String(car.station_id))}
                            />
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-white/10 flex items-center justify-center">
                    <img src="/logo.png" alt="AC Manager" className="h-5 opacity-20" />
                </div>
            </div>

            {/* ================================================================
                CENTER — Mapa del circuito
            ================================================================ */}
            <div className="flex-1 relative bg-[#080808] overflow-hidden">

                {/* Fastest lap toast */}
                {showFLToast && fastestLap && (
                    <div className="absolute top-4 left-1/2 -translate-x-1/2 z-30 bg-purple-950/95 border border-purple-500/50 backdrop-blur px-6 py-3 rounded-xl shadow-2xl text-center animate-in fade-in slide-in-from-top duration-300">
                        <div className="text-[9px] text-purple-300 uppercase tracking-widest font-bold">Nueva Vuelta Rápida</div>
                        <div className="text-base font-black text-white mt-0.5">{fastestLap.driver}</div>
                        <div className="text-xl font-mono font-bold text-purple-300">{formatTime(fastestLap.time)}</div>
                    </div>
                )}

                {/* Track name badge */}
                <div className="absolute top-4 right-4 z-20 bg-black/70 backdrop-blur border border-white/10 px-4 py-2 rounded-lg">
                    <div className="text-[9px] text-white/40 uppercase tracking-widest">Circuito</div>
                    <div className="text-sm font-bold text-white uppercase">{currentTrack || 'Desconocido'}</div>
                </div>

                {/* No data overlay */}
                {sortedCars.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
                        <div className="text-center">
                            <div className="text-white/10 text-6xl font-black uppercase tracking-wider">SIN DATOS</div>
                            <div className="text-white/20 text-sm mt-2">Esperando telemetría en vivo...</div>
                            <div className="text-white/10 text-xs mt-1">Usa ?demo=true para modo demo</div>
                        </div>
                    </div>
                )}

                {/* SVG Circuit Map */}
                <svg
                    viewBox={activeTrack.viewBox}
                    className="absolute inset-0 w-full h-full"
                    preserveAspectRatio="xMidYMid meet"
                >
                    <defs>
                        {/* Glow filter para coches */}
                        <filter id="carGlow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                        {/* Glow suave para el track */}
                        <filter id="trackGlow" x="-10%" y="-10%" width="120%" height="120%">
                            <feGaussianBlur in="SourceGraphic" stdDeviation="2" result="blur" />
                            <feMerge>
                                <feMergeNode in="blur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    {/* === TRACK LAYERS === */}

                    {/* 1. Sombra exterior (profundidad) */}
                    <path
                        d={activeTrack.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.03)"
                        strokeWidth="42"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* 2. Cuerpo del asfalto (gris oscuro) */}
                    <path
                        d={activeTrack.path}
                        fill="none"
                        stroke="#1e1e1e"
                        strokeWidth="36"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* 3. Borde del circuito (línea blanca exterior) */}
                    <path
                        d={activeTrack.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.35)"
                        strokeWidth="36"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* 4. Asfalto interior (capa principal) */}
                    <path
                        d={activeTrack.path}
                        fill="none"
                        stroke="#2a2a2a"
                        strokeWidth="30"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* 5. Línea blanca central (referencia de posición — usada para cálculos) */}
                    <path
                        ref={setPathEl}
                        d={activeTrack.path}
                        fill="none"
                        stroke="rgba(255,255,255,0.12)"
                        strokeWidth="1"
                        strokeDasharray="8 12"
                        strokeLinejoin="round"
                        strokeLinecap="round"
                    />

                    {/* === CARS === */}
                    {sortedCars.map((car, idx) => {
                        const pos = getPointOnPath(pathEl, car.normalized_pos ?? 0);
                        const color = getCarColor(idx);
                        const isSelected = selectedId === String(car.station_id);
                        const isLeader = idx === 0;
                        const isInBattle = sortedCars.some(other => {
                            if (String(other.station_id) === String(car.station_id)) return false;
                            const d = Math.abs((car.normalized_pos || 0) - (other.normalized_pos || 0));
                            return d < BATTLE_THRESHOLD;
                        });

                        const dotR = isSelected ? 9 : isLeader ? 8 : 6;

                        return (
                            <g key={car.station_id}>
                                {/* Battle ring */}
                                {isInBattle && (
                                    <circle cx={pos.x} cy={pos.y} r={18} fill="none" stroke="#ef4444" strokeWidth="1.5" opacity="0.7">
                                        <animate attributeName="r" values="15;24;15" dur="0.6s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.7;0.1;0.7" dur="0.6s" repeatCount="indefinite" />
                                    </circle>
                                )}

                                {/* Leader pulse */}
                                {isLeader && !isInBattle && (
                                    <circle cx={pos.x} cy={pos.y} r={16} fill="none" stroke={color} strokeWidth="1" opacity="0.4">
                                        <animate attributeName="r" values="12;28;12" dur="1.5s" repeatCount="indefinite" />
                                        <animate attributeName="opacity" values="0.4;0;0.4" dur="1.5s" repeatCount="indefinite" />
                                    </circle>
                                )}

                                {/* Selected highlight ring */}
                                {isSelected && (
                                    <circle cx={pos.x} cy={pos.y} r={dotR + 5} fill="none" stroke="white" strokeWidth="1.5" opacity="0.6" />
                                )}

                                {/* Car dot */}
                                <circle
                                    cx={pos.x}
                                    cy={pos.y}
                                    r={dotR}
                                    fill={color}
                                    stroke="rgba(0,0,0,0.8)"
                                    strokeWidth="2"
                                    filter="url(#carGlow)"
                                    style={{ cursor: 'pointer' }}
                                    onClick={() => setSelectedId(String(car.station_id))}
                                />

                                {/* Position badge */}
                                <text
                                    x={pos.x}
                                    y={pos.y}
                                    dy="3.5"
                                    textAnchor="middle"
                                    fill="black"
                                    fontSize={dotR > 7 ? '7' : '6'}
                                    fontWeight="900"
                                    fontFamily="monospace"
                                    pointerEvents="none"
                                >
                                    {car.pos || idx + 1}
                                </text>

                                {/* Driver label — solo para seleccionado, líder o batalla */}
                                {(isSelected || isLeader || isInBattle) && (
                                    <g transform={`translate(${pos.x}, ${pos.y - dotR - 16})`}>
                                        <rect x="-36" y="-11" width="72" height="16" rx="4" fill="rgba(0,0,0,0.85)" />
                                        <rect x="-36" y="-11" width="72" height="16" rx="4" fill="none" stroke={color} strokeWidth="0.8" opacity="0.6" />
                                        <text
                                            x="0" y="0" dy="3.5"
                                            textAnchor="middle"
                                            fill="white"
                                            fontSize="8"
                                            fontWeight="bold"
                                            fontFamily="monospace"
                                        >
                                            {(car.driver || `S${car.station_id}`).substring(0, 12).toUpperCase()}
                                        </text>
                                    </g>
                                )}
                            </g>
                        );
                    })}
                </svg>

                {/* Legend */}
                {sortedCars.length > 0 && (
                    <div className="absolute bottom-4 left-4 flex flex-col gap-1 bg-black/60 backdrop-blur border border-white/10 rounded-lg p-3">
                        <div className="text-[9px] text-white/40 uppercase tracking-widest mb-1">Leyenda</div>
                        <div className="flex items-center gap-2 text-[10px] text-white/60">
                            <div className="w-3 h-3 rounded-full border-2 border-red-400" />
                            Batalla
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-white/60">
                            <div className="w-3 h-3 rounded-full border border-yellow-400" />
                            Líder
                        </div>
                        <div className="flex items-center gap-2 text-[10px] text-white/60">
                            <div className="w-3 h-3 rounded-full border-2 border-white" />
                            Seleccionado
                        </div>
                    </div>
                )}
            </div>

            {/* ================================================================
                RIGHT SIDEBAR — Stats del piloto seleccionado
            ================================================================ */}
            <StatsPanel car={activeCar} fastestLap={fastestLap} />
        </div>
    );
};

export default LiveMapPage;
