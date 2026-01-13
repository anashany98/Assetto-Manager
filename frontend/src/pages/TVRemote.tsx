import { useState } from 'react';
import { MonitorPlay, Lock, Unlock, Zap, Trophy, Crown, Map, List, Tv, Swords, GitMerge, Timer } from 'lucide-react';
import Leaderboard from './Leaderboard';
import { HallOfFame } from './HallOfFame';
import { LiveMap } from '../components/LiveMap';
import { useTelemetry } from '../hooks/useTelemetry';
import axios from 'axios';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { cn } from '../lib/utils';
import { API_URL } from '../config';
import { useNavigate } from 'react-router-dom';

const PIN = '1234';

export default function TVRemote() {
    const navigate = useNavigate();
    const queryClient = useQueryClient();
    const [isAuthenticated, setIsAuthenticated] = useState(false);
    const [pinInput, setPinInput] = useState('');
    const [error, setError] = useState('');

    const [selectedScreen, setSelectedScreen] = useState(1);

    // Fetch current settings
    const { data: settings } = useQuery({
        queryKey: ['settings'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/settings/`);
            return res.data;
        },
        refetchInterval: 2000
    });

    // Helper to get setting value for current screen
    const getSetting = (keyPrefix: string, def: string) => {
        // keyPrefix is 'tv_mode' or 'tv_view'
        // We look for 'tv_mode_1', 'tv_mode_2', etc.
        const key = `${keyPrefix}_${selectedScreen}`;
        return settings?.find((s: any) => s.key === key)?.value || def;
    };

    const tvMode = getSetting('tv_mode', 'auto');
    const tvView = getSetting('tv_view', 'LEADERBOARD');

    const updateSettingMutation = useMutation({
        mutationFn: async ({ key, value }: { key: string, value: string }) => {
            await axios.post(`${API_URL}/settings/`, { key, value });
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['settings'] });
        }
    });

    const handleLogin = (e: React.FormEvent) => {
        e.preventDefault();
        if (pinInput === PIN) {
            setIsAuthenticated(true);
            setError('');
        } else {
            setError('PIN Incorrecto');
            setPinInput('');
        }
    }

    if (!isAuthenticated) {
        return (
            <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4 text-white">
                <div className="bg-gray-800 p-8 rounded-2xl shadow-2xl w-full max-w-md border border-gray-700">
                    <div className="flex justify-center mb-6">
                        <div className="p-4 bg-blue-600 rounded-full shadow-lg shadow-blue-500/30">
                            <Lock size={32} />
                        </div>
                    </div>
                    <h1 className="text-2xl font-bold text-center mb-2">Acceso Restringido</h1>
                    <p className="text-gray-400 text-center mb-8">Introduce el PIN de administrador para controlar la TV.</p>

                    <form onSubmit={handleLogin} className="space-y-4">
                        <input
                            type="password"
                            inputMode="numeric"
                            className="w-full bg-gray-900 border border-gray-700 rounded-xl px-4 py-3 text-center text-2xl tracking-widest focus:ring-2 focus:ring-blue-500 outline-none"
                            placeholder="••••"
                            value={pinInput}
                            onChange={(e) => setPinInput(e.target.value)}
                            maxLength={4}
                            autoFocus
                        />
                        {error && <p className="text-red-500 text-center text-sm">{error}</p>}
                        <button
                            type="submit"
                            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 rounded-xl transition-all shadow-lg active:scale-95"
                        >
                            Desbloquear
                        </button>
                    </form>
                    <button onClick={() => navigate('/')} className="w-full mt-4 text-gray-500 hover:text-white text-sm">
                        Volver al Dashboard
                    </button>
                </div>
            </div>
        );
    }

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
                    <div className="flex items-center space-x-2 text-green-400 text-xs md:text-sm font-bold bg-green-500/10 px-2 md:px-3 py-1 rounded-full border border-green-500/20">
                        <Unlock size={12} className="md:w-3.5 md:h-3.5" />
                        <span>ADMIN</span>
                    </div>
                </header>

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
                    </div>
                </div>

// (Removed invalid nested code)

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
        case 'LIVE_MAP': content = <LiveMap cars={Object.values(liveCars)} trackName="monza" />; break;
        case 'TOURNAMENT': content = <div className="p-4"><p className="text-white text-center">Torneo Activo</p></div>; break;
        case 'VERSUS': content = <div className="p-4"><p className="text-white text-center">Duelo VS</p></div>; break;
    }

    return (
        <div className="w-full h-full overflow-hidden relative bg-black">
            <div className="absolute inset-0 origin-top-left transform scale-[0.25] w-[400%] h-[400%] pointer-events-none">
                {content}
            </div>
        </div>
    );
}

function ControlButton({ active, onClick, icon: Icon, label, color }: any) {
    const colors: any = {
        blue: active ? "bg-blue-600 ring-blue-500" : "hover:bg-blue-600/20 text-blue-400",
        yellow: active ? "bg-yellow-600 ring-yellow-500" : "hover:bg-yellow-600/20 text-yellow-400",
        red: active ? "bg-red-600 ring-red-500" : "hover:bg-red-600/20 text-red-400",
        green: active ? "bg-green-600 ring-green-500" : "hover:bg-green-600/20 text-green-400",
        purple: active ? "bg-purple-600 ring-purple-500" : "hover:bg-purple-600/20 text-purple-400",
        orange: active ? "bg-orange-600 ring-orange-500" : "hover:bg-orange-600/20 text-orange-400",
        cyan: active ? "bg-cyan-600 ring-cyan-500" : "hover:bg-cyan-600/20 text-cyan-400",
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

function ArrowLeft({ size }: { size: number }) {
    return (
        <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
        </svg>
    )
}
