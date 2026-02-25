import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';

interface EloProps {
    driverName: string;
    size?: 'sm' | 'md' | 'lg';
}

interface EloRankingEntry {
    name: string;
    elo_rating: number;
    tier: string;
    tier_color: string;
    total_wins: number;
}

export const EloBadge = ({ driverName, size = 'sm' }: EloProps) => {
    const { data: rankings } = useQuery<EloRankingEntry[]>({
        queryKey: ['elo-rankings-badges'],
        queryFn: async () => {
            try {
                const res = await axios.get(`${API_URL}/elo/rankings?limit=500`);
                return res.data;
            } catch {
                return [];
            }
        },
        staleTime: 5 * 60 * 1000
    });

    const data = rankings?.find((entry) => entry.name === driverName);
    if (!data) return null;

    const sizeClasses = {
        sm: 'text-[10px] px-1.5 py-0.5',
        md: 'text-xs px-2 py-1',
        lg: 'text-sm px-3 py-1.5'
    };

    return (
        <div
            className={`inline-flex items-center rounded-md font-bold uppercase tracking-widest border border-white/10 ${sizeClasses[size]} select-none`}
            style={{
                backgroundColor: `${data.tier_color}20`,
                color: data.tier_color,
                borderColor: `${data.tier_color}40`
            }}
            title={`Tier: ${data.tier.toUpperCase()} | ELO: ${data.elo_rating} | Wins: ${data.total_wins}`}
        >
            <span className="mr-1.5 opacity-80">
                {data.tier === 'grandmaster' ? '👑' :
                    data.tier === 'master' ? '💎' :
                        data.tier === 'diamond' ? '💠' :
                            data.tier === 'platinum' ? '🧿' :
                                data.tier === 'gold' ? '🥇' :
                                    data.tier === 'silver' ? '🥈' : '🥉'}
            </span>
            {Math.round(data.elo_rating)}
        </div>
    );
};
