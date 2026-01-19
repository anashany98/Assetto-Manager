import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
    Activity,
    Users,
    Trophy,
    Monitor,
    Tv,
    ExternalLink,
    HardDrive,
    Zap,
    Flag,
    Cloud,
    Sun,
    CloudRain,
    CloudLightning,
    Wind,
    Play,
    Glasses
} from 'lucide-react';
import { Link } from 'react-router-dom';
import { getDashboardStats, type DashboardStats } from '../api/dashboard';
import { getStations } from '../api/stations';
import { getActiveSessions, type Session } from '../api/sessions';
import { AlertTriangle } from 'lucide-react';
import axios from 'axios';
import { API_URL } from '../config';
import AnalyticsPanel from '../components/AnalyticsPanel';
import SessionTimer from '../components/SessionTimer';
import StartSessionModal from '../components/StartSessionModal';
import MassLaunchModal from '../components/MassLaunchModal';
import { Rocket } from 'lucide-react';

export default function Dashboard() {
    const queryClient = useQueryClient();
    const [showLaunchModal, setShowLaunchModal] = useState(false);

    const { data: stats, isLoading, error } = useQuery<DashboardStats>({
        queryKey: ['dashboardStats'],
        queryFn: getDashboardStats,
        refetchInterval: 5000
    });

    // ... (keep existing code) ...

    <div className="p-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
        <button
            onClick={() => setShowLaunchModal(true)}
            className="block p-5 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm shadow-lg transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl hover:border-red-500/50 hover:bg-red-500/10 hover:shadow-red-500/10 text-left"
        >
            <h3 className="font-bold text-white mb-1 group-hover:translate-x-1 transition-transform flex items-center gap-2 text-lg">
                <Rocket size={20} className="text-red-500" /> LANZAMIENTO
            </h3>
            <p className="text-sm text-gray-400">Despliegue masivo en simuladores</p>
        </button>

        <QuickAction
            to="/profiles"
            title="Perfiles Volante"
            desc="Aplicar FFB y config hardware"
            color="blue"
        />
        <QuickAction
            to="/events"
            title="Organizar Torneo"
            desc="Crear eliminatorias y brackets"
            color="indigo"
        />
        <QuickAction
            to="/championships"
            title="Gestionar Campeonato"
            desc="Administrar puntos de temporada"
            color="purple"
        />
    </div>
                    </div >

        <div className="bg-gradient-to-br from-gray-900 to-gray-800 rounded-2xl shadow-xl overflow-hidden text-white">
            {/* ... (keep existing code) ... */}
        </div>
                </div >

        {/* RIGHT: SYSTEM STATUS SIDEBAR (Placeholder for logs or alerts) */ }
    {/* ... (keep existing code) ... */ }

            </div >

        {/* ANALYTICS SECTION */ }
        < div className = "mt-10" >
            <AnalyticsPanel />
            </div >

        {/* MODALS */ }
    {
        showLaunchModal && (
            <MassLaunchModal onClose={() => setShowLaunchModal(false)} />
        )
    }
    {
        startModalStation && (
            <StartSessionModal
                stationId={startModalStation.id}
                stationName={startModalStation.name}
                initialIsVR={startModalStation.is_vr}
                onClose={() => setStartModalStation(null)}
                onSuccess={() => {
                    setStartModalStation(null);
                    queryClient.invalidateQueries({ queryKey: ['active-sessions'] });
                }}
            />
        )
    }
        </div >
    );
}

// Subcomponents for cleaner code
interface StatCardProps {
    label: string;
    value: string | number;
    subvalue?: string;
    icon: React.ComponentType<{ className?: string; size?: number }>;
    color: string;
    animate?: boolean;
}

function StatCard({ label, value, subvalue, icon: Icon, color, animate }: StatCardProps) {
    const colors: Record<string, { icon: string; border: string; glow: string }> = {
        green: { icon: "text-emerald-400 bg-emerald-500/20", border: "border-emerald-500/20 hover:border-emerald-500/40", glow: "shadow-emerald-500/10" },
        orange: { icon: "text-orange-400 bg-orange-500/20", border: "border-orange-500/20 hover:border-orange-500/40", glow: "shadow-orange-500/10" },
        blue: { icon: "text-blue-400 bg-blue-500/20", border: "border-blue-500/20 hover:border-blue-500/40", glow: "shadow-blue-500/10" },
        indigo: { icon: "text-indigo-400 bg-indigo-500/20", border: "border-indigo-500/20 hover:border-indigo-500/40", glow: "shadow-indigo-500/10" },
        gray: { icon: "text-gray-400 bg-gray-700/50", border: "border-gray-700/50", glow: "" }
    };

    const c = colors[color] || colors.gray;

    return (
        <div className={`glass-card glass-card-hover p-6 flex items-start justify-between border ${c.border} ${c.glow} shadow-lg`}>
            <div>
                <p className="text-gray-400 font-bold uppercase text-xs tracking-wider mb-2">{label}</p>
                <h3 className="text-3xl font-black text-white mb-1 tracking-tight">{value}</h3>
                <p className="text-xs text-gray-500 font-medium">{subvalue}</p>
            </div>
            <div className={`p-4 rounded-xl ${c.icon} ${animate ? 'animate-pulse' : ''}`}>
                <Icon size={28} />
            </div>
        </div>
    )
}

function QuickAction({ to, title, desc, color }: { to: string; title: string; desc: string; color: string }) {
    const colors: Record<string, string> = {
        blue: "hover:border-blue-500/50 hover:bg-blue-500/10 hover:shadow-blue-500/10",
        indigo: "hover:border-indigo-500/50 hover:bg-indigo-500/10 hover:shadow-indigo-500/10",
        purple: "hover:border-purple-500/50 hover:bg-purple-500/10 hover:shadow-purple-500/10",
        green: "hover:border-green-500/50 hover:bg-green-500/10 hover:shadow-green-500/10",
    }

    return (
        <Link to={to} className={`block p-5 rounded-xl border border-white/5 bg-white/5 backdrop-blur-sm shadow-lg transition-all duration-300 group hover:-translate-y-1 hover:shadow-xl ${colors[color]}`}>
            <h3 className="font-bold text-white mb-1 group-hover:translate-x-1 transition-transform">{title}</h3>
            <p className="text-sm text-gray-400">{desc}</p>
        </Link>
    )
}

function WeatherBtn({ icon: Icon, label, color, onClick }: any) {
    const colors: any = {
        yellow: "hover:bg-yellow-500 hover:text-white border-yellow-500/50 text-yellow-400",
        gray: "hover:bg-gray-500 hover:text-white border-gray-500/50 text-gray-400",
        blue: "hover:bg-blue-500 hover:text-white border-blue-500/50 text-blue-400",
        indigo: "hover:bg-indigo-500 hover:text-white border-indigo-500/50 text-indigo-400",
        purple: "hover:bg-purple-500 hover:text-white border-purple-500/50 text-purple-400",
    }
    return (
        <button
            onClick={onClick}
            className={`flex flex-col items-center gap-1 px-4 py-2 rounded-xl border bg-black/40 transition-all active:scale-95 ${colors[color]}`}
        >
            <Icon size={20} />
            <span className="text-[10px] font-bold">{label}</span>
        </button>
    )
}

function DiagnosticBar({ label, value, suffix, color }: { label: string; value: number; suffix?: string; color: string }) {
    const colors: Record<string, { bg: string; fill: string }> = {
        blue: { bg: "bg-blue-500/20", fill: "bg-blue-500" },
        green: { bg: "bg-green-500/20", fill: "bg-green-500" },
        purple: { bg: "bg-purple-500/20", fill: "bg-purple-500" },
        red: { bg: "bg-red-500/20", fill: "bg-red-500" },
    };
    const c = colors[color] || colors.blue;
    const isHigh = value > 80;

    return (
        <div className="flex items-center gap-2 text-xs">
            <span className="text-gray-400 w-10">{label}</span>
            <div className={`flex-1 h-2 rounded-full ${c.bg} overflow-hidden`}>
                <div
                    className={`h-full rounded-full transition-all ${isHigh ? 'bg-red-500' : c.fill}`}
                    style={{ width: `${Math.min(value, 100)}%` }}
                />
            </div>
            <span className={`w-16 text-right font-mono ${isHigh ? 'text-red-400' : 'text-gray-400'}`}>
                {suffix || `${value.toFixed(0)}%`}
            </span>
        </div>
    );
}

