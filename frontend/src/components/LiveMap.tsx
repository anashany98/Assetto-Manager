import React, { useRef, useEffect, useState } from 'react';
import type { TelemetryPacket } from '../hooks/useTelemetry';
import { Activity, X } from 'lucide-react';

interface LiveMapProps {
    cars: TelemetryPacket[];
    trackName: string;
}

interface Point {
    x: number;
    z: number;
}

interface ScreenCar {
    cx: number;
    cy: number;
    station_id: string;
}

export const LiveMap: React.FC<LiveMapProps> = ({ cars, trackName }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [pathPoints, setPathPoints] = useState<Point[]>([]);
    const [lastTrack, setLastTrack] = useState<string>(trackName);
    const [selectedCarId, setSelectedCarId] = useState<string | null>(null);
    const screenCars = useRef<ScreenCar[]>([]); // Store screen positions for click detection

    useEffect(() => {
        if (trackName !== lastTrack) {
            setPathPoints([]);
            setLastTrack(trackName);
        }
    }, [trackName, lastTrack]);

    useEffect(() => {
        // Update path from all cars
        cars.forEach(car => {
            if (car.x !== undefined && car.z !== undefined) {
                setPathPoints(prev => {
                    const last = prev[prev.length - 1];
                    if (!last) return [...prev, { x: car.x!, z: car.z! }];

                    const dist = Math.sqrt(Math.pow(last.x - car.x!, 2) + Math.pow(last.z - car.z!, 2));
                    if (dist > 5) { // 5m filter
                        if (prev.length > 5000) {
                            return [...prev.slice(1), { x: car.x!, z: car.z! }];
                        }
                        return [...prev, { x: car.x!, z: car.z! }];
                    }
                    return prev;
                });
            }
        });
    }, [cars]);

    // Draw Loop
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111827';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Auto Scale
        let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;

        pathPoints.forEach(p => {
            if (p.x < minX) minX = p.x;
            if (p.x > maxX) maxX = p.x;
            if (p.z < minZ) minZ = p.z;
            if (p.z > maxZ) maxZ = p.z;
        });

        // Also consider current car positions for bounds
        cars.forEach(c => {
            if (c.x !== undefined && c.z !== undefined) {
                if (c.x < minX) minX = c.x;
                if (c.x > maxX) maxX = c.x;
                if (c.z < minZ) minZ = c.z;
                if (c.z > maxZ) maxZ = c.z;
            }
        });

        if (minX === Infinity) {
            ctx.fillStyle = '#6B7280';
            ctx.font = '10px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText("Esperando coches...", canvas.width / 2, canvas.height / 2);
            return;
        }

        const padding = 20;
        const width = maxX - minX || 1;
        const height = maxZ - minZ || 1;

        const canvasRatio = canvas.width / canvas.height;
        const trackRatio = width / height;

        let scale = 1;
        if (trackRatio > canvasRatio) {
            scale = (canvas.width - padding * 2) / width;
        } else {
            scale = (canvas.height - padding * 2) / height;
        }

        const transformX = (x: number) => (x - minX) * scale + padding + (canvas.width - padding * 2 - width * scale) / 2;
        const transformZ = (z: number) => (z - minZ) * scale + padding + (canvas.height - padding * 2 - height * scale) / 2;

        // Draw Track Path
        if (pathPoints.length > 1) {
            ctx.beginPath();
            ctx.strokeStyle = '#374151';
            ctx.lineWidth = 3;
            ctx.lineJoin = 'round';
            ctx.lineCap = 'round';

            pathPoints.forEach((p, i) => {
                const cx = transformX(p.x);
                const cy = transformZ(p.z);
                if (i === 0) ctx.moveTo(cx, cy);
                else ctx.lineTo(cx, cy);
            });
            ctx.stroke();
        }

        // Draw Cars
        screenCars.current = []; // Clear current frame cars
        cars.forEach((car, index) => {
            if (car.x !== undefined && car.z !== undefined) {
                const cx = transformX(car.x);
                const cy = transformZ(car.z);

                // Save for click detection
                screenCars.current.push({ cx, cy, station_id: car.station_id });

                // Colors
                const colors = ['#EAB308', '#EF4444', '#3B82F6', '#22C55E', '#A855F7'];
                const color = colors[index % colors.length];

                // Selected Halo
                if (selectedCarId === car.station_id) {
                    ctx.beginPath();
                    ctx.strokeStyle = '#FFF';
                    ctx.lineWidth = 1;
                    ctx.setLineDash([2, 2]);
                    ctx.arc(cx, cy, 12, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }

                // Dot
                ctx.beginPath();
                ctx.fillStyle = color;
                ctx.arc(cx, cy, 5, 0, Math.PI * 2);
                ctx.fill();

                // Ring
                ctx.beginPath();
                ctx.strokeStyle = '#FFF';
                ctx.lineWidth = 1.5;
                ctx.arc(cx, cy, 7, 0, Math.PI * 2);
                ctx.stroke();

                // Name
                ctx.fillStyle = '#FFF';
                ctx.font = 'bold 12px sans-serif'; // Bigger font
                ctx.textAlign = 'center';
                ctx.shadowColor = 'black';
                ctx.shadowBlur = 4;
                ctx.fillText(car.driver || 'Driver', cx, cy - 12);
                ctx.shadowBlur = 0;
            }
        });

    }, [pathPoints, cars, selectedCarId]);

    const handleCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const rect = canvasRef.current?.getBoundingClientRect();
        if (!rect) return;
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        // Find clicked car
        const clicked = screenCars.current.find(c => {
            const dist = Math.sqrt(Math.pow(c.cx - x, 2) + Math.pow(c.cy - y, 2));
            return dist < 20; // 20px hit radius
        });

        if (clicked) {
            setSelectedCarId(clicked.station_id);
        } else {
            // Click background to deselect
            setSelectedCarId(null);
        }
    };

    const selectedCar = cars.find(c => c.station_id === selectedCarId);

    return (
        <div className="w-full h-full relative rounded-lg overflow-hidden border border-white/5 bg-gray-900 shadow-2xl">
            <canvas
                ref={canvasRef}
                width={800} // Higher res
                height={600}
                className="w-full h-full object-contain cursor-crosshair"
                onClick={handleCanvasClick}
            />

            {/* Overlay Info */}
            <div className="absolute top-4 left-4 flex gap-4 pointer-events-none">
                <div className="bg-black/80 backdrop-blur-md px-3 py-1.5 rounded-lg border border-white/10 text-xs text-gray-400 font-mono flex items-center gap-2">
                    <Activity size={12} className="text-green-500 animate-pulse" />
                    LIVE DATA
                </div>
            </div>

            {/* Telemetry Card */}
            {selectedCar && (
                <div className="absolute top-4 right-4 w-64 bg-black/90 backdrop-blur-xl rounded-xl border border-white/10 p-4 shadow-2xl animate-in slide-in-from-right-4">
                    <div className="flex justify-between items-start mb-4 border-b border-white/10 pb-3">
                        <div>
                            <h3 className="text-white font-bold text-lg leading-none">{selectedCar.driver}</h3>
                            <p className="text-gray-400 text-xs mt-1 truncate max-w-[150px]">{selectedCar.car}</p>
                        </div>
                        <button
                            onClick={() => setSelectedCarId(null)}
                            className="text-gray-500 hover:text-white transition-colors"
                        >
                            <X size={16} />
                        </button>
                    </div>

                    <div className="grid grid-cols-2 gap-4 mb-4">
                        <div className="bg-gray-800/50 p-2 rounded-lg text-center">
                            <div className="text-gray-500 text-[10px] uppercase font-bold">Velocidad</div>
                            <div className="text-2xl font-black text-white font-mono leading-none my-1">
                                {Math.round(selectedCar.speed_kmh)}
                            </div>
                            <div className="text-gray-500 text-[10px]">km/h</div>
                        </div>
                        <div className="bg-gray-800/50 p-2 rounded-lg text-center relative overflow-hidden">
                            <div className="text-gray-500 text-[10px] uppercase font-bold">Marcha</div>
                            <div className="text-3xl font-black text-yellow-500 font-mono leading-none my-1">
                                {selectedCar.gear === 0 ? 'R' : selectedCar.gear === 1 ? 'N' : selectedCar.gear - 1}
                            </div>
                            {/* RPM Bar background */}
                            <div
                                className="absolute bottom-0 left-0 h-1 bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all duration-75"
                                style={{ width: `${Math.min(100, (selectedCar.rpm / 8000) * 100)}%` }}
                            />
                        </div>
                    </div>

                    <div className="space-y-2">
                        {/* RPM */}
                        <div className="flex justify-between text-[10px] text-gray-400 uppercase font-bold mb-1">
                            <span>RPM</span>
                            <span>{Math.round(selectedCar.rpm)}</span>
                        </div>
                        <div className="h-2 bg-gray-800 rounded-full overflow-hidden">
                            <div
                                className="h-full bg-blue-500 transition-all duration-75 ease-out"
                                style={{ width: `${Math.min(100, (selectedCar.rpm / 8500) * 100)}%` }}
                            />
                        </div>

                        {/* Throttle */}
                        <div className="flex items-center gap-2 mt-3">
                            <span className="text-[10px] font-bold text-gray-500 w-8">GAS</span>
                            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-green-500 transition-all duration-75 ease-out"
                                    style={{ width: `${(selectedCar.gas || 0) * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Brake */}
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold text-gray-500 w-8">FRE</span>
                            <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-red-500 transition-all duration-75 ease-out"
                                    style={{ width: `${(selectedCar.brake || 0) * 100}%` }}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="mt-4 pt-3 border-t border-white/10 flex justify-between items-center">
                        <div className="text-[10px] text-gray-500">
                            V. actual: <span className="text-white font-mono">{selectedCar.lap_time_ms ? (selectedCar.lap_time_ms / 1000).toFixed(1) : '0.0'}s</span>
                        </div>
                        <div className="text-[10px] text-gray-500">
                            Pos: <span className="text-yellow-500 font-bold">P{selectedCar.pos}</span>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
