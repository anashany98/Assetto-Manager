import { useState, useEffect } from 'react';
import { Monitor, Play, Square, RefreshCw, WifiOff, Tv, Settings, Gauge, Activity, Sparkles } from 'lucide-react';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { useTelemetry } from '../hooks/useTelemetry';
import StreamPlayer from '../components/StreamPlayer';
import { DEMO_STATIONS } from '../data/demoData';
import { parseApiError } from '../lib/apiError';

interface Station {
    id: number;
    name: string;
    ip_address: string;
    is_streaming: boolean;
    stream_url: string | null;
}

export default function TVSpectator() {
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const [streaming, setStreaming] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [showOverlay, setShowOverlay] = useState(true);

    // Initialize Demo Mode from URL
    const [demoMode, setDemoMode] = useState(() => new URLSearchParams(window.location.search).get('demo') === 'true');

    // Get live telemetry (Handles both Real and Demo via global hook)
    const { liveCars } = useTelemetry();

    // Get telemetry for selected station
    const telemetry = selectedStation && liveCars[selectedStation.id?.toString()]
        ? liveCars[selectedStation.id.toString()]
        : null;

    useEffect(() => {
        fetchStations();
        const interval = setInterval(fetchStations, 5000);
        return () => clearInterval(interval);
    }, [demoMode]); // Re-fetch if demo mode toggles

    const fetchStations = async () => {
        setError('');
        if (demoMode) {
            setStations(DEMO_STATIONS as Station[]);
            return;
        }
        try {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            const res = await axios.get(`${API_URL}/spectator/stations`, { headers });
            setStations(res.data);
        } catch (err) {
            console.error('Error fetching stations:', err);
            setError(parseApiError(err, 'Error al cargar simuladores.'));
        }
    };

    const startStream = async (station: Station) => {
        if (demoMode) {
            setSelectedStation(station);
            setStreaming(true);
            return;
        }

        setLoading(true);
        setError('');
        try {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            await axios.post(`${API_URL}/spectator/${station.id}/start`, null, { headers });
            setSelectedStation(station);
            setStreaming(true);
        } catch (err: unknown) {
            setError(parseApiError(err, 'Error al iniciar stream'));
        } finally {
            setLoading(false);
        }
    };

    const stopStream = async () => {
        if (!selectedStation) return;

        if (demoMode) {
            setStreaming(false);
            return;
        }

        setLoading(true);
        try {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            await axios.post(`${API_URL}/spectator/${selectedStation.id}/stop`, null, { headers });
            setStreaming(false);
        } catch (err: unknown) {
            setError(parseApiError(err, 'Error al detener stream'));
        } finally {
            setLoading(false);
        }
    };

    const formatLapTime = (ms: number) => {
        if (!ms) return '--:--.---';
        const min = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const mils = ms % 1000;
        return `${min}:${sec.toString().padStart(2, '0')}.${mils.toString().padStart(3, '0')}`;
    };

    return (
        <div className="min-h-screen bg-black text-white">
            {/* Header */}
            <div className="bg-gray-900/80 backdrop-blur border-b border-gray-800 p-4">
                <div className="flex items-center justify-between max-w-7xl mx-auto">
                    <div className="flex items-center gap-3">
                        <Tv className="text-blue-400" size={28} />
                        <h1 className="text-2xl font-bold">Modo Espectador</h1>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Demo Mode Toggle */}
                        <button
                            onClick={() => setDemoMode(!demoMode)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${demoMode ? 'bg-yellow-500 text-black animate-pulse' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
                                }`}
                        >
                            <Sparkles size={16} />
                            {demoMode ? 'DEMO ACTIVO' : 'Demo'}
                        </button>

                        {/* Overlay Toggle */}
                        <button
                            onClick={() => setShowOverlay(!showOverlay)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg transition-colors ${showOverlay ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-300'
                                }`}
                        >
                            <Activity size={16} />
                            Telemetría
                        </button>

                        {selectedStation && streaming && (
                            <>
                                <span className="flex items-center gap-2 text-green-400">
                                    <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                                    EN VIVO: {selectedStation.name}
                                </span>
                                <button
                                    onClick={stopStream}
                                    disabled={loading}
                                    className="flex items-center gap-2 px-4 py-2 bg-red-600 hover:bg-red-700 rounded-lg transition-colors"
                                >
                                    <Square size={16} /> Detener
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            <div className="max-w-7xl mx-auto p-6">
                {error && (
                    <div className="mb-4 p-4 bg-red-500/20 border border-red-500/30 rounded-lg text-red-400">
                        {error}
                    </div>
                )}

                {/* Main View */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Stream Viewer */}
                    <div className="lg:col-span-3">
                        <div className="aspect-video bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden relative">
                            {streaming && selectedStation?.stream_url && !demoMode ? (
                                <StreamPlayer url={selectedStation.stream_url} />
                            ) : demoMode && streaming ? (
                                // Demo Video Placeholder
                                <div className="absolute inset-0 flex flex-col items-center justify-center bg-gray-800 text-yellow-500">
                                    <Monitor size={64} className="mb-4 opacity-50 animate-pulse" />
                                    <p className="text-xl font-bold uppercase tracking-widest">Simulación Demo</p>
                                    <p className="text-sm mt-2 opacity-75">Visualización Simulada</p>
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500">
                                    <Monitor size={64} className="mb-4 opacity-50" />
                                    <p className="text-xl">Selecciona un simulador para ver</p>
                                    <p className="text-sm mt-2 opacity-75">
                                        Requiere OBS configurado en el PC del simulador
                                    </p>
                                </div>
                            )}

                            {/* TELEMETRY OVERLAY */}
                            {showOverlay && streaming && telemetry && (
                                <>
                                    {/* Top Left - Driver Info */}
                                    <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-sm rounded-xl px-4 py-2 border border-white/10">
                                        <p className="text-2xl font-black text-white">{telemetry.driver || 'Piloto'}</p>
                                        <p className="text-sm text-gray-400">{telemetry.car || 'Car'} • {telemetry.track || 'Track'}</p>
                                    </div>

                                    {/* Top Right - Lap Time */}
                                    <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-sm rounded-xl px-4 py-3 border border-white/10 text-right">
                                        <p className="text-xs text-gray-400 uppercase">Vuelta {telemetry.laps || 0}</p>
                                        <p className="text-3xl font-mono font-bold text-white">
                                            {formatLapTime(telemetry.lap_time_ms || 0)}
                                        </p>
                                    </div>

                                    {/* Bottom Center - Speed & Gear */}
                                    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-6 bg-black/70 backdrop-blur-sm rounded-xl px-6 py-3 border border-white/10">
                                        {/* Speed */}
                                        <div className="text-center">
                                            <p className="text-5xl font-black text-white tabular-nums">
                                                {Math.round(telemetry.speed_kmh || 0)}
                                            </p>
                                            <p className="text-xs text-gray-400 uppercase">km/h</p>
                                        </div>

                                        {/* Gear */}
                                        <div className="text-center px-4 border-l border-r border-white/20">
                                            <p className="text-5xl font-black text-yellow-400">
                                                {telemetry.gear === 0 ? 'N' : telemetry.gear === -1 ? 'R' : telemetry.gear || '-'}
                                            </p>
                                            <p className="text-xs text-gray-400 uppercase">Marcha</p>
                                        </div>

                                        {/* RPM Bar */}
                                        <div className="w-32">
                                            <div className="flex justify-between text-xs text-gray-400 mb-1">
                                                <span>RPM</span>
                                                <span>{Math.round((telemetry.rpm || 0) / 1000)}k</span>
                                            </div>
                                            <div className="h-3 bg-gray-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full bg-gradient-to-r from-green-500 via-yellow-500 to-red-500 transition-all"
                                                    style={{ width: `${Math.min(100, ((telemetry.rpm || 0) / 8000) * 100)}%` }}
                                                />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Bottom Left - Throttle/Brake Bars */}
                                    <div className="absolute bottom-4 left-4 flex gap-2">
                                        {/* Throttle */}
                                        <div className="w-6 h-24 bg-gray-800/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/10">
                                            <div
                                                className="bg-green-500 transition-all"
                                                style={{ height: `${(telemetry.gas || 0) * 100}%` }}
                                            />
                                        </div>
                                        {/* Brake */}
                                        <div className="w-6 h-24 bg-gray-800/80 rounded-full overflow-hidden flex flex-col-reverse border border-white/10">
                                            <div
                                                className="bg-red-500 transition-all"
                                                style={{ height: `${(telemetry.brake || 0) * 100}%` }}
                                            />
                                        </div>
                                        <div className="flex flex-col justify-between text-[10px] text-gray-400 py-1">
                                            <span>100%</span>
                                            <span>0%</span>
                                        </div>
                                    </div>
                                </>
                            )}

                            {/* Overlay placeholder when no telemetry */}
                            {showOverlay && streaming && !telemetry && (
                                <div className="absolute top-4 left-4 bg-yellow-500/20 backdrop-blur-sm rounded-xl px-4 py-2 border border-yellow-500/30 text-yellow-400 text-sm flex items-center gap-2">
                                    <Gauge size={16} />
                                    Esperando telemetría...
                                </div>
                            )}
                        </div>

                        {/* Quick Tips */}
                        <div className="mt-4 p-4 bg-blue-500/10 border border-blue-500/20 rounded-xl">
                            <h3 className="font-bold text-blue-400 mb-2 flex items-center gap-2">
                                <Settings size={16} /> Configuración Requerida
                            </h3>
                            <ul className="text-sm text-gray-400 space-y-1">
                                <li>• OBS Studio instalado en cada PC simulador</li>
                                <li>• Plugin obs-websocket activo (puerto 4455)</li>
                                <li>• Escena "Game" con captura de pantalla configurada</li>
                                <li>• Para latencia minima en LAN: stream_url WebRTC (ej. http://media.local:8889/live/station1)</li>
                            </ul>
                        </div>
                    </div>

                    {/* Station List */}
                    <div className="space-y-4">
                        <h2 className="text-lg font-bold text-gray-300">Simuladores</h2>

                        {stations.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                                <WifiOff size={32} className="mx-auto mb-2 opacity-50" />
                                <p>{error ? 'No se pudieron cargar simuladores' : 'No hay simuladores online'}</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {stations.map((station) => (
                                    <button
                                        key={station.id}
                                        onClick={() => startStream(station)}
                                        disabled={loading || (streaming && selectedStation?.id === station.id)}
                                        className={`w-full p-4 rounded-xl border transition-all text-left ${selectedStation?.id === station.id && streaming
                                            ? 'bg-green-600/20 border-green-500 text-green-400'
                                            : 'bg-gray-800/50 border-gray-700 hover:border-blue-500 hover:bg-gray-800'
                                            }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-3">
                                                <div className={`w-3 h-3 rounded-full ${selectedStation?.id === station.id && streaming
                                                    ? 'bg-green-500 animate-pulse'
                                                    : 'bg-blue-500'
                                                    }`} />
                                                <div>
                                                    <p className="font-medium">{station.name}</p>
                                                    <p className="text-xs text-gray-500">{station.ip_address}</p>
                                                </div>
                                            </div>
                                            {loading && selectedStation?.id === station.id ? (
                                                <RefreshCw className="animate-spin text-blue-400" size={18} />
                                            ) : selectedStation?.id === station.id && streaming ? (
                                                <span className="text-xs bg-green-500/20 text-green-400 px-2 py-1 rounded">LIVE</span>
                                            ) : (
                                                <Play size={18} className="text-gray-400" />
                                            )}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        <button
                            onClick={fetchStations}
                            className="w-full py-2 text-sm text-gray-400 hover:text-white flex items-center justify-center gap-2"
                        >
                            <RefreshCw size={14} /> Actualizar lista
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
