import { useParams, Link, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getPilotProfile } from '../api/telemetry';
import { Trophy, ArrowLeft, Star, TrendingUp, Clock, Share2, Download, Zap, Users, FileText } from 'lucide-react';
import {
    ResponsiveContainer, RadarChart, PolarGrid,
    PolarAngleAxis, PolarRadiusAxis, Radar, LineChart,
    CartesianGrid, XAxis, YAxis, Line, Tooltip
} from 'recharts';
import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

export default function PilotPortal() {
    const { driverName } = useParams<{ driverName: string }>();
    const navigate = useNavigate();
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

    const handleDownloadReport = (sessionId: number) => {
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/telemetry/session/${sessionId}/pdf`;
        window.open(url, '_blank');
    };

    const handleDownloadTelemetry = (lapId?: number) => {
        if (!lapId) {
            alert("No hay telemetría avanzada disponible para esta sesión.");
            return;
        }
        const url = `${import.meta.env.VITE_API_URL || 'http://localhost:8000'}/telemetry/lap/${lapId}/telemetry`;
        window.open(url, '_blank');
    };

    return (
        <div className="min-h-screen bg-gray-950 text-white pb-20">
            {/* Header Mobile Sticky */}
            <div className="sticky top-0 z-50 bg-gray-900/80 backdrop-blur-md border-b border-gray-800 p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <button onClick={() => navigate(-1)} className="p-2 bg-gray-800 rounded-full text-gray-400 hover:text-white transition-colors">
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-lg font-black italic uppercase truncate max-w-[150px]">{driverName}</h1>
                        <div className="text-[10px] text-blue-400 font-bold uppercase tracking-widest">Nivel {profile.level || 1} • {profile.xp_points || 0} XP</div>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => {
                            if (navigator.share) {
                                navigator.share({
                                    title: `Perfil de Piloto: ${driverName}`,
                                    text: `Mira mis estadísticas en Assetto Manager!`,
                                    url: window.location.href
                                }).catch(console.error);
                            } else {
                                alert("Copia la URL para compartir!");
                            }
                        }}
                        className="p-2 bg-blue-600 rounded-full text-white shadow-lg hover:bg-blue-500 transition-colors"
                    >
                        <Share2 size={20} />
                    </button>
                    <div className="bg-gray-800 px-3 py-1 rounded-full text-xs font-black border border-gray-700">
                        {Math.round(profile.elo_rating)}
                    </div>
                </div>
            </div>

            {/* Level Progress Bar */}
            <div className="h-1 bg-gray-800 w-full overflow-hidden">
                <div
                    className="h-full bg-gradient-to-r from-blue-600 to-purple-600 transition-all duration-1000"
                    style={{ width: `${((profile.xp_points || 0) % 500) / 5}%` }}
                />
            </div>

            <div className="p-4 space-y-4 max-w-lg mx-auto">

                {/* Comparison Hook */}
                <div className="bg-gradient-to-br from-indigo-600 to-blue-700 p-4 rounded-3xl shadow-xl flex items-center justify-between group">
                    <div>
                        <h4 className="font-black italic text-sm mb-1 uppercase">¿Eres mejor que {driverName}?</h4>
                        <p className="text-[10px] text-blue-100 font-medium">Compara tus tiempos cara a cara</p>
                    </div>
                    <Link
                        to={`/compare/${driverName}`}
                        className="bg-white text-blue-600 p-2 rounded-full shadow-lg group-hover:scale-110 transition-transform"
                    >
                        <Users size={20} />
                    </Link>
                </div>

                {/* Badges / Insignias */}
                {profile.badges && profile.badges.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                        {profile.badges.map((badge: any) => (
                            <div key={badge.id} className="flex-shrink-0 bg-gray-900 border border-gray-800 rounded-2xl p-3 flex flex-col items-center gap-1 min-w-[80px]">
                                <span className="text-2xl">{badge.icon}</span>
                                <span className="text-[8px] font-black uppercase text-gray-400 text-center">{badge.label}</span>
                            </div>
                        ))}
                    </div>
                )}

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
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', border: 'none', borderRadius: '12px', fontSize: '10px' }}
                                    itemStyle={{ color: '#F59E0B' }}
                                />
                                <Line
                                    type="monotone"
                                    dataKey="time"
                                    stroke="#F59E0B"
                                    strokeWidth={3}
                                    dot={{ r: 4, fill: '#F59E0B' }}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Recent Activity with Download */}
                <div className="space-y-3">
                    <h3 className="text-xs font-black text-gray-500 uppercase border-b border-gray-800 pb-2">ÚLTIMAS SESIONES</h3>
                    {profile.recent_sessions.slice(0, 5).map(session => (
                        <div key={session.session_id} className="bg-gray-900/50 p-4 rounded-2xl border border-gray-800 flex justify-between items-center group transition-all">
                            <div className="flex gap-4 items-center">
                                <div className="w-10 h-10 bg-gray-800 rounded-lg flex items-center justify-center text-gray-500">
                                    <Zap size={18} className={session.best_lap < 120000 ? 'text-yellow-500' : ''} />
                                </div>
                                <div className="max-w-[120px]">
                                    <div className="text-xs font-bold text-white uppercase truncate">{session.track_name}</div>
                                    <div className="text-[10px] text-gray-500 truncate">{session.car_model}</div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <div className="text-right">
                                    <div className="text-xs font-mono font-bold text-blue-400">
                                        {Math.floor(session.best_lap / 60000)}:{((session.best_lap % 60000) / 1000).toFixed(3).padStart(6, '0')}
                                    </div>
                                    <div className="text-[10px] text-gray-600">
                                        {formatDistanceToNow(new Date(session.date), { addSuffix: true, locale: es })}
                                    </div>
                                </div>
                                <div className="flex gap-1">
                                    <button
                                        onClick={() => handleDownloadReport(session.session_id)}
                                        className="p-2 bg-blue-600/20 hover:bg-blue-600 text-blue-400 hover:text-white rounded-lg transition-all border border-blue-500/20"
                                        title="Informe PDF Profesional"
                                    >
                                        <FileText size={14} />
                                    </button>
                                    <button
                                        onClick={() => handleDownloadTelemetry(session.best_lap_id)}
                                        className="p-2 bg-gray-800 hover:bg-gray-700 text-gray-400 hover:text-white rounded-lg transition-all"
                                        title="Descargar Datos JSON"
                                    >
                                        <Download size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
