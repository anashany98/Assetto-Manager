import { useQuery } from '@tanstack/react-query';
import {
    BarChart, Bar, PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import { TrendingUp, Users, Calendar, Award, Clock, Car, MapPin, Star } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';

interface AnalyticsData {
    summary: {
        total_sessions: number;
        sessions_today: number;
        sessions_this_week: number;
        sessions_this_month: number;
        total_drivers: number;
        active_drivers_week: number;
    };
    bookings: {
        total: number;
        pending: number;
        confirmed: number;
        today: number;
    };
    loyalty: {
        total_points_issued: number;
        total_points_redeemed: number;
        tier_distribution: Record<string, number>;
    };
    top_drivers: Array<{ name: string; sessions: number; best_lap: number }>;
    popular_tracks: Array<{ name: string; sessions: number }>;
    popular_cars: Array<{ name: string; sessions: number }>;
    sessions_per_day: Array<{ date: string; day: string; sessions: number }>;
    peak_hours: Array<{ hour: string; bookings: number }>;
}

const TIER_COLORS: Record<string, string> = {
    bronze: '#cd7f32',
    silver: '#c0c0c0',
    gold: '#ffd700',
    platinum: '#e5e4e2'
};

export default function AnalyticsPanel() {
    const { data, isLoading, error } = useQuery<AnalyticsData>({
        queryKey: ['analytics'],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/analytics/overview`);
            return res.data;
        },
        refetchInterval: 30000 // Refresh every 30 seconds
    });

    if (isLoading) {
        return (
            <div className="bg-gray-800 rounded-2xl p-8 flex items-center justify-center">
                <div className="w-8 h-8 border-4 border-blue-500/20 border-t-blue-500 rounded-full animate-spin" />
            </div>
        );
    }

    if (error || !data) {
        return (
            <div className="bg-gray-800 rounded-2xl p-6 text-center text-gray-500">
                <p>No se pudieron cargar los analytics</p>
            </div>
        );
    }

    const tierData = Object.entries(data.loyalty.tier_distribution).map(([tier, count]) => ({
        name: tier.charAt(0).toUpperCase() + tier.slice(1),
        value: count,
        color: TIER_COLORS[tier] || '#gray'
    }));

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <h2 className="text-xl font-black text-white uppercase tracking-tight flex items-center gap-2">
                    <TrendingUp className="text-green-500" size={24} />
                    Analytics Dashboard
                </h2>
                <span className="text-xs text-gray-500">Actualizado cada 30s</span>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <QuickStat
                    label="Sesiones Hoy"
                    value={data.summary.sessions_today}
                    icon={Clock}
                    color="blue"
                />
                <QuickStat
                    label="Esta Semana"
                    value={data.summary.sessions_this_week}
                    icon={Calendar}
                    color="green"
                />
                <QuickStat
                    label="Pilotos Activos"
                    value={data.summary.active_drivers_week}
                    icon={Users}
                    color="purple"
                />
                <QuickStat
                    label="Reservas Hoy"
                    value={data.bookings.today}
                    icon={Calendar}
                    color="amber"
                />
            </div>

            {/* Sessions Chart */}
            <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">
                    Sesiones últimos 14 días
                </h3>
                <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.sessions_per_day}>
                            <XAxis dataKey="day" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                            <Tooltip
                                contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }}
                                labelStyle={{ color: '#fff' }}
                            />
                            <Bar dataKey="sessions" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
            </div>

            {/* Two Column Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Top Drivers */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Award className="text-yellow-500" size={16} />
                        Top Pilotos (Este Mes)
                    </h3>
                    <div className="space-y-3">
                        {data.top_drivers.length > 0 ? (
                            data.top_drivers.map((driver, i) => (
                                <div key={driver.name} className="flex items-center justify-between bg-gray-900/50 p-3 rounded-xl">
                                    <div className="flex items-center gap-3">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-black text-sm ${i === 0 ? 'bg-yellow-500 text-black' :
                                            i === 1 ? 'bg-gray-400 text-black' :
                                                i === 2 ? 'bg-amber-700 text-white' :
                                                    'bg-gray-700 text-gray-400'
                                            }`}>
                                            {i + 1}
                                        </div>
                                        <span className="font-bold text-white">{driver.name}</span>
                                    </div>
                                    <div className="text-right">
                                        <div className="text-blue-400 font-bold">{driver.sessions} sesiones</div>
                                    </div>
                                </div>
                            ))
                        ) : (
                            <p className="text-gray-600 text-sm text-center py-4">Sin datos todavía</p>
                        )}
                    </div>
                </div>

                {/* Popular Tracks */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <MapPin className="text-green-500" size={16} />
                        Circuitos Populares
                    </h3>
                    <div className="h-48">
                        {data.popular_tracks.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.popular_tracks} layout="vertical">
                                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                                    <Bar dataKey="sessions" fill="#22c55e" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-600 text-sm text-center py-8">Sin datos todavía</p>
                        )}
                    </div>
                </div>

                {/* Popular Cars */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Car className="text-red-500" size={16} />
                        Coches Populares
                    </h3>
                    <div className="h-48">
                        {data.popular_cars.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={data.popular_cars} layout="vertical">
                                    <XAxis type="number" tick={{ fill: '#6b7280', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis type="category" dataKey="name" tick={{ fill: '#9ca3af', fontSize: 11 }} width={120} axisLine={false} tickLine={false} />
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                                    <Bar dataKey="sessions" fill="#ef4444" radius={[0, 4, 4, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-600 text-sm text-center py-8">Sin datos todavía</p>
                        )}
                    </div>
                </div>

                {/* Loyalty Tier Distribution */}
                <div className="bg-gray-800/50 border border-gray-700 rounded-2xl p-6">
                    <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4 flex items-center gap-2">
                        <Star className="text-amber-500" size={16} />
                        Distribución de Niveles
                    </h3>
                    <div className="h-48 flex items-center justify-center">
                        {tierData.some(t => t.value > 0) ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={tierData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={40}
                                        outerRadius={70}
                                        paddingAngle={2}
                                        dataKey="value"
                                    >
                                        {tierData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.color} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={{ backgroundColor: '#1f2937', border: 'none', borderRadius: '8px' }} />
                                    <Legend formatter={(value) => <span style={{ color: '#9ca3af' }}>{value}</span>} />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <p className="text-gray-600 text-sm text-center">Sin distribución todavía</p>
                        )}
                    </div>
                    <div className="mt-4 flex justify-around text-center">
                        <div>
                            <div className="text-2xl font-black text-green-400">{data.loyalty.total_points_issued.toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500 uppercase">Puntos Emitidos</div>
                        </div>
                        <div>
                            <div className="text-2xl font-black text-red-400">{data.loyalty.total_points_redeemed.toLocaleString()}</div>
                            <div className="text-[10px] text-gray-500 uppercase">Puntos Canjeados</div>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bookings Summary */}
            <div className="bg-gradient-to-r from-blue-900/30 to-purple-900/30 border border-blue-500/20 rounded-2xl p-6">
                <h3 className="text-sm font-bold text-gray-400 uppercase tracking-wider mb-4">Resumen Reservas</h3>
                <div className="grid grid-cols-4 gap-4 text-center">
                    <div>
                        <div className="text-3xl font-black text-white">{data.bookings.total}</div>
                        <div className="text-xs text-gray-500">Total</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-yellow-400">{data.bookings.pending}</div>
                        <div className="text-xs text-gray-500">Pendientes</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-green-400">{data.bookings.confirmed}</div>
                        <div className="text-xs text-gray-500">Confirmadas</div>
                    </div>
                    <div>
                        <div className="text-3xl font-black text-blue-400">{data.bookings.today}</div>
                        <div className="text-xs text-gray-500">Hoy</div>
                    </div>
                </div>
            </div>
        </div>
    );
}

// Quick Stat Component
function QuickStat({ label, value, icon: Icon, color }: { label: string; value: number; icon: any; color: string }) {
    const colors: Record<string, string> = {
        blue: 'bg-blue-500/10 text-blue-400 border-blue-500/20',
        green: 'bg-green-500/10 text-green-400 border-green-500/20',
        purple: 'bg-purple-500/10 text-purple-400 border-purple-500/20',
        amber: 'bg-amber-500/10 text-amber-400 border-amber-500/20',
    };

    return (
        <div className={`p-4 rounded-xl border ${colors[color]}`}>
            <div className="flex items-center gap-2 mb-2">
                <Icon size={16} />
                <span className="text-xs font-bold uppercase tracking-wider opacity-80">{label}</span>
            </div>
            <div className="text-3xl font-black">{value}</div>
        </div>
    );
}
