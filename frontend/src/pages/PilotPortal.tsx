import { useState, useEffect } from 'react';
import { User, Trophy, Clock, Car, MapPin, Award, TrendingUp, Mail, ArrowLeft } from 'lucide-react';
import api from '../api/client';

interface DriverProfile {
    driver_name: string;
    email: string | null;
    elo_rating: number;
    total_wins: number;
    total_podiums: number;
    total_races: number;
    membership_tier: string;
    loyalty_points: number;
    created_at: string;
}

interface SessionItem {
    id: number;
    car: string;
    track: string;
    best_lap: string;
    best_lap_raw: number;
    session_type: string;
    date: string;
}

interface DriverStats {
    total_sessions: number;
    total_laps: number;
    favorite_car: string | null;
    favorite_track: string | null;
    best_lap_time: string | null;
    best_lap_track: string | null;
}

interface Badge {
    name: string;
    description: string;
    icon: string;
}

export default function PilotPortal() {
    const [identifier, setIdentifier] = useState('');
    const [profile, setProfile] = useState<DriverProfile | null>(null);
    const [sessions, setSessions] = useState<SessionItem[]>([]);
    const [stats, setStats] = useState<DriverStats | null>(null);
    const [badges, setBadges] = useState<Badge[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [searched, setSearched] = useState(false);

    const searchPilot = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!identifier.trim()) return;

        setLoading(true);
        setError('');
        setSearched(true);

        try {
            const [profileRes, sessionsRes, statsRes, badgesRes] = await Promise.all([
                api.get(`/portal/${encodeURIComponent(identifier)}/profile`),
                api.get(`/portal/${encodeURIComponent(identifier)}/sessions`),
                api.get(`/portal/${encodeURIComponent(identifier)}/stats`),
                api.get(`/portal/${encodeURIComponent(identifier)}/badges`)
            ]);

            setProfile(profileRes.data);
            setSessions(sessionsRes.data);
            setStats(statsRes.data);
            setBadges(badgesRes.data);
        } catch (err: any) {
            setError(err.response?.data?.detail || 'Piloto no encontrado');
            setProfile(null);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setProfile(null);
        setSessions([]);
        setStats(null);
        setBadges([]);
        setSearched(false);
        setIdentifier('');
    };

    const getTierColor = (tier: string) => {
        switch (tier.toLowerCase()) {
            case 'platinum': return 'text-purple-400 bg-purple-500/20';
            case 'gold': return 'text-yellow-400 bg-yellow-500/20';
            case 'silver': return 'text-gray-300 bg-gray-500/20';
            default: return 'text-orange-400 bg-orange-500/20';
        }
    };

    if (!searched) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
                <div className="text-center max-w-md w-full">
                    <div className="mb-8">
                        <div className="w-24 h-24 bg-blue-600/20 rounded-full flex items-center justify-center mx-auto mb-6">
                            <User size={48} className="text-blue-400" />
                        </div>
                        <h1 className="text-4xl font-black text-white mb-2">Portal del Piloto</h1>
                        <p className="text-gray-400">Consulta tu historial, estadísticas e insignias</p>
                    </div>

                    <form onSubmit={searchPilot} className="space-y-4">
                        <div className="relative">
                            <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                            <input
                                type="text"
                                placeholder="Tu email o nombre de piloto"
                                value={identifier}
                                onChange={(e) => setIdentifier(e.target.value)}
                                className="w-full pl-12 pr-4 py-4 bg-gray-800 border border-gray-700 rounded-xl text-white placeholder-gray-400 focus:border-blue-500 focus:outline-none"
                            />
                        </div>
                        <button
                            type="submit"
                            disabled={loading}
                            className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl transition-colors disabled:opacity-50"
                        >
                            {loading ? 'Buscando...' : 'Ver Mi Perfil'}
                        </button>
                    </form>

                    {error && <p className="mt-4 text-red-400">{error}</p>}
                </div>
            </div>
        );
    }

    if (!profile) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
                <div className="text-center">
                    <p className="text-red-400 text-xl mb-4">{error || 'Piloto no encontrado'}</p>
                    <button onClick={reset} className="text-blue-400 hover:underline flex items-center gap-2 mx-auto">
                        <ArrowLeft size={16} /> Volver a buscar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900 p-6">
            <div className="max-w-4xl mx-auto space-y-6">
                {/* Back Button */}
                <button onClick={reset} className="text-gray-400 hover:text-white flex items-center gap-2">
                    <ArrowLeft size={16} /> Buscar otro piloto
                </button>

                {/* Profile Header */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <div className="flex items-center gap-6">
                        <div className="w-20 h-20 bg-blue-600/20 rounded-full flex items-center justify-center">
                            <User size={40} className="text-blue-400" />
                        </div>
                        <div className="flex-1">
                            <h1 className="text-3xl font-bold text-white">{profile.driver_name}</h1>
                            <div className="flex items-center gap-4 mt-2">
                                <span className={`px-3 py-1 rounded-full text-sm font-medium ${getTierColor(profile.membership_tier)}`}>
                                    {profile.membership_tier.toUpperCase()}
                                </span>
                                <span className="text-gray-400">ELO: <span className="text-white font-bold">{profile.elo_rating}</span></span>
                                <span className="text-gray-400">Puntos: <span className="text-yellow-400 font-bold">{profile.loyalty_points}</span></span>
                            </div>
                        </div>
                        <div className="text-right">
                            <div className="text-3xl font-black text-yellow-400">{profile.total_wins}</div>
                            <div className="text-xs text-gray-400">VICTORIAS</div>
                        </div>
                    </div>
                </div>

                {/* Stats Grid */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
                            <Clock size={24} className="mx-auto text-blue-400 mb-2" />
                            <div className="text-2xl font-bold text-white">{stats.total_sessions}</div>
                            <div className="text-xs text-gray-400">Sesiones</div>
                        </div>
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
                            <TrendingUp size={24} className="mx-auto text-green-400 mb-2" />
                            <div className="text-2xl font-bold text-white">{stats.best_lap_time || '--'}</div>
                            <div className="text-xs text-gray-400">Mejor Tiempo</div>
                        </div>
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
                            <Car size={24} className="mx-auto text-purple-400 mb-2" />
                            <div className="text-lg font-bold text-white truncate">{stats.favorite_car || '--'}</div>
                            <div className="text-xs text-gray-400">Coche Favorito</div>
                        </div>
                        <div className="bg-gray-800/50 border border-gray-700 rounded-xl p-4 text-center">
                            <MapPin size={24} className="mx-auto text-orange-400 mb-2" />
                            <div className="text-lg font-bold text-white truncate">{stats.favorite_track || '--'}</div>
                            <div className="text-xs text-gray-400">Pista Favorita</div>
                        </div>
                    </div>
                )}

                {/* Badges */}
                {badges.length > 0 && (
                    <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                        <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                            <Award className="text-yellow-400" /> Insignias
                        </h2>
                        <div className="flex flex-wrap gap-3">
                            {badges.map((b, i) => (
                                <div key={i} className="flex items-center gap-2 px-4 py-2 bg-gray-700/50 rounded-full">
                                    <span className="text-2xl">{b.icon}</span>
                                    <div>
                                        <div className="text-white font-medium text-sm">{b.name}</div>
                                        <div className="text-gray-400 text-xs">{b.description}</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Recent Sessions */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <h2 className="text-xl font-bold text-white mb-4 flex items-center gap-2">
                        <Trophy className="text-blue-400" /> Historial de Sesiones
                    </h2>
                    {sessions.length === 0 ? (
                        <p className="text-gray-400 text-center py-8">Sin sesiones registradas</p>
                    ) : (
                        <div className="space-y-3">
                            {sessions.slice(0, 10).map((s) => (
                                <div key={s.id} className="flex items-center justify-between py-3 border-b border-gray-700 last:border-0">
                                    <div className="flex items-center gap-4">
                                        <div className="text-2xl font-mono text-white">{s.best_lap}</div>
                                        <div>
                                            <div className="text-white font-medium">{s.track}</div>
                                            <div className="text-gray-400 text-sm">{s.car}</div>
                                        </div>
                                    </div>
                                    <div className="text-right text-sm text-gray-400">
                                        {new Date(s.date).toLocaleDateString('es-ES')}
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
