import { useState, useEffect, useRef } from 'react';
import { WS_BASE_URL } from '../config';
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
    steer?: number;
    g_lat?: number;
    g_lon?: number;
    tyre_temp?: number;
    x?: number;
    y?: number;
    z?: number;
    timestamp?: number;
}

export const useTelemetry = () => {
    const [liveCars, setLiveCars] = useState<Record<string, TelemetryPacket>>({});
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);
    const reconnectTimeout = useRef<number | null>(null);

    useEffect(() => {
        const wsUrl = `${WS_BASE_URL || `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`}/ws/telemetry/client`;

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

            socket.onerror = (_error) => {
                // Error log usually followed by onclose
                console.error("Telemetry: Connection Error");
            };

            socket.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'telemetry' && data.station_id) {
                        setLiveCars(prev => ({
                            ...prev,
                            [data.station_id]: { ...data, timestamp: Date.now() }
                        }));
                    }
                } catch (e) {
                    // Silently ignore parse errors
                }
            };
        };

        connect();

        return () => {
            if (reconnectTimeout.current) window.clearTimeout(reconnectTimeout.current);
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
    }, []);

    return { liveCars, isConnected };
};
