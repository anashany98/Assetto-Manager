import React from 'react';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, AreaChart, Area, ReferenceLine } from 'recharts';
import { Loader2, TrendingUp, TrendingDown, Minus, Gauge, Timer, Activity } from 'lucide-react';
import { API_URL } from '../config';

interface TelemetryPoint {
    t: number; // Time in ms
    s: number; // Speed in KM/H
    r: number; // RPM
    g: number; // Gear
    n: number; // Normalized Pos
    gas?: number; // Throttle 0-1
    brk?: number; // Brake 0-1
    str?: number; // Steer -1 to 1
    gl?: number; // G-Lat
    gn?: number; // G-Long
    tt?: number; // Tyre Temp
}

interface TelemetryChartProps {
    lapId: number;
    compareLapId?: number; // Optional compare
    onClose?: () => void;
}

type ChartTab = 'engine' | 'inputs' | 'physics' | 'delta' | 'sectors';

// Sector definitions (approximate for most tracks)
const SECTORS = [
    { id: 1, start: 0, end: 0.33, name: 'S1', color: '#ef4444' },
    { id: 2, start: 0.33, end: 0.66, name: 'S2', color: '#eab308' },
    { id: 3, start: 0.66, end: 1.0, name: 'S3', color: '#22c55e' },
];

export function TelemetryChart({ lapId, compareLapId }: TelemetryChartProps) {
    const [activeTab, setActiveTab] = React.useState<ChartTab>('engine');

    // Fetch Main Lap Telemetry
    const { data: mainLap, isLoading: loadingMain } = useQuery({
        queryKey: ['telemetry', lapId],
        queryFn: async () => {
            try {
                const res = await axios.get<TelemetryPoint[]>(`${API_URL}/telemetry/lap/${lapId}/telemetry`);
                return res.data;
            } catch (err) {
                console.error(`Error fetching telemetry for lap ${lapId}:`, (err as { response?: { status: number; data: unknown } })?.response?.status, (err as { response?: { status: number; data: unknown } })?.response?.data);
                throw err;
            }
        },
        enabled: !!lapId,
        retry: false
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

    // Align Data for Chart using Normalized Position (n)
    const BINS = 200;
    const chartData = Array.from({ length: BINS }, (_, i) => {
        const targetPos = i / BINS;

        // Find closest point in main lap
        const mainPoint = mainLap.reduce((prev, curr) =>
            Math.abs(curr.n - targetPos) < Math.abs(prev.n - targetPos) ? curr : prev
        );

        // Find closest point in compare lap
        const comparePoint = compareLap ? compareLap.reduce((prev, curr) =>
            Math.abs(curr.n - targetPos) < Math.abs(prev.n - targetPos) ? curr : prev
        ) : null;

        // Calculate delta (time difference at this position)
        const deltaTime = comparePoint ? (mainPoint.t - comparePoint.t) : 0;

        return {
            dist: Math.round(targetPos * 100), // 0-100%
            pos: targetPos,
            speed: mainPoint.s,
            rpm: mainPoint.r,
            gear: mainPoint.g,
            time: mainPoint.t,
            gas: mainPoint.gas || 0,
            brk: mainPoint.brk || 0,
            str: mainPoint.str || 0,
            gl: mainPoint.gl || 0,
            gn: mainPoint.gn || 0,
            tt: mainPoint.tt || 0,
            compareSpeed: comparePoint?.s ?? null,
            compareTime: comparePoint?.t ?? null,
            compareGas: comparePoint?.gas ?? null,
            compareBrk: comparePoint?.brk ?? null,
            delta: deltaTime, // in ms
            deltaSeconds: deltaTime / 1000 // in seconds for display
        };
    });

    // Calculate sector times
    const calculateSectorTime = (lap: TelemetryPoint[], sector: typeof SECTORS[0]) => {
        const sectorPoints = lap.filter(p => p.n >= sector.start && p.n < sector.end);
        if (sectorPoints.length < 2) return null;
        const startTime = sectorPoints[0].t;
        const endTime = sectorPoints[sectorPoints.length - 1].t;
        return endTime - startTime;
    };

    const mainSectorTimes = SECTORS.map(s => calculateSectorTime(mainLap, s));
    const compareSectorTimes = compareLap ? SECTORS.map(s => calculateSectorTime(compareLap, s)) : null;

    // Calculate total delta
    const totalDelta = chartData.length > 0 ? chartData[chartData.length - 1].delta : 0;
    const deltaStatus = totalDelta < 0 ? 'faster' : totalDelta > 0 ? 'slower' : 'same';



    const formatSectorTime = (ms: number | null) => {
        if (ms === null) return '--:--.---';
        const seconds = Math.floor(ms / 1000);
        const millis = ms % 1000;
        return `${seconds}.${millis.toString().padStart(3, '0')}`;
    };

    const TABS: { id: ChartTab; label: string; icon?: React.ReactNode }[] = [
        { id: 'engine', label: 'Motor' },
        { id: 'inputs', label: 'Pedales' },
        { id: 'physics', label: 'Físicas' },
        { id: 'delta', label: 'Delta' },
        { id: 'sectors', label: 'Sectores' },
    ];

    return (
        <div className="w-full flex flex-col">
            {/* Summary Stats (when comparing) */}
            {compareLap && (
                <div className="grid grid-cols-3 gap-2 mb-3">
                    <div className="bg-gray-800 rounded-lg p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Delta Total</div>
                        <div className={`text-xl font-black font-mono ${deltaStatus === 'faster' ? 'text-green-500' :
                            deltaStatus === 'slower' ? 'text-red-500' : 'text-gray-400'
                            }`}>
                            {deltaStatus === 'faster' && <TrendingDown className="inline w-4 h-4 mr-1" />}
                            {deltaStatus === 'slower' && <TrendingUp className="inline w-4 h-4 mr-1" />}
                            {deltaStatus === 'same' && <Minus className="inline w-4 h-4 mr-1" />}
                            {totalDelta >= 0 ? '+' : ''}{(totalDelta / 1000).toFixed(3)}s
                        </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Vel. Máx</div>
                        <div className="text-xl font-black text-yellow-500 font-mono">
                            <Gauge className="inline w-4 h-4 mr-1" />
                            {Math.max(...chartData.map(d => d.speed))} km/h
                        </div>
                    </div>
                    <div className="bg-gray-800 rounded-lg p-3 text-center">
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Puntos</div>
                        <div className="text-xl font-black text-blue-500 font-mono">
                            <Activity className="inline w-4 h-4 mr-1" />
                            {chartData.length}
                        </div>
                    </div>
                </div>
            )}

            {/* Tabs */}
            <div className="flex space-x-1 bg-gray-900 p-1 rounded-t-xl mb-1">
                {TABS.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex-1 py-1.5 text-[10px] uppercase font-bold rounded transition-all ${activeTab === tab.id
                            ? 'bg-blue-600 text-white'
                            : 'text-gray-500 hover:text-gray-300 hover:bg-gray-800'
                            }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            <div className="h-72 bg-gray-900/50 rounded-b-xl p-2 border border-white/5 relative">
                {/* ENGINE TAB */}
                {activeTab === 'engine' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" tickFormatter={(v) => `${v}%`} stroke="#6B7280" fontSize={10} />
                            <YAxis yAxisId="left" stroke="#9CA3AF" fontSize={10} domain={[0, 'auto']} tickFormatter={(val) => `${val}`} />
                            <YAxis yAxisId="right" orientation="right" stroke="#6B7280" fontSize={10} domain={[0, 9000]} hide />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                                itemStyle={{ color: '#F3F4F6' }}
                                labelFormatter={(v) => `Posición: ${v}%`}
                                formatter={(value: number | string, name: string) => {
                                    if (name === 'Velocidad' || name === 'Rival') return [`${Math.round(Number(value))} km/h`, name];
                                    if (name === 'RPM') return [Math.round(Number(value)), name];
                                    if (name === 'Marcha') return [`G${value}`, name];
                                    return [String(value), name];
                                }}
                            />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            {/* Gear Indicator (background area) */}
                            <Area yAxisId="left" type="stepAfter" dataKey="gear" stroke="none" fill="#374151" fillOpacity={0.2} name="Marcha" />

                            <Line yAxisId="left" type="monotone" dataKey="speed" stroke="#EAB308" strokeWidth={2} dot={false} name="Velocidad" animationDuration={500} />
                            <Line yAxisId="right" type="monotone" dataKey="rpm" stroke="#ef4444" strokeWidth={1} dot={false} strokeOpacity={0.5} name="RPM" animationDuration={500} />
                            {compareLap && <Line yAxisId="left" type="monotone" dataKey="compareSpeed" stroke="#3B82F6" strokeWidth={2} dot={false} strokeDasharray="5 5" name="Rival" animationDuration={500} />}
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* INPUTS TAB */}
                {activeTab === 'inputs' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" tickFormatter={(v) => `${v}%`} stroke="#6B7280" fontSize={10} />
                            <YAxis stroke="#9CA3AF" fontSize={10} domain={[0, 1]} tickFormatter={(val) => `${Math.round(val * 100)}%`} />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#F3F4F6' }} labelFormatter={(v) => `Posición: ${v}%`} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            <Line type="monotone" dataKey="gas" stroke="#22c55e" strokeWidth={2} dot={false} name="Acelerador" animationDuration={500} />
                            <Line type="monotone" dataKey="brk" stroke="#ef4444" strokeWidth={2} dot={false} name="Freno" animationDuration={500} />
                            {compareLap && (
                                <>
                                    <Line type="monotone" dataKey="compareGas" stroke="#22c55e" strokeWidth={1} dot={false} strokeOpacity={0.4} strokeDasharray="3 3" name="Ace. Rival" animationDuration={500} />
                                    <Line type="monotone" dataKey="compareBrk" stroke="#ef4444" strokeWidth={1} dot={false} strokeOpacity={0.4} strokeDasharray="3 3" name="Fre. Rival" animationDuration={500} />
                                </>
                            )}
                            <Line type="monotone" dataKey="str" stroke="#3b82f6" strokeWidth={1} dot={false} strokeDasharray="3 3" name="Volante" animationDuration={500} />
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* PHYSICS TAB */}
                {activeTab === 'physics' && (
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={chartData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                            <XAxis dataKey="dist" tickFormatter={(v) => `${v}%`} stroke="#6B7280" fontSize={10} />
                            <YAxis yAxisId="g" stroke="#9CA3AF" fontSize={10} domain={[-3, 3]} label={{ value: 'G-Force', angle: -90, position: 'insideLeft', fill: '#6B7280', fontSize: 10 }} />
                            <YAxis yAxisId="temp" orientation="right" stroke="#f97316" fontSize={10} domain={[20, 150]} hide />
                            <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }} itemStyle={{ color: '#F3F4F6' }} labelFormatter={(v) => `Posición: ${v}%`} />
                            <Legend iconSize={8} wrapperStyle={{ fontSize: '10px' }} />

                            <Line yAxisId="g" type="monotone" dataKey="gl" stroke="#f472b6" strokeWidth={2} dot={false} name="G-Lateral" animationDuration={500} />
                            <Line yAxisId="g" type="monotone" dataKey="gn" stroke="#a78bfa" strokeWidth={2} dot={false} name="G-Long" animationDuration={500} />
                            <Line yAxisId="temp" type="monotone" dataKey="tt" stroke="#f97316" strokeWidth={2} dot={false} strokeDasharray="2 2" name="Temp. Goma" animationDuration={500} />
                        </LineChart>
                    </ResponsiveContainer>
                )}

                {/* DELTA TAB */}
                {activeTab === 'delta' && (
                    <>
                        {!compareLap ? (
                            <div className="h-full flex items-center justify-center text-gray-500">
                                <div className="text-center">
                                    <Timer size={32} className="mx-auto mb-2 opacity-50" />
                                    <p className="text-xs uppercase font-bold">Selecciona una vuelta rival</p>
                                    <p className="text-[10px] mt-1">Para ver el delta de tiempo</p>
                                </div>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData}>
                                    <defs>
                                        <linearGradient id="deltaPositive" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ef4444" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="deltaNegative" x1="0" y1="1" x2="0" y2="0">
                                            <stop offset="5%" stopColor="#22c55e" stopOpacity={0.8} />
                                            <stop offset="95%" stopColor="#22c55e" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                                    <XAxis dataKey="dist" tickFormatter={(v) => `${v}%`} stroke="#6B7280" fontSize={10} />
                                    <YAxis
                                        stroke="#9CA3AF"
                                        fontSize={10}
                                        domain={['auto', 'auto']}
                                        tickFormatter={(v) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}s`}
                                    />
                                    <ReferenceLine y={0} stroke="#6B7280" strokeDasharray="3 3" />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '8px', fontSize: '12px' }}
                                        itemStyle={{ color: '#F3F4F6' }}
                                        labelFormatter={(v) => `Posición: ${v}%`}
                                        formatter={(value: number | string | undefined) => [`${Number(value ?? 0) >= 0 ? '+' : ''}${Number(value ?? 0).toFixed(3)}s`, 'Delta']}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="deltaSeconds"
                                        stroke="#6b7280"
                                        fill="url(#deltaPositive)"
                                        strokeWidth={2}
                                        animationDuration={500}
                                        name="Delta"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        )}
                    </>
                )}

                {/* SECTORS TAB */}
                {activeTab === 'sectors' && (
                    <div className="h-full flex flex-col">
                        <div className="grid grid-cols-3 gap-3 flex-1">
                            {SECTORS.map((sector, idx) => {
                                const mainTime = mainSectorTimes[idx];
                                const compareTime = compareSectorTimes?.[idx];
                                const diff = mainTime && compareTime ? mainTime - compareTime : null;
                                const isFaster = diff !== null && diff < 0;
                                const isSlower = diff !== null && diff > 0;

                                return (
                                    <div
                                        key={sector.id}
                                        className="bg-gray-800 rounded-xl p-4 flex flex-col items-center justify-center border-t-4"
                                        style={{ borderColor: sector.color }}
                                    >
                                        <div className="text-2xl font-black text-white mb-1">{sector.name}</div>
                                        <div className="text-xl font-mono font-bold text-gray-200">
                                            {formatSectorTime(mainTime)}
                                        </div>
                                        {compareTime && (
                                            <div className={`text-sm font-mono font-bold mt-2 ${isFaster ? 'text-green-500' : isSlower ? 'text-red-500' : 'text-gray-500'
                                                }`}>
                                                {isFaster && <TrendingDown className="inline w-3 h-3 mr-1" />}
                                                {isSlower && <TrendingUp className="inline w-3 h-3 mr-1" />}
                                                {diff !== null && (diff >= 0 ? '+' : '')}{(diff! / 1000).toFixed(3)}s
                                            </div>
                                        )}
                                        {!compareTime && compareLap && (
                                            <div className="text-[10px] text-gray-600 mt-2">Sin datos rival</div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Sector Timeline Visual */}
                        <div className="mt-4 h-8 flex rounded-lg overflow-hidden">
                            {SECTORS.map((sector) => (
                                <div
                                    key={sector.id}
                                    className="flex-1 flex items-center justify-center text-xs font-bold text-white/80"
                                    style={{ backgroundColor: sector.color }}
                                >
                                    {sector.name}
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
