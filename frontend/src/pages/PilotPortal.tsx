import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPilotProfile } from '../api/telemetry';
import { Trophy, Calendar, ArrowLeft, Star, TrendingUp, Clock } from 'lucide-react';
import {
    ResponsiveContainer, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar, LineChart,
    CartesianGrid, XAxis, YAxis, Line
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PilotPortal() {
    const { driverName } = useParams<{ driverName: string }>();
    const { data: profile, isLoading } = useQuery({
        queryKey: ['pilot', driverName],
        queryFn: () => getPilotProfile(driverName!),
        enabled: !!driverName
    });

    if (isLoading) return (
        <div className="min-h-screen bg-black flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
    );

    if (!profile) return (
        <div className="min-h-screen bg-black flex flex-col items-center justify-center p-8 text-center">
            <div className="text-red-500 text-6xl mb-4 font-black">404</div>
            <h1 className="text-2xl font-bold text-white mb-2">PILOTO NO ENCONTRADO</h1>
            <p className="text-gray-500 mb-8">El perfil que buscas no existe o es privado.</p>
            <Link to="/" className="px-6 py-3 bg-blue-600 text-white rounded-full font-bold">Volver al Inicio</Link>
        </div>
    );

    // Data for Radar Chart (Skills)
    const radarData = [
        { subject: 'Consistencia', A: profile.avg_consistency, fullMark: 100 },
        { subject: 'Experiencia', A: Math.min(100, profile.total_laps / 5), fullMark: 100 },
        { subject: 'Actividad', A: Math.min(100, profile.active_days * 10), fullMark: 100 },
        { subject: 'Versatilidad', A: Math.min(100, profile.records.length * 20), fullMark: 100 },
        { subject: 'Velocidad', A: profile.elo_rating > 1200 ? 90 : 70, fullMark: 100 },
    ];

    const historyData = profile.recent_sessions
        .slice()
        .reverse()
        .map(s => ({
            date: format(new Date(s.date), 'dd/MM'),
            time: s.best_lap,
        }));

    return (
        <div className="min-h-screen bg-gray-950 text-white pb-20">
            {/* Header Mobile Sticky */}
            <div className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 p-4 flex items-center gap-4">
                <Link to="/" className="p-2 bg-gray-800 rounded-full">
                    <ArrowLeft size={20} />
                </Link>
                <div className="flex-1">
                    <h1 className="text-lg font-black italic uppercase truncate">{driverName}</h1>
                    <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">PERFIL PÚBLICO DE PILOTO</div>
                </div>
                <div className="bg-blue-600 px-3 py-1 rounded-full text-xs font-black">
                    ELO {Math.round(profile.elo_rating)}
                </div>
            </div>

            <div className="p-4 space-y-4 max-w-lg mx-auto">
                {/* Stats Grid */}
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-gray-900 p-4 rounded-3xl border border-gray-800 flex flex-col items-center text-center">
                        <Trophy className="text-yellow-500 mb-2" size={24} />
                        <div className="text-2xl font-black">{profile.total_wins}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Victorias</div>
                    </div>
                    <div className="bg-gray-900 p-4 rounded-3xl border border-gray-800 flex flex-col items-center text-center">
                        <Star className="text-blue-400 mb-2" size={24} />
                        <div className="text-2xl font-black">{profile.total_podiums}</div>
                        <div className="text-[10px] text-gray-500 uppercase font-bold">Podios</div>
                    </div>
                </div>

                {/* Performance Radar */}
                <div className="bg-gray-900 p-6 rounded-3xl border border-gray-800">
                    <div className="flex items-center gap-2 mb-6">
                        <TrendingUp size={18} className="text-blue-500" />
                        <h3 className="text-sm font-black uppercase tracking-tighter">ANÁLISIS DE RENDIMIENTO</h3>
                    </div>
                    <div className="h-64 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadarChart cx="50%" cy="50%" outerRadius="80%" data={radarData}>
                                <PolarGrid stroke="#374151" />
                                <PolarAngleAxis dataKey="subject" tick={{ fill: '#9CA3AF', fontSize: 10, fontWeight: 'bold' }} />
                                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                                <Radar
                                    name={driverName}
                                    dataKey="A"
                                    stroke="#3B82F6"
                                    strokeWidth={2}
                                    fill="#3B82F6"
                                    fillOpacity={0.3}
                                />
                            </RadarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Progress Chart */}
                <div className="bg-gray-900 p-6 rounded-3xl border border-gray-800">
                    <div className="flex items-center gap-2 mb-6">
                        <Clock size={18} className="text-orange-500" />
                        <h3 className="text-sm font-black uppercase tracking-tighter">EVOLUCIÓN EN PISTA</h3>
                    </div>
                    <div className="h-48 w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={historyData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" vertical={false} />
                                <XAxis dataKey="date" hide />
                                <YAxis hide domain={['auto', 'auto']} />
                                <Line
                                    type="monotone"
                                    dataKey="time"
                                    stroke="#F59E0B"
                                    strokeWidth={3}
                                    dot={false}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Activity */}
                <div className="space-y-3">
                    <h3 className="text-xs font-black text-gray-500 uppercase border-b border-gray-800 pb-2">ÚLTIMAS SESIONES</h3>
                    {profile.recent_sessions.slice(0, 5).map(session => (
                        <div key={session.session_id} className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800 flex justify-between items-center group active:scale-95 transition-all">
                            <div className="flex gap-4 items-center">
                                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
                                    <Calendar size={18} />
                                </div>
                                <div>
                                    <div className="text-xs font-bold text-white uppercase">{session.track_name}</div>
                                    <div className="text-[10px] text-gray-500">{session.car_model}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-xs font-mono font-bold text-blue-400">
                                    {new Date(session.best_lap).toISOString().slice(14, 23).replace('.', ':')}
                                </div>
                                <div className="text-[10px] text-gray-600">
                                    {formatDistanceToNow(new Date(session.date), { addSuffix: true, locale: es })}
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
