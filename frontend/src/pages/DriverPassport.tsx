import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPilotProfile } from '../api/telemetry';
import { ArrowLeft, History as HistoryIcon, Calendar } from 'lucide-react';
import {
    ResponsiveContainer, Tooltip, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar, LineChart,
    CartesianGrid, XAxis, YAxis, Line
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function DriverPassport() {
    const { driverName } = useParams<{ driverName: string }>();
    const { data: profile, isLoading } = useQuery({
        queryKey: ['pilot', driverName],
        queryFn: () => getPilotProfile(driverName!),
        enabled: !!driverName
    });

    if (isLoading) return <div className="p-8 text-white">Cargando perfil...</div>;
    if (!profile) return <div className="p-8 text-red-500">Piloto no encontrado</div>;

    // Data for Radar Chart (Skills)
    const radarData = [
        { subject: 'Consistencia', A: profile.avg_consistency, fullMark: 100 },
        { subject: 'Experiencia', A: Math.min(100, profile.total_laps / 5), fullMark: 100 }, // Cap at 500 laps
        { subject: 'Actividad', A: Math.min(100, profile.active_days * 10), fullMark: 100 },
        { subject: 'Versatilidad', A: Math.min(100, profile.records.length * 20), fullMark: 100 }, // Tracks driven
        { subject: 'Velocidad', A: 85, fullMark: 100 }, // Placebo for now until we have ELO
    ];

    // Mock History Data (Derived from recent sessions for visualization)
    // We take the best lap of each session and reverse chronological order
    const historyData = profile.recent_sessions
        .slice()
        .reverse()
        .map(s => ({
            date: format(new Date(s.date), 'dd/MM'),
            time: s.best_lap,
            originalDate: s.date
        }));

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen bg-gray-950 text-white">
            <Link to="/drivers" className="inline-flex items-center text-gray-400 hover:text-white mb-8 transition-colors">
                <ArrowLeft size={20} className="mr-2" /> Volver a Pilotos
            </Link>

            {/* Header Profile Card */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
                <div className="lg:col-span-1 bg-gradient-to-br from-gray-900 to-gray-800 rounded-3xl p-8 border border-gray-700 shadow-2xl relative overflow-hidden">
                    <div className="relative z-10 text-center">
                        <div className="w-32 h-32 bg-gray-700 rounded-full mx-auto mb-6 flex items-center justify-center text-4xl font-bold border-4 border-gray-600 shadow-xl">
                            {driverName?.substring(0, 2).toUpperCase()}
                        </div>
                        <h1 className="text-3xl font-black italic uppercase tracking-tighter mb-2">{driverName}</h1>
                        <div className="flex justify-center gap-2 mb-6">
                            <span className="bg-yellow-500/20 text-yellow-500 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-yellow-500/20">
                                { /* rank_tier might not exist on type yet, fallback */}
                                ROOKIE
                            </span>
                            {/* VMS Badge */}
                            <span className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest border border-blue-500/20 flex items-center gap-1">
                                VMS Linked
                            </span>
                        </div>

                        <div className="grid grid-cols-2 gap-4 text-left bg-black/20 p-4 rounded-xl">
                            <div>
                                <div className="text-xs text-gray-500 font-bold uppercase">Victorias</div>
                                <div className="text-xl font-mono font-bold text-yellow-500">{profile.total_wins}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 font-bold uppercase">Podios</div>
                                <div className="text-xl font-mono font-bold text-gray-300">{profile.total_podiums}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 font-bold uppercase">Carreras</div>
                                <div className="text-xl font-mono font-bold text-white">{profile.total_laps || 0}</div> {/* Still using total_laps as proxy for experience, can be total_races if added to API */}
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 font-bold uppercase">ELO Rating</div>
                                <div className={`text-xl font-mono font-bold ${profile.elo_rating >= 1500 ? 'text-purple-400' : 'text-green-400'}`}>
                                    {Math.round(profile.elo_rating)}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Radar Chart */}
                <div className="lg:col-span-2 bg-gray-900 rounded-3xl p-8 border border-gray-800 shadow-xl flex items-center justify-center relative">
                    <h3 className="absolute top-8 left-8 text-xl font-black italic uppercase text-gray-500">
                        Análisis de Rendimiento
                    </h3>
                    <div className="w-full h-[300px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="#374151" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 12, fontWeight: 'bold' }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name={driverName}
                                    dataKey="A"
                                    stroke="#3B82F6"
                                    strokeWidth={3}
                                    fill="#3B82F6"
                                    fillOpacity={0.3}
                                />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', borderRadius: '12px', color: 'white' }}
                                    itemStyle={{ color: '#60A5FA' }}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            {/* History Chart */}
            <div className="bg-gray-900 rounded-3xl p-8 border border-gray-800 shadow-xl mb-8">
                <div className="flex justify-between items-end mb-6">
                    <div>
                        <h3 className="text-2xl font-black italic uppercase text-white mb-1">
                            Historial de Tiempos
                        </h3>
                        <p className="text-gray-500 text-sm">Evolución del ritmo en las últimas sesiones</p>
                    </div>
                </div>
                <div className="h-[300px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={historyData}>
                            <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                            <XAxis
                                dataKey="date"
                                stroke="#6B7280"
                                tick={{ fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <YAxis
                                domain={['dataMin - 1000', 'dataMax + 1000']}
                                stroke="#6B7280"
                                tickFormatter={(val) => (val / 1000).toFixed(1)}
                                tick={{ fontSize: 12 }}
                                axisLine={false}
                                tickLine={false}
                            />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', borderRadius: '8px' }}
                                labelStyle={{ color: '#9CA3AF' }}
                                formatter={(value: number | string) => [`${(Number(value) / 1000).toFixed(3)}s`, 'Tiempo']}
                            />
                            <Line
                                type="monotone"
                                dataKey="time"
                                stroke="#F59E0B"
                                strokeWidth={3}
                                dot={{ fill: '#F59E0B', r: 4, strokeWidth: 0 }}
                                activeDot={{ r: 6, stroke: 'white', strokeWidth: 2 }}
                            />
                        </LineChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Recent Activity Table using old style but dark */}
            <div className="bg-gray-900 rounded-2xl shadow-sm border border-gray-800 overflow-hidden">
                <div className="p-6 border-b border-gray-800 flex justify-between items-center">
                    <h2 className="text-gray-300 font-bold flex items-center gap-2">
                        <HistoryIcon className="text-blue-500" />
                        Historial de Sesiones
                    </h2>
                </div>
                <div className="p-6 space-y-4">
                    {profile.recent_sessions.map(session => (
                        <div key={session.session_id} className="flex items-center justify-between p-4 rounded-xl bg-gray-800 border border-transparent hover:border-gray-700 transition-all">
                            <div className="flex items-center gap-4">
                                <div className="w-10 h-10 bg-gray-700 rounded-lg flex items-center justify-center shadow-sm text-gray-400">
                                    <Calendar size={20} />
                                </div>
                                <div>
                                    <div className="font-bold text-gray-200 text-sm">{session.track_name}</div>
                                    <div className="text-xs text-gray-500">{session.car_model}</div>
                                </div>
                            </div>

                            <div className="text-right">
                                <div className="font-mono font-bold text-sm text-gray-300">
                                    {new Date(session.best_lap).toISOString().slice(14, 23).replace('.', ':')}
                                </div>
                                <div className="text-xs text-gray-500">
                                    {formatDistanceToNow(new Date(session.date), { addSuffix: true, locale: es })} • {session.laps_count} vueltas
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
