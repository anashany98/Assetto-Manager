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
import { BadgeDollarSign, TrendingUp, Calendar, Clock, CreditCard, Loader2, AlertCircle, RefreshCw, Users } from 'lucide-react';
import { useState, useMemo } from 'react';

interface RevenueData {
    date: string;
    revenue: number;
    sessions: number;
}

interface UtilizationData {
    hour: number;
    count: number;
}

interface KPIData {
    total_revenue: number;
    avg_ticket: number;
    total_sessions: number;
    revenue_per_session: number;
}

interface PaymentMethodData {
    method: string;
    revenue: number;
    count: number;
    [key: string]: unknown;
}

const PAYMENT_COLORS: Record<string, string> = {
    cash: '#10B981',
    card_nayax: '#8B5CF6',
    online: '#3B82F6',
    stripe_qr: '#0EA5E9',
    bizum: '#F59E0B',
    unknown: '#6B7280'
};

const PAYMENT_LABELS: Record<string, string> = {
    cash: 'Efectivo',
    card_nayax: 'TPV / Tarjeta',
    online: 'Web / Online',
    stripe_qr: 'Stripe QR',
    bizum: 'Bizum',
    unknown: 'Desconocido'
};

const RANGES = [
    { value: 7, label: '7 Días' },
    { value: 30, label: '30 Días' },
    { value: 90, label: '90 Días' },
    { value: 365, label: '1 Año' },
] as const;

const getRevenue = async (range: number): Promise<RevenueData[]> => {
    const res = await axios.get(`${API_URL}/analytics/revenue`, { params: { range_days: range } });
    return res.data;
};

const getUtilization = async (range: number): Promise<UtilizationData[]> => {
    const res = await axios.get(`${API_URL}/analytics/utilization`, { params: { range_days: range } });
    return res.data;
};

const getKPIs = async (range: number): Promise<KPIData> => {
    const res = await axios.get(`${API_URL}/analytics/kpi`, { params: { range_days: range } });
    return res.data;
};

const getPaymentMethods = async (range: number): Promise<PaymentMethodData[]> => {
    const res = await axios.get(`${API_URL}/analytics/payment-methods`, { params: { range_days: range } });
    return res.data;
};

export default function AnalyticsPage() {
    const [range, setRange] = useState(30);

    const { data: kpis, isLoading: loadingKpis, error: kpisError, refetch: refetchKpis } = useQuery({
        queryKey: ['analytics-kpi', range],
        queryFn: () => getKPIs(range),
        retry: 1
    });

    const { data: revenueData, isLoading: loadingRevenue, error: revenueError, refetch: refetchRevenue } = useQuery({
        queryKey: ['analytics-revenue', range],
        queryFn: () => getRevenue(range),
        retry: 1
    });

    const { data: utilizationData, isLoading: loadingUtil, error: utilError, refetch: refetchUtil } = useQuery({
        queryKey: ['analytics-utilization', range],
        queryFn: () => getUtilization(range),
        retry: 1
    });

    const { data: paymentMethodsData, isLoading: loadingPayments, error: paymentsError, refetch: refetchPayments } = useQuery({
        queryKey: ['analytics-payment-methods', range],
        queryFn: () => getPaymentMethods(range),
        retry: 1
    });

    const peakHour = useMemo(() => {
        if (!utilizationData?.length) return null;
        const peak = utilizationData.reduce((a, b) => a.count > b.count ? a : b);
        return { hour: peak.hour, count: peak.count };
    }, [utilizationData]);

    const totalPaymentRevenue = useMemo(() => {
        if (!paymentMethodsData?.length) return 0;
        return paymentMethodsData.reduce((sum, pm) => sum + pm.revenue, 0);
    }, [paymentMethodsData]);

    const hasAnyError = kpisError || revenueError || utilError || paymentsError;
    const isLoading = loadingKpis || loadingRevenue || loadingUtil || loadingPayments;

    if (isLoading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center">
                    <Loader2 className="animate-spin text-[var(--accent-primary)] mx-auto mb-4" size={32} />
                    <p className="text-[var(--text-tertiary)]">Cargando analíticas...</p>
                </div>
            </div>
        );
    }

    if (hasAnyError) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="text-center ac-card p-8">
                    <AlertCircle className="text-red-500 mx-auto mb-4" size={48} />
                    <h3 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Error al cargar datos</h3>
                    <p className="text-[var(--text-tertiary)] mb-4">No se pudieron obtener las métricas de analíticas</p>
                    <button
                        onClick={() => {
                            refetchKpis();
                            refetchRevenue();
                            refetchUtil();
                            refetchPayments();
                        }}
                        className="ac-btn ac-btn-primary inline-flex items-center gap-2"
                    >
                        <RefreshCw size={16} />
                        Reintentar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="p-4 sm:p-6 lg:p-8 max-w-[1600px] mx-auto min-h-screen">
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end mb-8 border-b border-[var(--border-default)] pb-6 gap-4">
                <div>
                    <h1 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)] tracking-tight flex items-center gap-3">
                        <BadgeDollarSign className="text-[var(--accent-success)]" size={32} />
                        ANÁLISIS DE NEGOCIO
                    </h1>
                    <p className="text-[var(--text-tertiary)] mt-1 font-medium">Métricas de rendimiento financiero y operativo</p>
                </div>
                <div className="flex bg-[var(--bg-card)] rounded-lg p-1 border border-[var(--border-default)]">
                    {RANGES.map((r) => (
                        <button
                            key={r.value}
                            onClick={() => setRange(r.value)}
                            className={`px-3 sm:px-4 py-2 rounded-md text-sm font-bold transition-all ${range === r.value
                                ? 'bg-[var(--bg-elevated)] text-[var(--text-primary)] shadow-sm'
                                : 'text-[var(--text-tertiary)] hover:text-[var(--text-secondary)]'
                                }`}
                        >
                            {r.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 mb-10">
                <KPICard
                    label="Ingresos Totales"
                    value={kpis?.total_revenue ? `€${kpis.total_revenue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€0.00'}
                    icon={BadgeDollarSign}
                    color="green"
                />
                <KPICard
                    label="Sesiones Vendidas"
                    value={kpis?.total_sessions?.toLocaleString() || "0"}
                    icon={Calendar}
                    color="blue"
                />
                <KPICard
                    label="Ticket Medio"
                    value={kpis?.avg_ticket ? `€${kpis.avg_ticket.toFixed(2)}` : '€0.00'}
                    icon={TrendingUp}
                    color="purple"
                />
                <KPICard
                    label="Ingreso / Sesión"
                    value={kpis?.revenue_per_session ? `€${kpis.revenue_per_session.toFixed(2)}` : '€0.00'}
                    icon={Clock}
                    color="orange"
                />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
                <ChartCard
                    title="Evolución de Ingresos"
                    icon={<TrendingUp size={20} className="text-green-400" />}
                    isLoading={loadingRevenue}
                    error={revenueError}
                    onRetry={refetchRevenue}
                >
                    {revenueData && revenueData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={300}>
                            <BarChart data={revenueData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#374151" opacity={0.5} />
                                <XAxis dataKey="date" stroke="#9CA3AF" fontSize={12} tickFormatter={(str) => str.slice(5)} />
                                <YAxis stroke="#9CA3AF" fontSize={12} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    itemStyle={{ color: '#fff' }}
                                    formatter={(value: number | undefined) => [`€${(value ?? 0).toFixed(2)}`, 'Ingresos']}
                                />
                                <Bar dataKey="revenue" fill="#10B981" radius={[4, 4, 0, 0]} name="Ingresos (€)" />
                            </BarChart>
                        </ResponsiveContainer>
                    ) : (
                        <EmptyChart message="Sin datos de ingresos para este período" />
                    )}
                </ChartCard>

                <ChartCard
                    title="Horas de Mayor Actividad"
                    icon={<Clock size={20} className="text-blue-400" />}
                    isLoading={loadingUtil}
                    error={utilError}
                    onRetry={refetchUtil}
                >
                    {utilizationData && utilizationData.some(u => u.count > 0) ? (
                        <>
                            <ResponsiveContainer width="100%" height={300}>
                                <AreaChart data={utilizationData}>
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
                                        formatter={(value: number | undefined) => [`${value ?? 0} sesiones`, 'Actividad']}
                                    />
                                    <Area type="monotone" dataKey="count" stroke="#3B82F6" fillOpacity={1} fill="url(#colorCount)" name="Sesiones" />
                                </AreaChart>
                            </ResponsiveContainer>
                            {peakHour && (
                                <div className="mt-3 flex items-center justify-center gap-2 text-sm text-[var(--text-tertiary)]">
                                    <Users size={14} />
                                    <span>Hora pico: <strong className="text-[var(--text-primary)]">{peakHour.hour}:00</strong> con <strong className="text-[var(--text-primary)]">{peakHour.count}</strong> sesiones</span>
                                </div>
                            )}
                        </>
                    ) : (
                        <EmptyChart message="Sin datos de actividad para este período" />
                    )}
                </ChartCard>

                <ChartCard
                    title="Métodos de Pago"
                    icon={<CreditCard size={20} className="text-purple-400" />}
                    isLoading={loadingPayments}
                    error={paymentsError}
                    onRetry={refetchPayments}
                    className="lg:col-span-2 xl:col-span-1"
                >
                    {paymentMethodsData && paymentMethodsData.length > 0 ? (
                        <>
                            <ResponsiveContainer width="100%" height={300}>
                                <PieChart>
                                    <Pie
                                        data={paymentMethodsData}
                                        cx="50%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={100}
                                        paddingAngle={5}
                                        dataKey="revenue"
                                        nameKey="method"
                                    >
                                        {paymentMethodsData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={PAYMENT_COLORS[entry.method] || PAYMENT_COLORS.unknown} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        formatter={(value: number | undefined) => {
                                            const v = value ?? 0;
                                            const pct = totalPaymentRevenue > 0 ? ((v / totalPaymentRevenue) * 100).toFixed(1) : '0';
                                            return [`€${v.toFixed(2)} (${pct}%)`, 'Ingresos'];
                                        }}
                                        contentStyle={{ backgroundColor: '#111827', borderColor: '#374151', color: '#fff' }}
                                    />
                                    <Legend
                                        formatter={(value: string) => PAYMENT_LABELS[value] || value}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                            {totalPaymentRevenue > 0 && (
                                <div className="mt-3 text-center text-sm text-[var(--text-tertiary)]">
                                    Total procesado: <strong className="text-[var(--text-primary)]">€{totalPaymentRevenue.toFixed(2)}</strong>
                                </div>
                            )}
                        </>
                    ) : (
                        <EmptyChart message="Sin datos de métodos de pago" />
                    )}
                </ChartCard>

            </div>
        </div>
    );
}

function ChartCard({
    title,
    icon,
    isLoading,
    error,
    onRetry,
    className,
    children
}: {
    title: string;
    icon: React.ReactNode;
    isLoading: boolean;
    error: Error | null;
    onRetry: () => void;
    className?: string;
    children: React.ReactNode;
}) {
    return (
        <div className={`bg-[var(--bg-card)]/50 border border-[var(--border-default)] rounded-2xl p-6 backdrop-blur-sm ${className || ''}`}>
            <h3 className="text-lg sm:text-xl font-bold text-[var(--text-primary)] mb-6 flex items-center gap-2">
                {icon} {title}
            </h3>
            {isLoading ? (
                <div className="h-[300px] flex items-center justify-center">
                    <Loader2 className="animate-spin text-[var(--accent-primary)]" size={24} />
                </div>
            ) : error ? (
                <div className="h-[300px] flex flex-col items-center justify-center text-[var(--text-tertiary)]">
                    <AlertCircle size={32} className="mb-2 text-red-500/50" />
                    <p className="text-sm mb-2">Error al cargar</p>
                    <button onClick={onRetry} className="text-xs text-[var(--accent-primary)] hover:underline">
                        Reintentar
                    </button>
                </div>
            ) : (
                children
            )}
        </div>
    );
}

function EmptyChart({ message }: { message: string }) {
    return (
        <div className="h-[300px] flex items-center justify-center text-[var(--text-tertiary)] text-sm">
            {message}
        </div>
    );
}

function KPICard({ label, value, icon: Icon, color }: { label: string; value: string; icon: React.ComponentType<{ size?: number }>; color: string }) {
    const colors: Record<string, string> = {
        green: "text-green-400 bg-green-500/10 border-green-500/20",
        blue: "text-blue-400 bg-blue-500/10 border-blue-500/20",
        purple: "text-purple-400 bg-purple-500/10 border-purple-500/20",
        orange: "text-orange-400 bg-orange-500/10 border-orange-500/20",
    };

    return (
        <div className={`p-4 sm:p-6 rounded-2xl border ${colors[color]} flex items-center justify-between`}>
            <div>
                <p className="text-[var(--text-tertiary)] text-xs font-bold uppercase tracking-wider mb-1">{label}</p>
                <h3 className="text-2xl sm:text-3xl font-black text-[var(--text-primary)]">{value}</h3>
            </div>
            <div className={`p-2 sm:p-3 rounded-xl bg-black/20 ${colors[color].split(" ")[0]}`}>
                <Icon size={24} />
            </div>
        </div>
    )
}
