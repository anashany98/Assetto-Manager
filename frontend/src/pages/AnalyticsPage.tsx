
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import {
    BarChart,
    Bar,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    AreaChart,
    Area,
    PieChart,
    Pie,
    Cell,
    Legend
} from 'recharts';
import { BadgeDollarSign, TrendingUp, Calendar, Clock, CreditCard } from 'lucide-react';
import { useState } from 'react';

// --- API ---

const getRevenue = async (range: number) => {
    const res = await axios.get(`${API_URL}/analytics/revenue?range_days=${range}`);
    return res.data;
};

const getUtilization = async (range: number) => {
    const res = await axios.get(`${API_URL}/analytics/utilization?range_days=${range}`);
    return res.data;
};

const getKPIs = async (range: number) => {
    const res = await axios.get(`${API_URL}/analytics/kpi?range_days=${range}`);
    return res.data;
};

const getPaymentMethods = async (range: number) => {
    const res = await axios.get(`${API_URL}/analytics/payment-methods?range_days=${range}`);
    return res.data;
};

export default function AnalyticsPage() {
    const [range, setRange] = useState(30);

    const { data: revenueData } = useQuery({
        queryKey: ['analytics-revenue', range],
        queryFn: () => getRevenue(range)
    });

    const { data: utilizationData } = useQuery({
        queryKey: ['analytics-utilization', range],
        queryFn: () => getUtilization(range)
    });

    const { data: kpis } = useQuery({
        queryKey: ['analytics-kpi', range],
        queryFn: () => getKPIs(range)
    });

    const { data: paymentMethodsData } = useQuery({
        queryKey: ['analytics-payment-methods', range],
        queryFn: () => getPaymentMethods(range)
    });

    return (
        <div className="p-8 max-w-[1600px] mx-auto min-h-screen">
            {/* Header */}
            <div className="flex justify-between items-end mb-8 border-b border-gray-800 pb-6">
                <div>
                    <h1 className="text-3xl font-black text-white tracking-tight flex items-center gap-3">
                        <BadgeDollarSign className="text-green-500" size={32} />
                        ANÁLISIS DE NEGOCIO
                    </h1>
                    <p className="text-gray-400 mt-1 font-medium">Métricas de rendimiento financiero y operativo</p>
                </div>
                <div className="flex bg-gray-900 rounded-lg p-1 border border-gray-800">
                    {[7, 30, 90, 365].map((r) => (
                        <button
                            key={r}
                            onClick={() => setRange(r)}
                            className={`px-4 py-2 rounded-md text-sm font-bold transition-all ${range === r
                                ? 'bg-gray-800 text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-300'
                                }`}
                        >
                            {r === 365 ? '1 Año' : `${r} Días`}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-10">
                <KPICard
                    label="Ingresos Totales"
                    value={kpis?.total_revenue ? `€${kpis.total_revenue.toLocaleString()}` : '€0'}
                    icon={BadgeDollarSign}
                    color="green"
                />
                <KPICard
                    label="Sesiones Vendidas"
                    value={kpis?.total_sessions || "0"}
                    icon={Calendar}
                    color="blue"
                />
                <KPICard
                    label="Ticket Medio"
                    value={kpis?.avg_ticket ? `€${kpis.avg_ticket}` : '€0'}
                    icon={TrendingUp}
                    color="purple"
                />
                <KPICard
                    label="Ingreso / Sesión"
                    value={kpis?.revenue_per_session ? `€${kpis.revenue_per_session}` : '€0'}
                    icon={Clock}
                    color="orange"
                />
            </div>

            {/* Charts Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">

                {/* Revenue Chart */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <TrendingUp size={20} className="text-green-400" /> Evolución de Ingresos
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={revenueData || []}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickFormatter={(str) => str.slice(5)} />
                                <YAxis stroke="#9CA3AF" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="Ingresos (€)" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Utilization Chart */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <Clock size={20} className="text-blue-400" /> Horas de Mayor Actividad
                    </h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={utilizationData || []}>
                                <defs>
                                    <linearGradient id="colorCount" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.8} />
                                        <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                    </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                                <XAxis dataKey="hour" stroke="#9CA3AF" fontSize={12} tickFormatter={(h) => `${h}:00`} />
                                <YAxis stroke="#9CA3AF" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                />
                                <Area type="monotone" dataKey="count" stroke="#3B82F6" fillOpacity={1} fill="url(#colorCount)" name="Sesiones" />
                            </AreaChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Payment Methods Chart */}
                <div className="bg-gray-900/50 border border-gray-800 rounded-2xl p-6 backdrop-blur-sm col-span-1 lg:col-span-2 xl:col-span-1">
                    <h3 className="text-xl font-bold text-white mb-6 flex items-center gap-2">
                        <CreditCard size={20} className="text-purple-400" /> Métodos de Pago
                    </h3>
                    <div className="h-[300px] w-full flex items-center justify-center">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={paymentMethodsData || []}
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={100}
                                    paddingAngle={5}
                                    dataKey="revenue"
                                    nameKey="method"
                                >
                                    {(paymentMethodsData || []).map((entry: any, index: number) => {
                                        const colors: any = {
                                            cash: '#10B981',
                                            card_nayax: '#8B5CF6',
                                            online: '#3B82F6',
                                            stripe_qr: '#0EA5E9',
                                            bizum: '#F59E0B',
                                            unknown: '#6B7280'
                                        };
                                        return <Cell key={`cell-${index}`} fill={colors[entry.method] || colors.unknown} />;
                                    })}
                                </Pie>
                                <Tooltip
                                    formatter={(value: number) => `€${value}`}
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                />
                                <Legend
                                    formatter={(value) => {
                                        const labels: any = {
                                            cash: 'Efectivo',
                                            card_nayax: 'TPV / Tarjeta',
                                            online: 'Web / Online',
                                            stripe_qr: 'Stripe QR',
                                            bizum: 'Bizum',
                                            unknown: 'Desconocido'
                                        };
                                        return labels[value] || value;
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>

            </div>
        </div>
    );
}

function KPICard({ label, value, icon: Icon, color }: any) {
    const colors: any = {
        green: "text-green-400 bg-green-500/10 border-green-500/20",
        blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
        purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    };

    return (
        <div className={`p-6 rounded-2xl border ${colors[color]} flex items-center justify-between`}>
            <div>
                <p className="text-gray-400 text-xs font-bold uppercase tracking-wider mb-1">{label}</p>
                <h3 className="text-3xl font-black text-white">{value}</h3>
            </div>
            <div className={`p-3 rounded-xl bg-black/20 ${colors[color].split(" ")[0]}`}>
                <Icon size={32} />
            </div>
        </div>
    )
}
