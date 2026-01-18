import { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
    Car,
    Flag,
    Play,
    ChevronRight,
    Gauge,
    ShieldCheck,
    Activity,
    LogOut,
    Clock,
    Trophy,
    Medal,
    User,
    Users,
    ChevronLeft,
    Plus,
    WifiOff,
    Settings
} from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import { getCars, getTracks } from '../api/content';

// Driver creation is handled inline for now. Backend may provide endpoint.

export default function KioskMode() {
    const [searchParams] = useSearchParams();
    const [step, setStep] = useState<number>(1);
    const [driver, setDriver] = useState<{ id: number, name: string } | null>(null);
    const [selection, setSelection] = useState<{
        car: string,
        track: string,
        isLobby?: boolean,
        isHost?: boolean,
        lobbyId?: number
    } | null>(null);
    const [difficulty, setDifficulty] = useState<'novice' | 'amateur' | 'pro'>('amateur');
    const [duration, setDuration] = useState<number>(15);  // Session duration in minutes
    const [isLaunched, setIsLaunched] = useState(false);

    // Station Detection: Priority: URL param > localStorage > default 1
    const [stationId, setStationId] = useState<number>(1);

    useEffect(() => {
        // Check URL param first (e.g., /kiosk?station=3)
        const urlStation = searchParams.get('station');
        if (urlStation) {
            const id = parseInt(urlStation, 10);
            if (!isNaN(id)) {
                setStationId(id);
                localStorage.setItem('kiosk_station_id', String(id));
                return;
            }
        }
        // Fall back to localStorage
        const storedId = localStorage.getItem('kiosk_station_id');
        if (storedId) {
            setStationId(parseInt(storedId, 10));
        }
    }, [searchParams]);

    // --- STEP 1: DRIVER IDENTIFICATION ---
    const DriverStep = () => {
        const [name, setName] = useState('');
        const [email, setEmail] = useState('');

        // Fetch real leaderboard from API
        const { data: leaderboardData } = useQuery({
            queryKey: ['kiosk-leaderboard'],
            queryFn: async () => {
                const res = await axios.get(`${API_URL}/telemetry/leaderboard`, {
                    params: { limit: 5, period: 'all' }
                });
                return res.data;
            },
            retry: false,
            staleTime: 60000 // Refresh every minute
        });

        // Format milliseconds to mm:ss.xxx
        const formatTime = (ms: number) => {
            const minutes = Math.floor(ms / 60000);
            const seconds = ((ms % 60000) / 1000).toFixed(3);
            return `${minutes}:${seconds.padStart(6, '0')}`;
        };

        // Map API data to display format with fallback
        const topTimes = (leaderboardData || []).map((entry: any, idx: number) => ({
            pos: idx + 1,
            name: entry.driver_name || 'Unknown',
            time: formatTime(entry.best_time || 0),
            car: entry.car_model || 'Unknown Car'
        }));

        const handleLogin = async (e: React.FormEvent) => {
            e.preventDefault();
            try {
                setDriver({ id: 1, name: name || "Guest Driver" });
                setStep(2);
            } catch {
                alert("Error registering driver");
            }
        };

        return (
            <div className="flex items-center justify-center h-full animate-in fade-in slide-in-from-bottom-4 duration-500">
                {/* Two Column Layout: Form + Leaderboard */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 w-full max-w-5xl">
                    {/* LEFT: Registration Form */}
                    <div className="flex flex-col items-center justify-center">
                        <h1 className="text-5xl font-black text-white italic mb-2 tracking-tighter">BIENVENIDO PILOTO</h1>
                        <p className="text-xl text-gray-400 mb-8">Identifícate para guardar tus tiempos</p>

                        <form onSubmit={handleLogin} className="w-full max-w-lg space-y-6">
                            <div className="space-y-2">
                                <label className="text-gray-400 font-bold ml-1">NOMBRE DE PILOTO</label>
                                <input
                                    type="text"
                                    className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                    placeholder="Ej. Max Verstappen"
                                    value={name}
                                    onChange={e => setName(e.target.value)}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-gray-400 font-bold ml-1">EMAIL (Opcional)</label>
                                <input
                                    type="email"
                                    className="w-full bg-gray-800 border-2 border-gray-700 focus:border-blue-500 rounded-2xl px-6 py-4 text-2xl text-white font-bold outline-none transition-all focus:scale-[1.02] placeholder:text-gray-600"
                                    placeholder="max@redbull.com"
                                    value={email}
                                    onChange={e => setEmail(e.target.value)}
                                />
                            </div>

                            <button type="submit" className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-black text-2xl py-6 rounded-2xl shadow-xl shadow-blue-600/20 active:scale-95 hover:scale-[1.02] transition-all flex items-center justify-center gap-3">
                                COMENZAR <ChevronRight size={32} />
                            </button>
                        </form>
                    </div>

                    {/* RIGHT: Mini Leaderboard */}
                    <div className="bg-black/40 rounded-3xl border border-gray-800 p-6 backdrop-blur-sm animate-in slide-in-from-right-8 duration-700">
                        <h3 className="text-2xl font-black text-white mb-4 flex items-center gap-3">
                            <Trophy className="text-yellow-400" /> MEJORES TIEMPOS
                        </h3>
                        <div className="space-y-3">
                            {topTimes.map((entry, idx) => (
                                <div
                                    key={entry.pos}
                                    className={`flex items-center gap-4 p-3 rounded-xl transition-all ${idx === 0 ? 'bg-yellow-500/10 border border-yellow-500/30' : 'bg-gray-800/50'}`}
                                    style={{ animationDelay: `${idx * 100}ms` }}
                                >
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black ${idx === 0 ? 'bg-yellow-500 text-black' :
                                        idx === 1 ? 'bg-gray-400 text-black' :
                                            idx === 2 ? 'bg-orange-700 text-white' :
                                                'bg-gray-700 text-gray-300'
                                        }`}>
                                        {entry.pos}
                                    </div>
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{entry.name}</p>
                                        <p className="text-xs text-gray-500">{entry.car}</p>
                                    </div>
                                    <div className={`font-mono font-bold text-lg ${idx === 0 ? 'text-yellow-400' : 'text-green-400'}`}>
                                        {entry.time}
                                    </div>
                                    {idx === 0 && <Medal className="text-yellow-400" size={20} />}
                                </div>
                            ))}
                        </div>
                        <p className="text-center text-gray-600 text-sm mt-4">¿Podrás batir el récord?</p>
                    </div>
                </div>
            </div>
        );
    };

    // --- STEP 1.5: LOBBY SELECTION ---
    const LobbySelectionStep = () => {
        const [mode, setMode] = useState<'solo' | 'multi'>('solo');
        const [lobbies, setLobbies] = useState<any[]>([]);

        // Fetch lobbies
        useQuery({
            queryKey: ['lobbies'],
            queryFn: async () => {
                try {
                    const res = await axios.get(`${API_URL}/lobby/list`);
                    setLobbies(res.data);
                    return res.data;
                } catch { return []; }
            },
            refetchInterval: 2000,
            enabled: mode === 'multi'
        });

        const handleCreateLobby = async () => {
            // Go to content selection but flag as lobby creation
            setSelection((prev: any) => ({ ...(prev || {}), isLobby: true, isHost: true }));
            setStep(2);
        };

        const handleJoinLobby = async (lobbyId: number) => {
            try {
                await axios.post(`${API_URL}/lobby/${lobbyId}/join`, { station_id: stationId });
                // Save lobby info to context/state and jump to waiting room
                setSelection((prev: any) => ({ ...(prev || {}), lobbyId, isLobby: true, isHost: false }));
                setStep(4); // Jump to Waiting Room (to be created)
            } catch (e) {
                alert("Error al unirse al lobby");
            }
        };

        if (mode === 'solo') {
            return (
                <div className="flex flex-col items-center justify-center h-full animate-in fade-in zoom-in duration-300 gap-8">
                    <h2 className="text-4xl font-black text-white italic">¿CÓMO QUIERES CORRER?</h2>
                    <div className="flex gap-8">
                        <button
                            onClick={() => setStep(2)}
                            className="w-80 h-96 bg-gradient-to-br from-blue-600 to-blue-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-6 hover:scale-105 transition-all shadow-2xl border-4 border-blue-400/30"
                        >
                            <User size={80} className="text-white" />
                            <div className="text-center">
                                <h3 className="text-3xl font-black text-white mb-2">SOLO</h3>
                                <p className="text-blue-200">Entrena y mejora tus tiempos en solitario</p>
                            </div>
                        </button>

                        <button
                            onClick={() => setMode('multi')}
                            className="w-80 h-96 bg-gradient-to-br from-purple-600 to-pink-800 rounded-3xl p-8 flex flex-col items-center justify-center gap-6 hover:scale-105 transition-all shadow-2xl border-4 border-purple-400/30"
                        >
                            <Users size={80} className="text-white" />
                            <div className="text-center">
                                <h3 className="text-3xl font-black text-white mb-2">MULTIJUGADOR</h3>
                                <p className="text-purple-200">Compite contra otros simuladores en la sala</p>
                            </div>
                        </button>
                    </div>
                </div>
            )
        }

        return (
            <div className="h-full flex flex-col animate-in slide-in-from-right duration-300">
                <div className="flex items-center gap-4 mb-8">
                    <button onClick={() => setMode('solo')} className="p-3 bg-gray-800 rounded-xl text-white hover:bg-gray-700"><ChevronLeft /></button>
                    <h2 className="text-3xl font-black text-white flex-1">SALA MULTIJUGADOR</h2>
                    <button
                        onClick={handleCreateLobby}
                        className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-6 rounded-xl flex items-center gap-2"
                    >
                        <Plus size={20} /> CREAR SALA
                    </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 overflow-y-auto p-2">
                    {lobbies.length === 0 ? (
                        <div className="col-span-full py-20 text-center text-gray-500 text-xl font-bold flex flex-col items-center gap-4">
                            <WifiOff size={48} />
                            NO HAY CARRERAS ACTIVAS
                            <p className="text-sm font-normal">Crea una nueva para empezar</p>
                        </div>
                    ) : (
                        lobbies.map((lobby: any) => (
                            <div key={lobby.id} className="bg-gray-800 border-2 border-gray-700 rounded-2xl p-6 hover:border-purple-500 transition-all group">
                                <div className="flex justify-between items-start mb-4">
                                    <h3 className="text-2xl font-black text-white">{lobby.name}</h3>
                                    <span className={`px-3 py-1 rounded-full text-xs font-bold ${lobby.status === 'waiting' ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}`}>
                                        {lobby.status.toUpperCase()}
                                    </span>
                                </div>
                                <div className="space-y-2 mb-6">
                                    <div className="flex items-center gap-2 text-gray-400"><Flag size={16} /> {lobby.track}</div>
                                    <div className="flex items-center gap-2 text-gray-400"><Car size={16} /> {lobby.car}</div>
                                    <div className="flex items-center gap-2 text-gray-400"><Users size={16} /> {lobby.player_count} / {lobby.max_players} Pilotos</div>
                                </div>
                                <button
                                    onClick={() => handleJoinLobby(lobby.id)}
                                    disabled={lobby.status !== 'waiting'}
                                    className="w-full bg-white text-black font-black py-3 rounded-xl group-hover:bg-purple-500 group-hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    UNIRSE
                                </button>
                            </div>
                        ))
                    )}
                </div>
            </div>
        );
    }

    // --- STEP 2: CONTENT SELECTION ---
    const ContentStep = () => {
        // Fetch content for the specific station (uses cached real content or mock fallback)
        const { data: cars = [] } = useQuery({
            queryKey: ['cars', stationId],
            queryFn: () => getCars(stationId)
        });
        const { data: tracks = [] } = useQuery({
            queryKey: ['tracks', stationId],
            queryFn: () => getTracks(stationId)
        });
        const [selCar, setSelCar] = useState<string | null>(null);
        const [selTrack, setSelTrack] = useState<string | null>(null);

        const handleNext = () => {
            if (selCar && selTrack) {
                setSelection({ car: selCar, track: selTrack });
                setStep(3);
            }
        }

        return (
            <div className="h-full flex flex-col animate-in slide-in-from-right duration-300">
                <h2 className="text-3xl font-black text-white mb-6 flex items-center gap-3">
                    <span className="bg-blue-600 text-white w-10 h-10 rounded-full flex items-center justify-center text-xl">1</span>
                    ELIGE TU MÁQUINA Y PISTA
                </h2>

                <div className="grid grid-cols-2 gap-8 flex-1 overflow-hidden min-h-0">
                    {/* CARS */}
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Car /> COCHES DISPONIBLES ({cars?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {cars?.map((c: any) => (
                                <div
                                    key={c.id}
                                    onClick={() => setSelCar(c.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 ${selCar === c.id ? 'border-blue-500 bg-blue-500/20 scale-[1.02]' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'}`}
                                >
                                    {/* Show image if available, nothing if not */}
                                    {c.image_url && (
                                        <img
                                            src={c.image_url}
                                            alt={c.name}
                                            className="w-20 h-12 object-cover rounded bg-black/50"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{c.name}</p>
                                        <p className="text-xs text-gray-500">{c.brand || 'Generic'}</p>
                                    </div>
                                    {selCar === c.id && <div className="w-3 h-3 rounded-full bg-blue-500" />}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* TRACKS */}
                    <div className="flex flex-col min-h-0">
                        <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Flag /> CIRCUITOS ({tracks?.length})</h3>
                        <div className="flex-1 overflow-y-auto pr-2 space-y-3 custom-scrollbar">
                            {tracks?.map((t: any) => (
                                <div
                                    key={t.id}
                                    onClick={() => setSelTrack(t.id)}
                                    className={`p-4 rounded-xl border-2 cursor-pointer transition-all hover:scale-[1.02] flex items-center gap-4 ${selTrack === t.id ? 'border-green-500 bg-green-500/20 scale-[1.02]' : 'border-gray-700 bg-gray-800/50 hover:bg-gray-800'}`}
                                >
                                    {/* Show image if available, nothing if not */}
                                    {t.image_url && (
                                        <img
                                            src={t.image_url}
                                            alt={t.name}
                                            className="w-20 h-12 object-cover rounded bg-black/50"
                                            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                                        />
                                    )}
                                    <div className="flex-1">
                                        <p className="font-bold text-white">{t.name}</p>
                                        <p className="text-xs text-gray-500">{t.layout || 'Main'}</p>
                                    </div>
                                    {selTrack === t.id && <div className="w-3 h-3 rounded-full bg-green-500" />}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                <div className="py-6 flex justify-end">
                    <button
                        disabled={!selCar || !selTrack}
                        onClick={handleNext}
                        className="bg-white text-black hover:bg-gray-200 disabled:opacity-50 disabled:cursor-not-allowed font-black text-xl px-12 py-4 rounded-xl shadow-lg flex items-center gap-3 transition-all"
                    >
                        SIGUIENTE <ChevronRight />
                    </button>
                </div>
            </div>
        )
    };

    // --- STEP 3: DIFFICULTY ---
    const DifficultyStep = () => {
        const LaunchSession = useMutation({
            mutationFn: async () => {
                // Use stationId from state (detected via URL or localStorage)
                await axios.post(`${API_URL}/control/station/${stationId}/launch`, {
                    driver_id: driver?.id,
                    driver_name: driver?.name,
                    car: selection?.car,
                    track: selection?.track,
                    difficulty,
                    duration_minutes: duration
                });
            },
            onSuccess: () => setIsLaunched(true)
        });

        return (
            <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full">
                <h2 className="text-4xl font-black text-white mb-8">ELIGE TU NIVEL</h2>

                <div className="grid grid-cols-3 gap-6 w-full mb-8">
                    <button
                        onClick={() => setDifficulty('novice')}
                        className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'novice' ? 'border-green-500 bg-green-500/20 scale-105 shadow-2xl shadow-green-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                    >
                        <ShieldCheck size={64} className={difficulty === 'novice' ? 'text-green-400' : 'text-gray-500'} />
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-white">NOVATO</h3>
                            <p className="text-gray-400 mt-2">Marchas Auto<br />ABS & TC Activados</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setDifficulty('amateur')}
                        className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'amateur' ? 'border-yellow-500 bg-yellow-500/20 scale-105 shadow-2xl shadow-yellow-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                    >
                        <Activity size={64} className={difficulty === 'amateur' ? 'text-yellow-400' : 'text-gray-500'} />
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-white">AMATEUR</h3>
                            <p className="text-gray-400 mt-2">Levas Manuales<br />Ayudas Fábrica</p>
                        </div>
                    </button>

                    <button
                        onClick={() => setDifficulty('pro')}
                        className={`p-8 rounded-3xl border-4 flex flex-col items-center gap-4 transition-all ${difficulty === 'pro' ? 'border-red-500 bg-red-500/20 scale-105 shadow-2xl shadow-red-500/20' : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'}`}
                    >
                        <Gauge size={64} className={difficulty === 'pro' ? 'text-red-400' : 'text-gray-500'} />
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-white">PRO</h3>
                            <p className="text-gray-400 mt-2">Manual + Embrague<br />Sin Ayudas</p>
                        </div>
                    </button>
                </div>

                {/* DURATION SELECTOR */}
                <div className="w-full mb-8">
                    <h3 className="text-xl font-bold text-gray-400 mb-4 flex items-center gap-2"><Clock /> DURACIÓN DE SESIÓN</h3>
                    <div className="flex gap-4 justify-center">
                        {[10, 15, 20, 30, 45, 60].map(mins => (
                            <button
                                key={mins}
                                onClick={() => setDuration(mins)}
                                className={`px-6 py-4 rounded-2xl border-2 font-black text-xl transition-all ${duration === mins ? 'border-blue-500 bg-blue-500/20 text-blue-400' : 'border-gray-700 bg-gray-800/50 text-gray-400 hover:border-gray-600'}`}
                            >
                                {mins} min
                            </button>
                        ))}
                    </div>
                </div>

                <div className="w-full">
                    <button
                        onClick={() => LaunchSession.mutate()}
                        disabled={LaunchSession.isPending}
                        className="w-full bg-gradient-to-r from-red-600 to-orange-600 hover:from-red-500 hover:to-orange-500 text-white font-black text-4xl py-8 rounded-3xl shadow-2xl shadow-red-600/30 active:scale-95 transition-all flex items-center justify-center gap-6"
                    >
                        {LaunchSession.isPending ? 'INICIANDO MOTORES...' : <> <Play fill="currentColor" size={40} /> LANZAR SESIÓN ({duration}min) </>}
                    </button>
                    <p className="text-center text-gray-500 mt-4 text-lg">Simulador #{stationId} • Al pulsar, el juego se iniciará automáticamente.</p>
                </div>
            </div>
        )
    };

    // --- STEP 4: WAITING ROOM ---
    const WaitingRoom = () => {
        const { data: lobbyData, refetch } = useQuery({
            queryKey: ['lobby', selection?.lobbyId],
            queryFn: () => axios.get(`${API_URL}/lobby/${selection?.lobbyId}`).then(res => res.data),
            refetchInterval: 1000,
            enabled: !!selection?.isLobby && !!selection?.lobbyId
        });

        const StartRaceMutation = useMutation({
            mutationFn: async () => {
                await axios.post(`${API_URL}/lobby/${selection?.lobbyId}/start`, {}, {
                    params: { requesting_station_id: stationId }
                });
            }
        });

        // Listen for status change to 'running' -> Start Game
        useEffect(() => {
            if (lobbyData?.status === 'running') {
                setIsLaunched(true);
            }
        }, [lobbyData?.status]);

        const isHost = selection?.isHost;

        return (
            <div className="h-full flex flex-col items-center justify-center animate-in zoom-in duration-300 max-w-4xl mx-auto w-full">
                <div className="mb-12 text-center">
                    <span className="bg-purple-600 text-white px-4 py-1 rounded-full font-bold text-sm tracking-widest mb-4 inline-block animate-pulse">
                        SALA DE ESPERA
                    </span>
                    <h2 className="text-5xl font-black text-white">{lobbyData?.name || 'Cargando...'}</h2>
                    <p className="text-gray-400 mt-2 font-mono text-xl">{lobbyData?.track} | {lobbyData?.car}</p>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 w-full mb-12">
                    {Array.from({ length: lobbyData?.max_players || 8 }).map((_, idx) => {
                        const player = lobbyData?.players?.find((p: any) => p.slot === idx);
                        return (
                            <div key={idx} className={`aspect-square rounded-2xl border-4 flex flex-col items-center justify-center gap-2 ${player ? 'border-green-500 bg-green-500/20' : 'border-gray-800 bg-gray-900/50'}`}>
                                {player ? (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-green-500 flex items-center justify-center text-black font-bold text-2xl">
                                            {player.station_name.substring(0, 2).toUpperCase()}
                                        </div>
                                        <span className="font-bold text-white truncate w-full text-center px-2">{player.station_name}</span>
                                    </>
                                ) : (
                                    <div className="text-gray-700 font-bold text-4xl select-none opacity-20">{idx + 1}</div>
                                )}
                            </div>
                        )
                    })}
                </div>

                {isHost ? (
                    <button
                        onClick={() => StartRaceMutation.mutate()}
                        disabled={!lobbyData || lobbyData.player_count < 2}
                        className="bg-purple-600 hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-2xl px-16 py-6 rounded-2xl shadow-xl shadow-purple-600/20 transform transition-all hover:scale-105"
                    >
                        {StartRaceMutation.isPending ? 'INICIANDO...' : 'INICIAR CARRERA'}
                    </button>
                ) : (
                    <div className="text-center animate-pulse">
                        <p className="text-2xl font-bold text-white mb-2">ESPERANDO AL ANFITRIÓN...</p>
                        <p className="text-gray-400">Prepárate para correr</p>
                    </div>
                )}
            </div>
        )
    }

    // --- RACE MODE (Telemetry & Pit Controls) ---
    const RaceMode = () => {
        // Countdown Timer State
        const [remainingSeconds, setRemainingSeconds] = useState(duration * 60);

        useEffect(() => {
            const timer = setInterval(() => {
                setRemainingSeconds(prev => {
                    if (prev <= 1) {
                        clearInterval(timer);
                        // Session ended - could trigger auto-return to start
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);

            return () => clearInterval(timer);
        }, []);

        const minutes = Math.floor(remainingSeconds / 60);
        const seconds = remainingSeconds % 60;
        const isLowTime = remainingSeconds < 60; // Last minute warning

        return (
            <div className="h-full flex flex-col animate-in fade-in duration-500">
                {/* COUNTDOWN TIMER - Prominent Display */}
                <div className={`text-center py-4 rounded-2xl mb-6 transition-colors ${isLowTime ? 'bg-red-500/20 animate-pulse' : 'bg-blue-500/10'}`}>
                    <div className={`text-6xl font-numeric font-black ${isLowTime ? 'text-red-400' : 'text-blue-400'}`}>
                        <Clock className="inline-block mr-3 -mt-2" size={48} />
                        {String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
                    </div>
                    <p className={`text-sm font-bold uppercase tracking-widest mt-1 ${isLowTime ? 'text-red-500' : 'text-gray-500'}`}>
                        {isLowTime ? '¡TIEMPO CASI AGOTADO!' : 'TIEMPO RESTANTE'}
                    </p>
                </div>

                <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white">{selection?.track.toUpperCase()}</h2>
                        <p className="text-xl text-blue-400 font-bold">{driver?.name}</p>
                    </div>
                    <button
                        onClick={() => {
                            if (confirm("¿Finalizar sesión y volver al menú?")) {
                                setIsLaunched(false);
                                setStep(1);
                                setDriver(null);
                            }
                        }}
                        className="bg-red-500/20 hover:bg-red-500 text-red-400 hover:text-white px-6 py-3 rounded-xl border border-red-500/50 font-bold flex items-center gap-2 transition-all"
                    >
                        <LogOut size={20} /> SALIR
                    </button>
                </div>

                {/* RACE DASHBOARD */}
                <div className="grid grid-cols-2 gap-8 flex-1">
                    {/* LEFT: Live Telemetry Placeholder */}
                    <div className="bg-black/40 rounded-3xl border border-gray-800 p-8 flex items-center justify-center relative overflow-hidden">
                        <div className="text-center">
                            <h3 className="text-6xl font-numeric text-white mb-2">1:45.302</h3>
                            <p className="text-green-400 font-bold text-xl uppercase tracking-widest">Mejor Vuelta</p>
                        </div>
                        {/* Mock Graph Line */}
                        <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-blue-500/10 to-transparent">
                            <svg className="w-full h-full" preserveAspectRatio="none">
                                <path d="M0,100 C150,50 300,80 450,20 L450,150 L0,150 Z" fill="rgba(59, 130, 246, 0.2)" />
                            </svg>
                        </div>
                    </div>

                    {/* RIGHT: Pit Controls (Tyres) */}
                    <div className="space-y-4">
                        <h3 className="text-xl font-bold text-gray-400 mb-2">INGENIERO DE PISTA</h3>
                        <div className="grid grid-cols-2 gap-4">
                            <button className="bg-red-900/40 border-2 border-red-600/50 hover:bg-red-600 hover:text-white text-red-400 p-6 rounded-2xl font-black text-xl transition-all">
                                SOFT
                            </button>
                            <button className="bg-yellow-900/40 border-2 border-yellow-600/50 hover:bg-yellow-600 hover:text-white text-yellow-400 p-6 rounded-2xl font-black text-xl transition-all">
                                MEDIUM
                            </button>
                            <button className="bg-white/10 border-2 border-gray-500/50 hover:bg-gray-100 hover:text-black text-gray-300 p-6 rounded-2xl font-black text-xl transition-all">
                                HARD
                            </button>
                            <button className="bg-blue-900/40 border-2 border-blue-600/50 hover:bg-blue-600 hover:text-white text-blue-400 p-6 rounded-2xl font-black text-xl transition-all">
                                WET
                            </button>
                        </div>
                        <div className="mt-8">
                            <h3 className="text-xl font-bold text-gray-400 mb-2">COMBUSTIBLE</h3>
                            <div className="flex gap-4">
                                <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700">+ 10L</button>
                                <button className="flex-1 bg-gray-800 hover:bg-gray-700 text-white font-bold py-4 rounded-xl border border-gray-700">LLENAR</button>
                            </div>
                        </div>
                    </div>
                </div>

                {/* CANCEL SESSION BUTTON */}
                <div className="mt-8 border-t border-gray-800 pt-6">
                    <button
                        onClick={async () => {
                            if (confirm('¿Seguro que quieres CANCELAR la sesión? El juego se cerrará.')) {
                                try {
                                    await axios.post(`${API_URL}/control/station/${stationId}/panic`);
                                } catch (e) {
                                    console.error('Error sending panic:', e);
                                }
                                // Reset to step 1
                                setIsLaunched(false);
                                setStep(1);
                                setSelection(null);
                                setDriver(null);
                            }
                        }}
                        className="w-full bg-red-600/20 hover:bg-red-600 border-2 border-red-600/50 text-red-400 hover:text-white font-black text-2xl py-6 rounded-2xl transition-all flex items-center justify-center gap-4"
                    >
                        <LogOut size={28} />
                        CANCELAR SESIÓN
                    </button>
                </div>
            </div>
        )
    };


    // --- RENDER CURRENT STEP ---
    const renderStep = () => {
        if (isLaunched) return <RaceMode />;

        switch (step) {
            case 1: return <DriverStep />;
            case 1.5: return <LobbySelectionStep />;
            case 2: return <ContentStep />;
            case 3: return <DifficultyStep />;
            case 4: return <WaitingRoom />;
            default: return <DriverStep />;
        }
    }

    return (
        <div className="w-full h-screen bg-[#050505] text-white p-8 overflow-hidden font-sans select-none">
            {/* BACKGROUND DECORATION */}
            <div className="fixed inset-0 pointer-events-none opacity-20">
                <div className="absolute top-0 right-0 w-[500px] h-[500px] bg-blue-600 rounded-full blur-[150px] -translate-y-1/2 translate-x-1/4" />
                <div className="absolute bottom-0 left-0 w-[500px] h-[500px] bg-indigo-900 rounded-full blur-[150px] translate-y-1/2 -translate-x-1/4" />
            </div>

            <div className="relative z-10 w-full h-full flex flex-col">
                {/* TOP BAR */}
                <div className="flex justify-between items-center mb-8">
                    <div className="flex items-center gap-2">
                        <Gauge className="text-gray-600" />
                        <span className="text-gray-600 font-bold text-sm tracking-widest">AC MANAGER KIOSK v1.0</span>
                    </div>
                    {/* Step indicator */}
                    {!isLaunched && (
                        <div className="flex gap-2">
                            {[1, 2, 3, 4].map(s => (
                                <div key={s} className={`h-2 w-16 rounded-full transition-colors ${Math.floor(step) >= s ? 'bg-blue-500' : 'bg-gray-800'}`} />
                            ))}
                        </div>
                    )}
                </div>

                {/* MAIN CONTENT AREA */}
                <div className="flex-1 min-h-0">
                    {renderStep()}
                </div>
            </div>
        </div>
    );
}
