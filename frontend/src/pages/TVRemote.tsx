
import { useState } from 'react';
import { MonitorPlay, Zap, Trophy, Crown, Map, List, Tv, Swords, GitMerge, Timer, ArrowLeft, Store, QrCode, Megaphone } from 'lucide-react';
import Leaderboard from './Leaderboard';
import { HallOfFame } from './HallOfFame';
import { LiveMap } from '../components/LiveMap';
import { useTelemetry } from '../hooks/useTelemetry';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { useNavigate } from 'react-router-dom';

// Auth handled by PrivateRoute
import { useAuth } from '../context/useAuth';

export default function TVRemote() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const { token } = useAuth();
    const [selectedScreen, setSelectedScreen] = useState(1);
    const [error, setError] = useState('');

    // Fetch current settings
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            if (!token) return [];
            try {
                const res = await axios.get(`${API_URL}/settings/`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                return Array.isArray(res.data) ? res.data : [];
            } catch { return []; }
        },
        refetchInterval: 2000,
        initialData: [],
        enabled: !!token
    });

    // Helper to get setting value for current screen
    const getSetting = (keyPrefix: string, def: string) => {
        const safeSettings = Array.isArray(settings) ? settings : [];
        const key = `${keyPrefix}_${selectedScreen}`;
        return safeSettings.find((s: { key: string; value: string }) => s.key === key)?.value || def;
    };

    const tvMode = getSetting('tv_mode', 'auto');
    const tvView = getSetting('tv_view', 'LEADERBOARD');

    const updateSettingMutation = useMutation({
        mutationFn: async ({ key, value }: { key: string, value: string }) => {
            const response = await axios.post(`${API_URL}/settings/`, { key, value }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            return response.data;
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        },
        onError: (err) => {
            console.error("Error updating setting:", err);
            setError("Error de red al actualizar");
            setTimeout(() => setError(''), 3000);
        }
    });

    const setMode = (mode: 'auto' | 'manual') => {
        updateSettingMutation.mutate({ key: `tv_mode_${selectedScreen}`, value: mode });
    }

    const setView = (view: string) => {
        updateSettingMutation.mutate({ key: `tv_view_${selectedScreen}`, value: view });
        if (tvMode === 'auto') {
            setMode('manual');
        }
    }

    return (
        <div className="min-h-screen bg-gray-900 text-white p-4 pb-20 md:p-8">
            <div className="max-w-4xl mx-auto">
                <header className="flex justify-between items-center mb-6 md:mb-8">
                    <div className="flex items-center space-x-3 md:space-x-4">
                        <button onClick={() => navigate('/')} className="p-2 hover:bg-gray-800 rounded-lg active:scale-95 transition-transform">
                            <ArrowLeft size={24} />
                        </button>
                        <div>
                            <h1 className="text-xl md:text-2xl font-bold flex items-center">
                                <Tv className="mr-2 md:mr-3 text-blue-500" size={24} />
                                Mando TV
                            </h1>
                            <p className="text-gray-400 text-xs md:text-sm">Control de Pantallas</p>
                        </div>
                    </div>
                </header>

                {/* ERROR MESSAGE */}
                {error && (
                    <div className="bg-red-500/10 text-red-500 p-4 rounded-xl mb-6 text-center text-sm font-bold uppercase tracking-wider border border-red-500/20">
                        {error}
                    </div>
                )}

                {/* SCREEN SELECTOR */}
                <div className="flex space-x-2 mb-6 bg-gray-800 p-1.5 rounded-xl">
                    {[1, 2, 3].map((num) => (
                        <button
                            key={num}
                            onClick={() => setSelectedScreen(num)}
                            className={cn(
                                "flex-1 py-3 rounded-lg font-bold text-sm md:text-base transition-all",
                                selectedScreen === num
                                    ? "bg-blue-600 text-white shadow"
                                    : "text-gray-400 hover:text-white hover:bg-gray-700"
                            )}
                        >
                            Pantalla {num}
                        </button>
                    ))}
                </div>

                {/* MODE SELECTOR */}
                <div className="grid grid-cols-2 gap-3 md:gap-4 mb-6 md:mb-8">
                    <button
                        onClick={() => setMode('auto')}
                        className={cn(
                            "p-4 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center space-y-2 active:scale-95",
                            tvMode === 'auto'
                                ? "bg-blue-600 border-blue-500 shadow-lg shadow-blue-500/20"
                                : "bg-gray-800 border-gray-700 hover:bg-gray-750"
                        )}
                    >
                        <Zap size={28} className={cn("md:w-8 md:h-8", tvMode === 'auto' ? "text-yellow-300 animate-pulse" : "text-gray-500")} />
                        <span className="font-bold text-base md:text-lg">Automático</span>
                        <span className="text-[10px] md:text-xs opacity-70">Rota cada 30s</span>
                    </button>

                    <button
                        onClick={() => setMode('manual')}
                        className={cn(
                            "p-4 md:p-6 rounded-2xl border-2 transition-all flex flex-col items-center justify-center space-y-2 active:scale-95",
                            tvMode === 'manual'
                                ? "bg-purple-600 border-purple-500 shadow-lg shadow-purple-500/20"
                                : "bg-gray-800 border-gray-700 hover:bg-gray-750"
                        )}
                    >
                        <MonitorPlay size={28} className={cn("md:w-8 md:h-8", tvMode === 'manual' ? "text-white" : "text-gray-500")} />
                        <span className="font-bold text-base md:text-lg">Manual</span>
                        <span className="text-[10px] md:text-xs opacity-70">Control total</span>
                    </button>
                </div>

                {/* AUTO CONFIG PANEL */}
                <div className={cn(
                    "bg-gray-800/50 rounded-3xl p-4 md:p-6 border border-gray-700 transition-all duration-300 mb-6",
                    tvMode === 'auto' ? "opacity-100" : "hidden"
                )}>
                    <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap size={14} className="text-yellow-400" /> Configuración Automática
                    </h2>

                    {/* Interval Slider */}
                    <div className="mb-6 bg-gray-900/50 p-4 rounded-xl border border-gray-700/50">
                        <div className="flex justify-between mb-2">
                            <label className="text-sm font-bold text-gray-300">Intervalo de Rotación</label>
                            <span className="text-sm font-mono text-blue-400">{getSetting('tv_interval', '15')} segundos</span>
                        </div>
                        <input
                            type="range"
                            min="5"
                            max="60"
                            step="5"
                            value={getSetting('tv_interval', '15')}
                            onChange={(e) => updateSettingMutation.mutate({ key: `tv_interval_${selectedScreen}`, value: e.target.value })}
                            className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                        />
                        <div className="flex justify-between text-[10px] text-gray-500 mt-1 uppercase font-bold">
                            <span>Rápido (5s)</span>
                            <span>Normal (30s)</span>
                            <span>Lento (60s)</span>
                        </div>
                    </div>

                    {/* Playlist Toggles */}
                    <div>
                        <label className="text-sm font-bold text-gray-300 mb-3 block">Vistas en Rotación</label>
                        <div className="grid grid-cols-2 gap-3">
                            {['LEADERBOARD', 'HALL_OF_FAME', 'LIVE_MAP', 'TOURNAMENT', 'BRACKET', 'COUNTDOWN', 'SPONSORSHIP', 'JOIN_QR'].map((view) => {
                                const playlistJson = getSetting('tv_playlist', '[]');
                                let playlist = [];
                                try { playlist = JSON.parse(playlistJson); } catch { /* ignore parse error */ }
                                if (!Array.isArray(playlist) || playlist.length === 0) {
                                    // Default if empty/invalid: assume ALL checked initially or handle empty logic
                                }

                                const isChecked = playlist.length === 0 || playlist.includes(view);

                                const toggleView = () => {
                                    let newPlaylist = [...playlist];
                                    if (newPlaylist.length === 0) {
                                        newPlaylist = ['LEADERBOARD', 'HALL_OF_FAME', 'LIVE_MAP', 'TOURNAMENT', 'BRACKET', 'COUNTDOWN', 'SPONSORSHIP', 'JOIN_QR'];
                                    }

                                    if (newPlaylist.includes(view)) {
                                        newPlaylist = newPlaylist.filter(v => v !== view);
                                    } else {
                                        newPlaylist.push(view);
                                    }

                                    updateSettingMutation.mutate({
                                        key: `tv_playlist_${selectedScreen}`,
                                        value: JSON.stringify(newPlaylist)
                                    });
                                };

                                return (
                                    <button
                                        key={view}
                                        onClick={toggleView}
                                        className={cn(
                                            "flex items-center justify-between p-3 rounded-xl border transition-all text-xs font-bold uppercase tracking-wider",
                                            isChecked
                                                ? "bg-blue-600/10 border-blue-500/50 text-blue-300"
                                                : "bg-gray-800 border-gray-700 text-gray-500 hover:bg-gray-700"
                                        )}
                                    >
                                        <span>{view.replace(/_/g, ' ')}</span>
                                        <div className={cn(
                                            "w-3 h-3 rounded-full border",
                                            isChecked ? "bg-blue-500 border-blue-400" : "bg-transparent border-gray-600"
                                        )} />
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>

                {/* MANUAL CONTROLS */}
                <div className={cn(
                    "bg-gray-800/50 rounded-3xl p-4 md:p-6 border border-gray-700 transition-all duration-300",
                    tvMode === 'auto' ? "opacity-50 pointer-events-none grayscale" : "opacity-100"
                )}>
                    <h2 className="text-gray-400 text-xs font-bold uppercase tracking-widest mb-4">Seleccionar Vista (Pantalla {selectedScreen})</h2>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3 md:gap-4">
                        <ControlButton
                            active={tvView === 'LEADERBOARD'}
                            onClick={() => setView('LEADERBOARD')}
                            icon={List}
                            label="Leaderboard"
                            color="blue"
                        />
                        <ControlButton
                            active={tvView === 'HALL_OF_FAME'}
                            onClick={() => setView('HALL_OF_FAME')}
                            icon={Crown}
                            label="Salón Fama"
                            color="yellow"
                        />
                        <ControlButton
                            active={tvView === 'LIVE_MAP'}
                            onClick={() => setView('LIVE_MAP')}
                            icon={Map}
                            label="Mapa en Vivo"
                            color="red"
                        />
                        <ControlButton
                            active={tvView === 'TOURNAMENT'}
                            onClick={() => setView('TOURNAMENT')}
                            icon={Trophy}
                            label="Torneo"
                            color="green"
                        />
                        <ControlButton
                            active={tvView === 'VERSUS'}
                            onClick={() => setView('VERSUS')}
                            icon={Swords}
                            label="Duelo"
                            color="purple"
                        />
                        <ControlButton
                            active={tvView === 'BRACKET'}
                            onClick={() => setView('BRACKET')}
                            icon={GitMerge}
                            label="Eliminatoria"
                            color="orange"
                        />
                        <ControlButton
                            active={tvView === 'COUNTDOWN'}
                            onClick={() => setView('COUNTDOWN')}
                            icon={Timer}
                            label="Cuenta Atrás"
                            color="cyan"
                        />
                        <ControlButton
                            active={tvView === 'SPONSORSHIP'}
                            onClick={() => setView('SPONSORSHIP')}
                            icon={Store}
                            label="Publicidad"
                            color="pink"
                        />
                        <ControlButton
                            active={tvView === 'JOIN_QR'}
                            onClick={() => setView('JOIN_QR')}
                            icon={QrCode}
                            label="Portal QR"
                            color="indigo"
                        />
                    </div>
                </div>

                {/* URGENT NEWS CONTROL */}
                <div className="mt-8 bg-blue-900/20 border border-blue-500/30 rounded-3xl p-6">
                    <h2 className="text-blue-400 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Megaphone size={14} /> Noticias de Última Hora
                    </h2>
                    <div className="flex gap-2">
                        <input
                            type="text"
                            placeholder="Escribe un mensaje urgente..."
                            className="flex-1 bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-sm focus:ring-2 focus:ring-blue-500 outline-none text-white"
                            value={getSetting('news_urgent', '')}
                            onChange={(e) => updateSettingMutation.mutate({ key: `news_urgent_${selectedScreen}`, value: e.target.value })}
                        />
                        <button
                            onClick={() => updateSettingMutation.mutate({ key: `news_urgent_${selectedScreen}`, value: '' })}
                            className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded-xl text-xs font-bold uppercase transition-all"
                        >
                            Limpiar
                        </button>
                    </div>
                    <p className="text-[10px] text-gray-500 mt-2 font-mono uppercase">
                        Este mensaje aparecerá con prioridad en el ticker de la TV.
                    </p>
                </div>

                {/* EMERGENCY CONTROLS */}
                <div className="mt-8 bg-red-900/20 border border-red-500/30 rounded-3xl p-6">
                    <h2 className="text-red-500 text-xs font-bold uppercase tracking-widest mb-4 flex items-center gap-2">
                        <Zap size={14} /> Zona de Peligro
                    </h2>
                    <button
                        onClick={async () => {
                            if (confirm(`⚠ ¿ESTÁS SEGURO?\n\nEsto matará inmediatamente todos los procesos de juego en la PANTALLA ${selectedScreen}.\n\nÚsalo solo si el simulador se ha colgado.`)) {
                                try {
                                    await axios.post(`${API_URL}/stations/${selectedScreen}/panic`, {}, {
                                        headers: { Authorization: `Bearer ${token}` }
                                    });
                                    alert(`Comando de emergencia enviado a Pantalla ${selectedScreen}`);
                                } catch {
                                    alert("Error al enviar comando de pánico");
                                }
                            }
                        }}
                        className="w-full bg-red-600 hover:bg-red-700 text-white font-black py-4 rounded-xl shadow-lg shadow-red-600/20 flex items-center justify-center space-x-3 active:scale-95 transition-all"
                    >
                        <Zap size={24} className="animate-pulse" />
                        <span>INTERRUPTOR DE EMERGENCIA (PANIC)</span>
                    </button>
                    <p className="text-center text-red-400/60 text-[10px] mt-2 font-mono">
                        Fuerza el cierre de acs.exe, content_manager.exe y steam.exe en la estación remota.
                    </p>
                </div>

                {/* PREVIEW */}
                <div className="mt-8">
                    <div className="bg-black rounded-lg aspect-video w-full max-w-sm mx-auto border-4 border-gray-800 relative flex items-center justify-center overflow-hidden shadow-2xl">
                        <PreviewScreen view={tvView} mode={tvMode} />

                        {/* Overlay Label */}
                        <div className="absolute bottom-2 left-2 bg-black/80 backdrop-blur px-2 py-1 rounded text-[10px] text-gray-400 font-mono border border-white/10">
                            PANTALLA {selectedScreen}: {tvMode === 'auto' ? 'AUTO' : tvView}
                        </div>
                    </div>
                    <p className="text-center text-xs text-gray-500 mt-2">Vista previa - Pantalla {selectedScreen}</p>
                </div>
            </div>
        </div>
    );
}

// Helper Component for Preview
function PreviewScreen({ view, mode }: { view: string, mode: string }) {
    const { liveCars } = useTelemetry();
    let content = <div className="flex items-center justify-center h-full text-gray-500">Cargando vista...</div>;
    const actualView = mode === 'auto' ? 'ROTATION' : view;

    if (actualView === 'ROTATION') {
        return (
            <div className="w-full h-full bg-gray-900 flex flex-col items-center justify-center text-center p-4">
                <Zap className="w-12 h-12 text-yellow-400 mb-2 animate-pulse" />
                <p className="text-white font-bold">Modo Automático</p>
                <p className="text-xs text-gray-400">Rotando entre vistas cada 30s</p>
            </div>
        );
    }

    switch (view) {
        case 'LEADERBOARD': content = <Leaderboard />; break;
        case 'HALL_OF_FAME': content = <HallOfFame />; break;
        case 'LIVE_MAP': content = <LiveMap drivers={Array.isArray(Object.values(liveCars)) ? Object.values(liveCars).map((c) => ({
            id: Number(c.station_id) || 0,
            name: c.driver || 'Desconocido',
            x: c.x || 0,
            z: c.z || 0,
            normPos: c.normalized_pos || 0,
            color: c.station_id === '1' ? '#ef4444' : c.station_id === '2' ? '#3b82f6' : c.station_id === '3' ? '#22c55e' : '#eab308',
            isOnline: true
        })) : []} trackName="Circuito" />; break;
        case 'TOURNAMENT': content = <div className="p-4"><p className="text-white text-center">Torneo Activo</p></div>; break;
        case 'VERSUS': content = <div className="p-4"><p className="text-white text-center">Duelo VS</p></div>; break;
        case 'SPONSORSHIP': content = <div className="p-4 flex flex-col items-center justify-center h-full"><Store className="mb-2 text-pink-500" /><p className="text-white text-center font-bold">ADS</p></div>; break;
        case 'JOIN_QR': content = <div className="p-4 flex flex-col items-center justify-center h-full"><QrCode className="mb-2 text-indigo-500" /><p className="text-white text-center font-bold">QR</p></div>; break;
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-black">
            <div className="absolute inset-0 origin-top-left transform scale-[0.25] w-[400%] h-[400%] pointer-events-none">
                {content}
            </div>
        </div>
    );
}

interface ControlButtonProps {
    active: boolean;
    onClick: () => void;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    label: string;
    color: string;
}

function ControlButton({ active, onClick, icon: Icon, label, color }: ControlButtonProps) {
    const colors: Record<string, string> = {
        blue: active ? "bg-blue-600 ring-blue-500" : "hover:bg-blue-600/20 text-blue-400",
        yellow: active ? "bg-yellow-600 ring-yellow-500" : "hover:bg-yellow-600/20 text-yellow-400",
        red: active ? "bg-red-600 ring-red-500" : "hover:bg-red-600/20 text-red-400",
        green: active ? "bg-green-600 ring-green-500" : "hover:bg-green-600/20 text-green-400",
        purple: active ? "bg-purple-600 ring-purple-500" : "hover:bg-purple-600/20 text-purple-400",
        orange: active ? "bg-orange-600 ring-orange-500" : "hover:bg-orange-600/20 text-orange-400",
        cyan: active ? "bg-cyan-600 ring-cyan-500" : "hover:bg-cyan-600/20 text-cyan-400",
        pink: active ? "bg-pink-600 ring-pink-500" : "hover:bg-pink-600/20 text-pink-400",
        indigo: active ? "bg-indigo-600 ring-indigo-500" : "hover:bg-indigo-600/20 text-indigo-400",
    };

    return (
        <button
            onClick={onClick}
            className={cn(
                "p-4 rounded-xl border border-gray-700 flex flex-col items-center space-y-3 transition-all active:scale-95",
                active ? "ring-2 text-white shadow-lg scale-105 border-transparent" : "bg-gray-800 text-gray-300",
                colors[color]
            )}
        >
            <Icon size={24} />
            <span className="font-medium text-sm">{label}</span>
        </button>
    );
}
