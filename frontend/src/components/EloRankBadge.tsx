import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { cn } from '../lib/utils';

interface EloRankBadgeProps {
    driverName: string;
    showRating?: boolean;
    size?: 'sm' | 'md' | 'lg';
    className?: string;
}

interface DriverEloData {
    name: string;
    elo_rating: number;
    tier: string;
    tier_color: string;
    rank: number;
}

const tierIcons: Record<string, string> = {
    grandmaster: '👑',
    master: '💎',
    diamond: '💠',
    platinum: '🔷',
    gold: '🥇',
    silver: '🥈',
    bronze: '🥉',
};

export function EloRankBadge({ driverName, showRating = true, size = 'md', className }: EloRankBadgeProps) {
    const { data, isLoading, error } = useQuery<DriverEloData>({
        queryKey: ['driver-elo', driverName],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/elo/driver/${encodeURIComponent(driverName)}`);
            return res.data;
        },
        staleTime: 5 * 60 * 1000, // 5 minutes
        retry: 1,
    });

    if (isLoading || error || !data) {
        return null;
    }

    const sizeClasses = {
        sm: 'text-xs px-1.5 py-0.5',
        md: 'text-sm px-2 py-1',
        lg: 'text-base px-3 py-1.5',
    };

    return (
        <span
            className={cn(
                'inline-flex items-center gap-1 rounded-full font-bold',
                sizeClasses[size],
                className
            )}
            style={{
                backgroundColor: `${data.tier_color}20`,
                color: data.tier_color,
                border: `1px solid ${data.tier_color}40`,
            }}
            title={`${data.tier.charAt(0).toUpperCase() + data.tier.slice(1)} - Rank #${data.rank}`}
        >
            <span>{tierIcons[data.tier] || '🏁'}</span>
            {showRating && <span>{Math.round(data.elo_rating)}</span>}
        </span>
    );
}

export function EloLeaderboard({ limit = 20 }: { limit?: number }) {
    const { data: rankings, isLoading } = useQuery({
        queryKey: ['elo-rankings', limit],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/elo/rankings?limit=${limit}`);
            return res.data;
        },
    });

    if (isLoading) {
        return <div className="animate-pulse">Cargando rankings ELO...</div>;
    }

    return (
        <div className="space-y-2">
            {rankings?.map((driver: DriverEloData & { rank: number; win_rate: number }) => (
                <div
                    key={driver.name}
                    className="flex items-center justify-between p-3 bg-gray-800/50 rounded-lg border border-gray-700"
                >
                    <div className="flex items-center gap-3">
                        <span className="text-gray-500 font-mono w-6">#{driver.rank}</span>
                        <span className="font-bold text-white">{driver.name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className="text-xs text-gray-400">{driver.win_rate}% wins</span>
                        <EloRankBadge driverName={driver.name} />
                    </div>
                </div>
            ))}
        </div>
    );
}

export default EloRankBadge;
