import { useState, useEffect, useRef } from 'react';
import { API_URL } from '../api/stations';

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
}

export const useTelemetry = () => {
    const [liveCars, setLiveCars] = useState<Record<string, TelemetryPacket>>({});
    const [isConnected, setIsConnected] = useState(false);
    const ws = useRef<WebSocket | null>(null);

    useEffect(() => {
        // Construct WS URL from API_URL
        // Remove trailing slash if exists
        const baseUrl = API_URL.replace(/\/$/, "");
        const wsUrl = baseUrl.replace("http", "ws") + "/ws/telemetry/client";

        const connect = () => {
            console.log("Connecting to Telemetry WS:", wsUrl);
            ws.current = new WebSocket(wsUrl);

            ws.current.onopen = () => {
                console.log("Telemetry WS Open");
                setIsConnected(true);
            };

            ws.current.onclose = () => {
                console.log("Telemetry WS Closed");
                setIsConnected(false);
                // Reconnect after delay
                setTimeout(connect, 3000);
            };

            ws.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'telemetry') {
                        setLiveCars(prev => ({
                            ...prev,
                            [data.station_id]: data
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
