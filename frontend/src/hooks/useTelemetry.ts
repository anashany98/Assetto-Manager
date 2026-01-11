import { useState, useEffect, useRef } from 'react';


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

    useEffect(() => {
        // Dynamic WS URL logic
        const isSecure = window.location.protocol === 'https:';
        const isLocal = window.location.hostname === 'localhost';

        let wsUrl = '';

        if (isLocal) {
            wsUrl = `ws://${window.location.hostname}:8000/ws/telemetry/client`;
        } else {
            // Remote (Tunnel)
            // Force WSS if page is loaded via HTTPS (which localtunnel is)
            const protocol = isSecure ? 'wss' : 'ws';
            // Must use the BACKEND tunnel URL here
            wsUrl = `${protocol}://khaki-donkeys-share.loca.lt/ws/telemetry/client`;
        }

        const connect = () => {
            console.log("Connecting to Telemetry WS:", wsUrl);
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log("Telemetry WS Open");
                setIsConnected(true);
            };

            ws.current.onclose = (event) => {
                console.log("Telemetry WS Closed", event.code, event.reason);
                setIsConnected(false);
                // Reconnect after delay
                setTimeout(connect, 3000);
            };

            ws.current.onerror = (error) => {
                console.error("Telemetry WS Error:", error);
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'telemetry') {
                        setLiveCars(prev => ({
                            ...prev,
                            [data.station_id]: { ...data, timestamp: Date.now() }
                        }));
                    }
                } catch (e) {
                    console.error("WS Parse Error", e);
                }
            };
        };

        connect();

        return () => {
            if (ws.current) {
                ws.current.close();
            }
        };
    }, []);

    return { liveCars, isConnected };
};
