import { useState, useEffect, useRef } from 'react';
import { PUBLIC_WS_TOKEN, WS_BASE_URL } from '../config';
// import { getEvents, createEvent } from '../api/events';     
// import type { Event } from '../types';


export interface TelemetryPacket {
    station_id: string;
    speed_kmh: number;
    rpm: number;
    gear: number;
    lap_time_ms: number;
    laps: number;
    pos: number;
    car: string;
    track: string;
    driver: string;
    normalized_pos: number;
    gas?: number;
    brake?: number;
    win_count?: number;
    total_laps?: number;
    // Environment
    track_temp?: number;
    air_temp?: number;
    steer?: number;
    g_lat?: number;
    g_lon?: number;
    tyre_temp?: number[];
    x?: number;
    y?: number;
    z?: number;
    // Car Status
    engine_temp?: number;
    fuel?: number;
    damage?: number[];
}

export const useTelemetry = () => {
    const [liveCars, setLiveCars] = useState<Record<string, TelemetryPacket>>({});
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<number | null>(null);
    const latestDataRef = useRef<Record<string, TelemetryPacket>>({});

    // Global Demo Mode Check
    const isDemo = new URLSearchParams(window.location.search).get('demo') === 'true';

    useEffect(() => {
        if (isDemo) {
            console.log("🏎️ Demo Mode: Starting Telemetry Simulation");
            setIsConnected(true);

            // Initialize Demo Cars
            const demoCars: Record<string, TelemetryPacket> = {};
            // Using a hardcoded list here to avoid circular dependencies or import issues if simple
            // But ideally import DEMO_DRIVERS. For now, I'll generate on the fly or just use a few hardcoded ones.
            const drivers = [
                { name: "Max Verstappen", car: "Red Bull RB19", station: "1" },
                { name: "Lando Norris", car: "McLaren MCL60", station: "2" },
                { name: "Fernando Alonso", car: "Aston Martin AMR23", station: "3" },
                { name: "Lewis Hamilton", car: "Mercedes W14", station: "4" }
            ];

            drivers.forEach((d, i) => {
                demoCars[d.station || String(i + 1)] = {
                    station_id: d.station || String(i + 1),
                    speed_kmh: 200 + Math.random() * 100,
                    rpm: 10000,
                    gear: 7,
                    lap_time_ms: 85000,
                    laps: 5,
                    pos: i + 1,
                    car: d.car,
                    track: 'Monza',
                    driver: d.name,
                    normalized_pos: i * 0.2, // Spread them out
                    gas: 1,
                    brake: 0
                };
            });
            setLiveCars(demoCars);

            // Simulation Loop
            const interval = setInterval(() => {
                setLiveCars(prev => {
                    const next = { ...prev };
                    Object.keys(next).forEach(key => {
                        const car = next[key];
                        // Move car
                        let newPos = (car.normalized_pos || 0) + 0.002; // Simple constant speed
                        if (newPos > 1) newPos -= 1;

                        // Vary speed
                        const newSpeed = 200 + Math.sin(Date.now() / 1000 + Number(key)) * 50;

                        next[key] = {
                            ...car,
                            normalized_pos: newPos,
                            speed_kmh: newSpeed,
                            rpm: 8000 + (newSpeed * 20),
                            gear: Math.min(8, Math.max(2, Math.floor(newSpeed / 40)))
                        };
                    });
                    return next;
                });
            }, 50); // 20fps updates

            return () => clearInterval(interval);
        }

        // Live WebSocket Logic (Original)
        const token = localStorage.getItem('token') || PUBLIC_WS_TOKEN;
        const tokenParam = token ? `?token=${encodeURIComponent(token)}` : '';
        const wsUrl = `${WS_BASE_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`}/ws/telemetry/client${tokenParam}`;

        const connect = () => {
            if (reconnectTimeout.current) clearTimeout(reconnectTimeout.current);

            // Connecting...
            const socket = new WebSocket(wsUrl);
            ws.current = socket;

            socket.onopen = () => {
                // Connected
                setIsConnected(true);
            };

            socket.onclose = (event) => {
                setIsConnected(false);
                if (event.code !== 1000) {
                    console.warn(`Telemetry: Closed (${event.code}). Retrying...`);
                    reconnectTimeout.current = window.setTimeout(connect, 3000);
                }
            };

            socket.onerror = () => {
                // Error log usually followed by onclose
                console.error("Telemetry: Connection Error");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'telemetry' && data.station_id) {
                        // Update the ref immediately
                        latestDataRef.current = {
                            ...latestDataRef.current,
                            [data.station_id]: { ...data, timestamp: Date.now() }
                        };
                    }
                } catch {
                    // Silently ignore parse errors
                }
            };
        };

        connect();

        // Animation Loop for batching state updates (approx 60fps or synced to monitor)
        let animationFrameId: number;
        const updateLoop = () => {
            if (latestDataRef.current) {
                setLiveCars(prev => {
                    // Only update if there's actually new data to avoid wasted renders
                    // (Simple check: referential equality check implies we won't update if we just pass the same object unless we clone. 
                    // But here we want to capture the latest ref state).
                    // To avoid *constant* setting even if nothing changed, checking timestamp or similar would be ideal.
                    // However, we are mutating the ref content. 
                    // Let's just clone the ref content into state.
                    return { ...latestDataRef.current };
                });
            }
            animationFrameId = requestAnimationFrame(updateLoop);
        };
        animationFrameId = requestAnimationFrame(updateLoop);

        return () => {
            if (reconnectTimeout.current) window.clearTimeout(reconnectTimeout.current);
            cancelAnimationFrame(animationFrameId);
            if (ws.current) {
                // Prevent "closed before established" warnings by ignoring the onclose handler if closing manually
                ws.current.onclose = null;
                ws.current.onerror = null;

                // Only close if it's not already closed or closing
                if (ws.current.readyState === WebSocket.OPEN || ws.current.readyState === WebSocket.CONNECTING) {
                    ws.current.close();
                }
                ws.current = null;
            }
        };
    }, [isDemo]); // Re-run if demo mode changes (though usually page reload)

    return { liveCars, isConnected };
};
