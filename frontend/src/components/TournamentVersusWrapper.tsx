import { useQuery } from '@tanstack/react-query';
import { getEventLeaderboard } from '../api/events';
import { VersusCard } from './VersusCard';

export function TournamentVersusWrapper({ eventId, track }: { eventId: number, track: string }) {
    const { data: leaderboard } = useQuery({
        queryKey: ['event_leaderboard', eventId],
        queryFn: () => getEventLeaderboard(eventId)
    });

    if (!leaderboard || leaderboard.length < 2) {
        return (
            <div className="flex h-full items-center justify-center text-gray-500 text-2xl">
                Se necesitan al menos 2 pilotos para un duelo.
            </div>
        );
    }

    // Top 4 (or less)
    const topDrivers = leaderboard.slice(0, 4).map(d => d.driver_name);

    return (
        <VersusCard
            drivers={topDrivers}
            track={track || leaderboard[0].track_name}
        />
    );
}
