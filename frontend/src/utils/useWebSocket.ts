import { useEffect, useRef, useCallback, useState } from 'react';

interface UseWebSocketOptions {
    url: string;
    onMessage?: (data: any) => void;
    onOpen?: () => void;
    onClose?: () => void;
    onError?: (error: Event) => void;
    reconnect?: boolean;
    reconnectInterval?: number;
    maxReconnectAttempts?: number;
}

interface UseWebSocketReturn {
    send: (data: any) => void;
    close: () => void;
    isConnected: boolean;
    reconnect: () => void;
}

export function useWebSocket({
    url,
    onMessage,
    onOpen,
    onClose,
    onError,
    reconnect = true,
    reconnectInterval = 3000,
    maxReconnectAttempts = 10,
}: UseWebSocketOptions): UseWebSocketReturn {
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectAttemptsRef = useRef(0);
    const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const [isConnected, setIsConnected] = useState(false);

    const connect = useCallback(() => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            return;
        }

        const ws = new WebSocket(url);
        wsRef.current = ws;

        ws.onopen = () => {
            setIsConnected(true);
            reconnectAttemptsRef.current = 0;
            onOpen?.();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                onMessage?.(data);
            } catch {
                onMessage?.(event.data);
            }
        };

        ws.onclose = () => {
            setIsConnected(false);
            onClose?.();

            if (reconnect && reconnectAttemptsRef.current < maxReconnectAttempts) {
                const delay = Math.min(
                    reconnectInterval * Math.pow(2, reconnectAttemptsRef.current),
                    30000
                );
                reconnectAttemptsRef.current += 1;
                
                reconnectTimeoutRef.current = setTimeout(() => {
                    connect();
                }, delay);
            }
        };

        ws.onerror = (error) => {
            onError?.(error);
        };
    }, [url, onMessage, onOpen, onClose, onError, reconnect, reconnectInterval, maxReconnectAttempts]);

    const send = useCallback((data: any) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    const close = useCallback(() => {
        if (reconnectTimeoutRef.current) {
            clearTimeout(reconnectTimeoutRef.current);
        }
        reconnectAttemptsRef.current = maxReconnectAttempts;
        wsRef.current?.close();
    }, [maxReconnectAttempts]);

    const reconnect = useCallback(() => {
        reconnectAttemptsRef.current = 0;
        close();
        connect();
    }, [close, connect]);

    useEffect(() => {
        connect();

        return () => {
            close();
        };
    }, [connect, close]);

    return { send, close, isConnected, reconnect };
}
