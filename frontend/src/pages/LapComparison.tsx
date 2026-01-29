import { useState, useEffect } from 'react';
import { BarChart3, Users, TrendingUp, Clock, Award, RefreshCw, Search } from 'lucide-react';
import api from '../api/client';

interface ComparisonStats {
    driver_name: string;
    best_lap: number;
    total_laps: number;
    consistency: number;
    win_count: number;
}

interface ComparisonResult {
    track_name: string;
    car_model: string | null;
    driver_1: ComparisonStats;
    driver_2: ComparisonStats;
    time_gap: number;
}

interface TrackOption {
    track: string;
}

export default function LapComparison() {
    const [driver1, setDriver1] = useState('');
    const [driver2, setDriver2] = useState('');
    const [track, setTrack] = useState('');
    const [tracks, setTracks] = useState<TrackOption[]>([]);
    const [result, setResult] = useState<ComparisonResult | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        fetchTracks();
    }, []);

    const fetchTracks = async () => {
        try {
            const res = await api.get('/telemetry/active-combinations');
            if (Array.isArray(res.data)) {
                setTracks(res.data);
                if (res.data.length > 0) setTrack(res.data[0].track);
            } else {
                console.warn("API did not return an array:", res.data);
                setTracks([]);
            }
        } catch (err) {
            console.error('Error fetching tracks:', err);
            setTracks([]);
        }
    };

    const compare = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!driver1 || !driver2 || !track) return;

        setLoading(true);
        setError('');
        setResult(null);

        try {
            const res = await api.get(`/telemetry/compare/${encodeURIComponent(driver1)}/${encodeURIComponent(driver2)}`, {
                params: { track }
            });
            setResult(res.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Error en la comparación');
        } finally {
            setLoading(false);
        }
    };

    const formatTime = (ms: number) => {
        if (!ms) return '--:--.---';
        const min = Math.floor(ms / 60000);
        const sec = Math.floor((ms % 60000) / 1000);
        const mils = ms % 1000;
        return `${min}:${sec.toString().padStart(2, '0')}.${mils.toString().padStart(3, '0')}`;
    };

    const getWinnerClass = (wins: number, otherWins: number) => {
        if (wins > otherWins) return 'border-green-500 bg-green-500/10';
        if (wins < otherWins) return 'border-red-500 bg-red-500/10';
        return 'border-gray-600';
    };

    return (
        <div className="p-6 space-y-6">
            {/* Header */}
            <div>
                <h1 className="text-3xl font-bold text-white flex items-center gap-3">
                    <BarChart3 className="text-blue-400" /> Comparador de Vueltas
                </h1>
                <p className="text-gray-400 mt-1">Compara el rendimiento entre dos pilotos</p>
            </div>

            {/* Search Form */}
            <form onSubmit={compare} className="bg-gray-800/50 border border-gray-700 rounded-xl p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    <div>
                        <label className="text-gray-400 text-sm mb-1 block">Piloto 1</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Nombre del piloto"
                                value={driver1}
                                onChange={(e) => setDriver1(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-gray-400 text-sm mb-1 block">Piloto 2</label>
                        <div className="relative">
                            <Users className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" size={18} />
                            <input
                                type="text"
                                placeholder="Nombre del piloto"
                                value={driver2}
                                onChange={(e) => setDriver2(e.target.value)}
                                className="w-full pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white placeholder-gray-400"
                            />
                        </div>
                    </div>
                    <div>
                        <label className="text-gray-400 text-sm mb-1 block">Circuito</label>
                        <select
                            value={track}
                            onChange={(e) => setTrack(e.target.value)}
                            className="w-full px-4 py-2 bg-gray-700 border border-gray-600 rounded-lg text-white"
                        >
                            {tracks.map((t, i) => (
                                <option key={i} value={t.track}>{t.track}</option>
                            ))}
                        </select>
                    </div>
                    <div className="flex items-end">
                        <button
                            type="submit"
                            disabled={loading || !driver1 || !driver2}
                            className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                        >
                            {loading ? <RefreshCw className="animate-spin" size={18} /> : <Search size={18} />}
                            Comparar
                        </button>
                    </div>
                </div>
            </form>

            {/* Error */}
            {error && (
                <div className="bg-red-500/20 border border-red-500/30 text-red-400 px-4 py-3 rounded-lg">
                    {error}
                </div>
            )}

            {/* Results */}
            {result && (
                <div className="space-y-6">
                    <div className="text-center">
                        <h2 className="text-xl text-gray-400">Comparación en <span className="text-white font-bold">{result.track_name}</span></h2>
                        <p className="text-sm text-gray-500">Diferencia: <span className="text-yellow-400 font-mono">{formatTime(result.time_gap)}</span></p>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Driver 1 */}
                        <div className={`border-2 rounded-2xl p-6 ${getWinnerClass(result.driver_1.win_count, result.driver_2.win_count)}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-2xl font-bold text-white">{result.driver_1.driver_name}</h3>
                                {result.driver_1.win_count > result.driver_2.win_count && (
                                    <Award className="text-yellow-400" size={28} />
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 flex items-center gap-2"><Clock size={16} /> Mejor Tiempo</span>
                                    <span className="text-2xl font-mono text-white">{formatTime(result.driver_1.best_lap)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Total Vueltas</span>
                                    <span className="text-xl font-bold text-white">{result.driver_1.total_laps}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 flex items-center gap-2"><TrendingUp size={16} /> Consistencia</span>
                                    <span className="text-lg text-white">{result.driver_1.consistency.toFixed(1)} ms</span>
                                </div>
                            </div>
                        </div>

                        {/* Driver 2 */}
                        <div className={`border-2 rounded-2xl p-6 ${getWinnerClass(result.driver_2.win_count, result.driver_1.win_count)}`}>
                            <div className="flex items-center justify-between mb-4">
                                <h3 className="text-2xl font-bold text-white">{result.driver_2.driver_name}</h3>
                                {result.driver_2.win_count > result.driver_1.win_count && (
                                    <Award className="text-yellow-400" size={28} />
                                )}
                            </div>
                            <div className="space-y-3">
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 flex items-center gap-2"><Clock size={16} /> Mejor Tiempo</span>
                                    <span className="text-2xl font-mono text-white">{formatTime(result.driver_2.best_lap)}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400">Total Vueltas</span>
                                    <span className="text-xl font-bold text-white">{result.driver_2.total_laps}</span>
                                </div>
                                <div className="flex justify-between items-center">
                                    <span className="text-gray-400 flex items-center gap-2"><TrendingUp size={16} /> Consistencia</span>
                                    <span className="text-lg text-white">{result.driver_2.consistency.toFixed(1)} ms</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Winner Banner */}
                    <div className="bg-gradient-to-r from-green-600/20 via-green-500/10 to-green-600/20 border border-green-500/30 rounded-xl p-4 text-center">
                        <p className="text-gray-400">GANADOR</p>
                        <p className="text-3xl font-black text-green-400">
                            {result.driver_1.win_count > result.driver_2.win_count
                                ? result.driver_1.driver_name
                                : result.driver_2.win_count > result.driver_1.win_count
                                    ? result.driver_2.driver_name
                                    : 'EMPATE'}
                        </p>
                        <p className="text-sm text-gray-400 mt-1">
                            {result.driver_1.win_count > result.driver_2.win_count
                                ? `${formatTime(result.time_gap)} más rápido`
                                : result.driver_2.win_count > result.driver_1.win_count
                                    ? `${formatTime(result.time_gap)} más rápido`
                                    : 'Misma puntuación en criterios'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
