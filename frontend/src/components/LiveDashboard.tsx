import { useState } from 'react';
import type { TelemetryPacket } from '../hooks/useTelemetry';
import { Disc, Map } from 'lucide-react';
import { cn } from '../lib/utils';
import { LiveMap } from './LiveMap';

interface LiveDashboardProps {
    data: TelemetryPacket;
    isActive: boolean;
    variant?: 'overlay' | 'inline';
}

export const LiveDashboard = ({ data, isActive, variant = 'overlay' }: LiveDashboardProps) => {
    const [showMap, setShowMap] = useState(false);
    if (!isActive) return null;

    // Normalize data (safe defaults)
    const gas = data.gas || 0;
    const brake = data.brake || 0;
    const steer = data.steer || 0;
    const gLat = data.g_lat || 0;
    const gLon = data.g_lon || 0;
    const tyreTemp = data.tyre_temp || 0;

    const steerRot = steer * 90;

    // Base classes based on variant
    const containerClasses = variant === 'overlay'
        ? "fixed bottom-20 left-4 right-4 bg-black/90 backdrop-blur-md rounded-2xl border border-white/10 p-4 shadow-2xl z-50 animate-in slide-in-from-bottom-10 fade-in duration-300"
        : "bg-gray-800/50 rounded-2xl border border-white/5 p-4 mb-3";

    return (
        <div className={containerClasses}>
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center space-x-2">
                    <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                    <span className="text-[10px] uppercase font-bold text-gray-400 tracking-widest">
                        {variant === 'inline' ? 'Telemetría' : 'Live Telemetry'}
                    </span>
                    {variant === 'inline' && (
                        <span className="text-xs font-black text-white italic ml-2">{data.driver}</span>
                    )}
                </div>
                <div className="text-right flex items-center space-x-2">
                    {/* Only show map toggle in overlay mode, or if implemented for inline later */}
                    {variant === 'overlay' && (
                        <button
                            onClick={() => setShowMap(!showMap)}
                            className={cn(
                                "p-1 rounded bg-gray-800 hover:bg-gray-700 transition-colors",
                                showMap ? "text-yellow-500" : "text-gray-400"
                            )}
                        >
                            <Map size={14} />
                        </button>
                    )}
                    {variant === 'overlay' && <div className="text-xs font-mono text-gray-400">{data.driver}</div>}
                </div>
            </div>

            {variant === 'overlay' && showMap ? (
                <div className="h-40 mb-2">
                    <LiveMap cars={[data]} trackName={data.track} />
                </div>
            ) : (
                <div className="grid grid-cols-4 gap-2 h-24">
                    {/* 1. Pedals */}
                    <div className="col-span-1 bg-gray-900 rounded-lg p-2 flex space-x-2 justify-center items-end relative overflow-hidden border border-white/5">
                        {/* Brake */}
                        <div className="w-4 bg-gray-800 rounded-sm h-full relative overflow-hidden">
                            <div
                                className="absolute bottom-0 left-0 right-0 bg-red-500 transition-all duration-100 ease-out"
                                style={{ height: `${brake * 100}%` }}
                            />
                        </div>
                        {/* Gas */}
                        <div className="w-4 bg-gray-800 rounded-sm h-full relative overflow-hidden">
                            <div
                                className="absolute bottom-0 left-0 right-0 bg-green-500 transition-all duration-100 ease-out"
                                style={{ height: `${gas * 100}%` }}
                            />
                        </div>
                        <div className="absolute top-1 left-0 right-0 text-center text-[8px] font-bold text-gray-500 uppercase">Input</div>
                    </div>

                    {/* 2. Steering */}
                    <div className="col-span-1 bg-gray-900 rounded-lg flex items-center justify-center relative border border-white/5">
                        <Disc
                            size={40}
                            className="text-gray-400 transition-transform duration-100 ease-out"
                            style={{ transform: `rotate(${steerRot}deg)` }}
                            strokeWidth={1.5}
                        />
                        <div className="absolute w-1 h-3 bg-blue-500 top-6 rounded-full" style={{ transform: `rotate(${steerRot}deg) translateY(-16px)` }} />
                        <div className="absolute bottom-1 text-[8px] font-bold text-gray-500 uppercase">Steer</div>
                    </div>

                    {/* 3. G-Force */}
                    <div className="col-span-1 bg-gray-900 rounded-lg relative flex items-center justify-center border border-white/5">
                        <div className="absolute inset-2 border rounded-full border-gray-700 opacity-50" />
                        <div className="absolute w-full h-[1px] bg-gray-800" />
                        <div className="absolute h-full w-[1px] bg-gray-800" />
                        <div
                            className="w-2.5 h-2.5 bg-yellow-400 rounded-full shadow-[0_0_8px_rgba(250,204,21,0.6)] absolute transition-all duration-100 ease-out"
                            style={{
                                transform: `translate(${gLat * 10}px, ${-gLon * 10}px)`
                            }}
                        />
                        <div className="absolute bottom-1 text-[8px] font-bold text-gray-500 uppercase">G-Force</div>
                    </div>

                    {/* 4. Tyre Temp */}
                    <div className="col-span-1 bg-gray-900 rounded-lg flex flex-col items-center justify-center relative border border-white/5">
                        <div className="text-2xl font-black text-white italic">
                            {Math.round(tyreTemp)}
                            <span className="text-[10px] text-gray-500 font-normal ml-0.5">°C</span>
                        </div>
                        <div className="text-[8px] font-bold text-gray-500 uppercase mt-1">Tyres</div>
                        <div
                            className={cn(
                                "absolute inset-0 bg-gradient-to-t from-transparent to-transparent opacity-20 transition-colors duration-500",
                                tyreTemp < 60 ? "from-blue-500" : tyreTemp > 100 ? "from-red-500" : "from-green-500"
                            )}
                        />
                    </div>
                </div>
            )}

            {/* Speed & Gear (Mini) */}
            <div className="mt-2 flex items-center justify-between px-2">
                <div className="flex items-baseline space-x-1">
                    <span className="text-2xl font-bold text-white">{Math.round(data.speed_kmh)}</span>
                    <span className="text-xs text-gray-500 font-bold">KMH</span>
                </div>
                <div className="flex items-center space-x-3">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{data.car}</span>
                    <div className="w-8 h-8 rounded bg-gray-800 flex items-center justify-center text-xl font-bold text-yellow-500 border border-gray-700">
                        {data.gear === 0 ? 'R' : data.gear === 1 ? 'N' : data.gear - 1}
                    </div>
                </div>
            </div>
        </div>
    );
};
