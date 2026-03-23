import { useState, useEffect, useMemo, useRef } from 'react';
import { 
  Tv, 
  Activity, 
  Zap,
  Play, 
  Monitor,
  History,
  Info,
  Gauge,
  Trophy,
  Swords,
  Maximize2
} from 'lucide-react';
import axios from 'axios';
import { API_URL, PUBLIC_API_TOKEN } from '../config';
import { useTelemetry } from '../hooks/useTelemetry';
import type { TelemetryPacket } from '../hooks/useTelemetry';
import StreamPlayer from '../components/StreamPlayer';
import { DEMO_STATIONS } from '../data/demoData';

interface Station {
    id: number;
    name: string;
    ip_address: string;
    is_streaming: boolean;
    stream_url: string | null;
}

interface ProductionEvent {
    id: string;
    timestamp: Date;
    type: 'info' | 'battle' | 'incident' | 'fastest_lap' | 'switch';
    message: string;
    station_id?: number;
}

export function DirectorPage() {
    // -- State --
    const isTVMode = window.location.pathname === '/director-tv';
    const [stations, setStations] = useState<Station[]>([]);
    const [selectedStation, setSelectedStation] = useState<Station | null>(null);
    const [isAutoDirector, setIsAutoDirector] = useState(false);
    const [streaming, setStreaming] = useState(false);
    const [events, setEvents] = useState<ProductionEvent[]>([]);
    
    // -- Hooks --
    const { liveCars } = useTelemetry();
    const [demoMode, setDemoMode] = useState(() => new URLSearchParams(window.location.search).get('demo') === 'true');
    const autoDirectorTimer = useRef<any>(null);
    const lastSwitchTime = useRef<number>(Date.now());

    // -- Derived Data --
    const telemetryEntries = useMemo(() => Object.values(liveCars), [liveCars]);
    const focusedTelemetry = selectedStation ? liveCars[selectedStation.id.toString()] : null;

    // -- Lifecycle --
    useEffect(() => {
        fetchStations();
        const interval = setInterval(fetchStations, 5000);
        return () => clearInterval(interval);
    }, [demoMode]);

    // -- Auto-Director Logic (The "Smart" part) --
    useEffect(() => {
        if (!isAutoDirector || telemetryEntries.length === 0) {
            if (autoDirectorTimer.current) clearInterval(autoDirectorTimer.current);
            return;
        }

        const directorInterval = setInterval(() => {
            const now = Date.now();
            const timeSinceLastSwitch = now - lastSwitchTime.current;
            
            // 1. Critical Events (Incident) - Immediate Switch
            const incidentCar = telemetryEntries.find(c => (c.g_lat || 0) > 4.0 || (c.g_lon || 0) > 4.0);
            if (incidentCar && (!selectedStation || incidentCar.station_id !== selectedStation.id)) {
                addEvent('incident', `¡Incidente detectado! Enfocando a ${incidentCar.driver}`, incidentCar.station_id);
                handleSwitchByStationId(incidentCar.station_id);
                return;
            }

            // 2. Battles (Gap < 0.5s)
            // Sort by pos to find battles
            const sorted = [...telemetryEntries].sort((a, b) => a.pos - b.pos);
            for (let i = 0; i < sorted.length - 1; i++) {
                const a = sorted[i];
                const b = sorted[i+1];
                // In a real system we'd calculate distance gap, here we use normalized_pos or just assume proximity
                const dist = Math.abs((a.normalized_pos || 0) - (b.normalized_pos || 0));
                if (dist < 0.02) { // Battle condition
                    if (!selectedStation || (selectedStation.id !== a.station_id && selectedStation.id !== b.station_id)) {
                        if (timeSinceLastSwitch > 10000) { // Don't flip too often
                            addEvent('battle', `Batalla intensa entre ${a.driver} y ${b.driver}`, a.station_id);
                            handleSwitchByStationId(a.station_id);
                            return;
                        }
                    }
                }
            }

            // 3. Periodic Rotation (every 20s)
            if (timeSinceLastSwitch > 20000) {
                const nextIndex = (telemetryEntries.findIndex(c => selectedStation && c.station_id === selectedStation.id) + 1) % telemetryEntries.length;
                const nextCar = telemetryEntries[nextIndex];
                addEvent('switch', `Rotación de cámara: Ahora viendo a ${nextCar.driver}`, nextCar.station_id);
                handleSwitchByStationId(nextCar.station_id);
            }

        }, 2000);

        autoDirectorTimer.current = directorInterval;
        return () => clearInterval(directorInterval);
    }, [isAutoDirector, telemetryEntries, selectedStation]);

    // -- Functions --
    const fetchStations = async () => {
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
        }
    };

    const addEvent = (type: ProductionEvent['type'], message: string, station_id?: number) => {
        const newEvent = { id: Math.random().toString(36), timestamp: new Date(), type, message, station_id };
        setEvents(prev => [newEvent, ...prev].slice(0, 50));
    };

    const handleSwitchByStationId = (id: number) => {
        const station = stations.find(s => s.id === id);
        if (station) {
            startStream(station);
            lastSwitchTime.current = Date.now();
        }
    };

    const startStream = async (station: Station) => {
        if (selectedStation?.id === station.id && streaming) return;
        
        setSelectedStation(station);
        setStreaming(true);
        lastSwitchTime.current = Date.now();

        if (demoMode) return;

        try {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            await axios.post(`${API_URL}/spectator/${station.id}/start`, null, { headers });
        } catch (err) {
            console.error('Error starting stream:', err);
        }
    };

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const stopStream = async () => {
        if (!selectedStation || demoMode) {
            setStreaming(false);
            return;
        }
        try {
            const headers = PUBLIC_API_TOKEN ? { 'X-Client-Token': PUBLIC_API_TOKEN } : {};
            await axios.post(`${API_URL}/spectator/${selectedStation.id}/stop`, null, { headers });
            setStreaming(false);
        } catch (err) {
            console.error('Error stopping stream:', err);
        }
    };

    const formatTime = (date: Date) => date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });

    return (
        <div className="flex flex-col h-[calc(100vh-64px)] bg-gray-950 text-gray-100 overflow-hidden">
            {/* Header Control Bar */}
            <header className="h-16 border-b border-gray-800 bg-gray-900/50 flex items-center justify-between px-6 shrink-0">
                <div className="flex items-center gap-4">
                    <div className="p-2 bg-blue-600 rounded-lg">
                        <Tv size={20} className="text-white" />
                    </div>
                    <div>
                        <h1 className="text-lg font-bold">Director de Producción</h1>
                        <p className="text-xs text-gray-400">Canal de Transmisión en Vivo</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="flex bg-gray-800 rounded-lg p-1">
                        <button 
                            onClick={() => setIsAutoDirector(false)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${!isAutoDirector ? 'bg-gray-700 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            Manual
                        </button>
                        <button 
                            onClick={() => setIsAutoDirector(true)}
                            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all flex items-center gap-2 ${isAutoDirector ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                        >
                            <Zap size={14} /> Auto-Director
                        </button>
                    </div>

                    <div className="h-8 w-px bg-gray-800" />
                    
                    <button 
                        onClick={() => window.location.href = isTVMode ? '/director' : '/director-tv'}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-gray-800 border border-gray-700 text-gray-400 hover:text-white transition-all text-xs font-bold"
                        title={isTVMode ? "Salir de Pantalla Completa" : "Pantalla Completa (Sin Menus)"}
                    >
                        <Maximize2 size={14} /> {isTVMode ? 'SALIR' : 'FULLSCREEN'}
                    </button>

                    <div className="h-8 w-px bg-gray-800" />

                    <button 
                        onClick={() => setDemoMode(!demoMode)}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all ${demoMode ? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-500' : 'bg-gray-800 border-gray-700 text-gray-400'}`}
                    >
                        {demoMode ? 'PRODUCCIÓN DEMO' : 'LIVE FEED'}
                    </button>
                </div>
            </header>

            {/* Main Content Area */}
            <div className="flex-1 flex overflow-hidden">
                {/* Left: Station Grid */}
                <aside className="w-80 border-r border-gray-800 bg-gray-900/20 overflow-y-auto p-4 flex flex-col gap-4">
                    <div className="flex items-center justify-between">
                        <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                            <Monitor size={14} /> Puestos Online
                        </h2>
                        <span className="bg-blue-600/20 text-blue-400 text-[10px] px-2 py-0.5 rounded-full font-bold">
                            {stations.length} ACTIVOS
                        </span>
                    </div>

                    <div className="grid gap-3">
                        {stations.map(station => {
                            const car = liveCars[station.id.toString()];
                            const isFocused = selectedStation?.id === station.id;
                            return (
                                <button
                                    key={station.id}
                                    onClick={() => startStream(station)}
                                    className={`relative p-3 rounded-xl border transition-all text-left overflow-hidden group ${isFocused 
                                        ? 'bg-blue-600/10 border-blue-500 ring-1 ring-blue-500' 
                                        : 'bg-gray-900 border-gray-800 hover:border-gray-600'}`}
                                >
                                    {isFocused && (
                                        <div className="absolute top-0 right-0 p-1 bg-blue-600 text-white rounded-bl-lg">
                                            <Play size={10} fill="currentColor" />
                                        </div>
                                    )}
                                    
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] text-gray-500 font-mono">STATION #{station.id}</span>
                                        <span className={`w-2 h-2 rounded-full ${car ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.6)]' : 'bg-gray-700'}`} />
                                    </div>
                                    
                                    <p className="font-bold text-sm truncate">{car?.driver || station.name}</p>
                                    <p className="text-[10px] text-gray-500 truncate mb-2">{car?.car || 'No data'}</p>
                                    
                                    {car && (
                                        <div className="flex items-center gap-3 text-[10px]">
                                            <span className="flex items-center gap-1 text-gray-400"><Activity size={10} /> {Math.round(car.speed_kmh || 0)}km/h</span>
                                            <span className="flex items-center gap-1 text-blue-400"><Trophy size={10} /> P{car.pos || '-'}</span>
                                        </div>
                                    )}

                                    {!car && (
                                        <div className="h-4 flex items-center gap-1 text-[10px] text-gray-600 italic">
                                            Esperando telemetría...
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                </aside>

                {/* Center: Live Feed & Telemetry */}
                <main className="flex-1 overflow-y-auto bg-black p-6 flex flex-col gap-6">
                    {/* Live View */}
                    <div className="relative group rounded-3xl overflow-hidden border border-gray-800 aspect-video bg-gray-900 shadow-2xl">
                        {streaming && selectedStation?.stream_url && !demoMode ? (
                            <StreamPlayer url={selectedStation.stream_url} />
                        ) : streaming && demoMode ? (
                            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-black flex flex-col items-center justify-center">
                                <Monitor size={48} className="text-blue-500 mb-4 animate-pulse" />
                                <h3 className="text-xl font-black uppercase tracking-widest text-white">Preview Producción</h3>
                                <p className="text-gray-500 text-sm mt-2">{selectedStation?.name} • Simulación Activa</p>
                            </div>
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-700">
                                <Monitor size={80} className="mb-4 opacity-50" />
                                <p className="text-lg font-bold">Seleccione un puesto para producir</p>
                                <p className="text-sm opacity-60">El modo automático seleccionará el mejor feed por ti</p>
                            </div>
                        )}

                        {/* Production Info Overlay */}
                        {streaming && (
                            <div className="absolute bottom-6 left-6 right-6 flex items-end justify-between pointer-events-none">
                                <div className="bg-black/80 backdrop-blur-md rounded-2xl p-4 border border-white/10 flex items-center gap-4">
                                    <div className="w-12 h-12 rounded-xl bg-blue-600 flex items-center justify-center font-black text-xl italic">
                                        {focusedTelemetry?.pos || '-'}
                                    </div>
                                    <div>
                                        <p className="text-xl font-black italic tracking-tighter uppercase">{focusedTelemetry?.driver || 'SPEED HUNTER'}</p>
                                        <p className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">{focusedTelemetry?.car || 'RACING PRO'}</p>
                                    </div>
                                </div>

                                <div className="flex gap-4">
                                    <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 text-center">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Velocidad</p>
                                        <p className="text-2xl font-mono font-black">{Math.round(focusedTelemetry?.speed_kmh || 0)}<span className="text-xs ml-1 text-gray-500">KM/H</span></p>
                                    </div>
                                    <div className="bg-black/80 backdrop-blur-md rounded-2xl px-5 py-3 border border-white/10 text-center min-w-[100px]">
                                        <p className="text-[10px] text-gray-500 font-bold uppercase mb-1">Lap Time</p>
                                        <p className="text-2xl font-mono font-black">
                                            {focusedTelemetry?.lap_time_ms ? (focusedTelemetry.lap_time_ms / 1000).toFixed(3) : '0.000'}
                                        </p>
                                    </div>
                                </div>
                            </div>
                        )}
                        
                        {/* Status Batch */}
                        {isAutoDirector && (
                            <div className="absolute top-6 right-6 bg-red-600 px-3 py-1 rounded-full flex items-center gap-2 animate-pulse shadow-lg shadow-red-600/50">
                                <Zap size={14} fill="white" />
                                <span className="text-[10px] font-bold uppercase tracking-widest">Auto Director Live</span>
                            </div>
                        )}
                    </div>

                    {/* Lower Info Bar */}
                    <div className="grid grid-cols-3 gap-6">
                        <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800">
                            <div className="flex items-center gap-2 mb-4 text-gray-400">
                                <Trophy size={16} /> <h3 className="text-xs font-bold uppercase">Líderes</h3>
                            </div>
                            <div className="space-y-3">
                                {telemetryEntries.sort((a,b) => a.pos - b.pos).slice(0, 3).map((car, idx) => (
                                    <div key={idx} className="flex items-center justify-between">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold text-blue-500 italic">P{car.pos}</span>
                                            <span className="text-sm font-medium">{car.driver}</span>
                                        </div>
                                        <span className="text-[10px] font-mono text-gray-500">GAP: {idx === 0 ? '--' : `+${(Math.random() * 2).toFixed(2)}s`}</span>
                                    </div>
                                ))}
                                {telemetryEntries.length === 0 && <p className="text-xs text-gray-600 italic">Sin actividad en pista</p>}
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800">
                            <div className="flex items-center gap-2 mb-4 text-gray-400">
                                <Gauge size={16} /> <h3 className="text-xs font-bold uppercase">Estado de Arena</h3>
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="text-center">
                                    <p className="text-2xl font-black text-white">{telemetryEntries.length}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Corredores</p>
                                </div>
                                <div className="text-center">
                                    <p className="text-2xl font-black text-blue-500">{telemetryEntries.length > 0 ? '19°C' : '--'}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Temp Suelo</p>
                                </div>
                                <div className="text-center col-span-2 mt-2 pt-4 border-t border-gray-800">
                                    <p className="text-lg font-bold text-gray-300">{focusedTelemetry?.track || 'N/A'}</p>
                                    <p className="text-[10px] text-gray-500 font-bold uppercase">Circuito</p>
                                </div>
                            </div>
                        </div>

                        <div className="bg-gray-900/50 rounded-2xl p-5 border border-gray-800">
                            <div className="flex items-center gap-2 mb-4 text-gray-400">
                                <Swords size={16} /> <h3 className="text-xs font-bold uppercase">Sistema de Alerta</h3>
                            </div>
                            <div className="space-y-3">
                                <div className={`p-2 rounded-lg text-[10px] flex items-center justify-between ${isAutoDirector ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                    <span>Análisis de Batallas</span>
                                    <div className={`w-2 h-2 rounded-full ${isAutoDirector ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                                </div>
                                <div className={`p-2 rounded-lg text-[10px] flex items-center justify-between ${isAutoDirector ? 'bg-green-500/10 text-green-400' : 'bg-gray-800 text-gray-500'}`}>
                                    <span>Detección de Crash</span>
                                    <div className={`w-2 h-2 rounded-full ${isAutoDirector ? 'bg-green-500 animate-pulse' : 'bg-gray-600'}`}></div>
                                </div>
                                <div className="p-2 bg-gray-800 rounded-lg text-[10px] text-gray-500 flex items-center justify-between">
                                    <span>Detección de Pit-Stop</span>
                                    <div className="w-2 h-2 rounded-full bg-gray-600"></div>
                                </div>
                            </div>
                        </div>
                    </div>
                </main>

                {/* Right: Event Log */}
                <aside className="w-80 border-l border-gray-800 bg-gray-900/40 p-4 flex flex-col gap-4">
                    <h2 className="text-sm font-bold text-gray-400 uppercase tracking-wider flex items-center gap-2">
                        <History size={14} /> Log de Producción
                    </h2>

                    <div className="flex-1 overflow-y-auto scrollbar-thin flex flex-col gap-2">
                        {events.length === 0 && (
                            <div className="flex-1 flex flex-col items-center justify-center text-gray-600 text-center px-4">
                                <Info size={32} className="mb-2 opacity-30" />
                                <p className="text-xs">El sistema está en espera. Activa el Auto-Director para automatizar la producción.</p>
                            </div>
                        )}
                        {events.map(event => (
                            <div key={event.id} className={`p-3 rounded-xl border flex flex-col gap-1 transition-all animate-in fade-in slide-in-from-right-4 ${
                                event.type === 'incident' ? 'bg-red-500/10 border-red-500/30' :
                                event.type === 'battle' ? 'bg-yellow-500/10 border-yellow-500/30' :
                                'bg-gray-800/50 border-gray-700'
                            }`}>
                                <div className="flex items-center justify-between">
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                                        event.type === 'incident' ? 'bg-red-500 text-white' :
                                        event.type === 'battle' ? 'bg-yellow-500 text-black' :
                                        'bg-gray-700 text-gray-400'
                                    }`}>
                                        {event.type}
                                    </span>
                                    <span className="text-[10px] text-gray-600 font-mono">{formatTime(event.timestamp)}</span>
                                </div>
                                <p className="text-xs leading-relaxed">{event.message}</p>
                                {event.station_id && <p className="text-[8px] text-gray-500 mt-1">Fuente: Station #{event.station_id}</p>}
                            </div>
                        ))}
                    </div>

                    <button 
                        onClick={() => setEvents([])}
                        className="w-full py-2 bg-gray-800 hover:bg-gray-700 text-gray-400 rounded-lg text-xs transition-colors"
                    >
                        Limpiar Historial
                    </button>
                </aside>
            </div>
        </div>
    );
}
