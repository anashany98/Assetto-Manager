import { API_URL } from '../config';

export interface LogEntry {
    timestamp: string;
    level: 'info' | 'warn' | 'error' | 'debug';
    source: string;
    message: string;
    data?: any;
}

class KioskLogger {
    private logs: LogEntry[] = [];
    private maxLogs = 100;
    private apiUrl: string;

    constructor() {
        this.apiUrl = API_URL;
    }

    private createEntry(level: LogEntry['level'], source: string, message: string, data?: any): LogEntry {
        return {
            timestamp: new Date().toISOString(),
            level,
            source,
            message,
            data
        };
    }

    private addLog(entry: LogEntry) {
        this.logs.push(entry);
        if (this.logs.length > this.maxLogs) {
            this.logs.shift();
        }
        console.log(`[KIOSK-${entry.level.toUpperCase()}] ${entry.source}: ${entry.message}`, entry.data || '');
    }

    info(source: string, message: string, data?: any) {
        const entry = this.createEntry('info', source, message, data);
        this.addLog(entry);
    }

    warn(source: string, message: string, data?: any) {
        const entry = this.createEntry('warn', source, message, data);
        this.addLog(entry);
    }

    error(source: string, message: string, data?: any) {
        const entry = this.createEntry('error', source, message, data);
        this.addLog(entry);
    }

    debug(source: string, message: string, data?: any) {
        if (import.meta.env.DEV) {
            const entry = this.createEntry('debug', source, message, data);
            this.addLog(entry);
        }
    }

    getLogs(): LogEntry[] {
        return [...this.logs];
    }

    clearLogs() {
        this.logs = [];
    }

    async sendToServer() {
        if (this.logs.length === 0) return;
        try {
            await fetch(`${this.apiUrl}/logs/kiosk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ logs: this.logs })
            });
        } catch (e) {
            console.error('[KIOSK-LOGGER] Failed to send logs to server:', e);
        }
    }
}

export const kioskLogger = new KioskLogger();
