import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import axios from 'axios';
import { API_URL } from '../config';
import { Trophy, Users } from 'lucide-react';
import { cn } from '../lib/utils';
import { useEffect, useState } from 'react';

// Types for Bracket
type Match = {
    id: number;
    round: number;
    match_num: number;
    player1?: string;
    player2?: string;
    winner?: string | null;
    score1?: number;
    score2?: number;
};

type BracketData = {
    rounds: Match[][]; // Array of rounds, each containing matches
};

type BracketResponse = BracketData | { status: string; message?: string };

export default function TournamentTV() {
    const { id } = useParams<{ id: string }>();
    const eventId = parseInt(id || '0');

    // Fetch Event Data
    const { data: event, isLoading } = useQuery({
        queryKey: ['event', eventId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/events/${eventId}`);
            return res.data;
        }
    });

    // Fetch Bracket Data (Backend)
    const { data: bracketData } = useQuery<BracketResponse>({
        queryKey: ['bracket', eventId],
        queryFn: async () => {
            const res = await axios.get(`${API_URL}/tournaments/${eventId}/bracket`);
            return res.data;
        },
        enabled: !!event?.bracket_data || !!event, // Trigger if event exists
        refetchInterval: 5000 // Live updates for TV
    });

    const [bracket, setBracket] = useState<BracketData | null>(null);

    useEffect(() => {
        if (bracketData && 'rounds' in bracketData) {
            setBracket(bracketData);
        } else if (bracketData && 'status' in bracketData) {
            setBracket(null);
        } else if (event?.rules) {
            // Fallback to legacy rules parsing if Backend API returns empty but rules has data
            try {
                const rules = JSON.parse(event.rules);
                if (rules.bracket) {
                    setBracket(rules.bracket);
                }
            } catch (e) { }
        }
    }, [bracketData, event]);

    if (isLoading) return <div className="text-white p-10 flex justify-center items-center h-screen bg-gray-950 font-black text-2xl uppercase">Cargando Torneo...</div>;
    if (!event) return <div className="text-white p-10">Evento no encontrado</div>;

    return (
        <div className="min-h-screen bg-gray-950 text-white overflow-hidden flex flex-col">
            {/* Header / TV Overlay */}
            <div className="p-8 pb-4 flex justify-between items-end border-b border-gray-800 bg-gray-900/50 backdrop-blur-md z-10">
                <div>
                    <span className="bg-red-600 px-3 py-1 rounded text-xs font-black uppercase tracking-widest shadow-lg shadow-red-600/20">En Vivo</span>
                    <h1 className="text-5xl font-black italic uppercase tracking-tighter mt-2 flex items-center gap-4">
                        <Trophy className="text-yellow-500" size={48} />
                        {event.name}
                    </h1>
                </div>
                <div className="text-right">
                    <p className="text-gray-400 font-bold uppercase tracking-widest text-sm">Torneo Eliminatorio</p>
                    <div className="flex items-center justify-end space-x-2 text-gray-500 text-xs font-mono mt-1">
                        <Users size={12} />
                        <span>{bracket?.rounds?.[0]?.length ? bracket.rounds[0].length * 2 : 0} Participantes</span>
                    </div>
                </div>
            </div>

            {/* Bracket Container */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden p-8 flex items-center justify-center">
                {(!bracket || !bracket.rounds) ? (
                    <div className="flex flex-col items-center justify-center opacity-50">
                        <Trophy size={64} className="mb-4 text-gray-700" />
                        <h2 className="text-2xl font-black text-gray-600 uppercase">Esperando Sorteo</h2>
                        <p className="text-gray-500">El cuadro del torneo aún no ha sido generado</p>
                    </div>
                ) : (
                    <div className="flex space-x-12 h-full items-center">
                        {bracket.rounds.map((round, roundIndex) => (
                            <div key={roundIndex} className="flex flex-col justify-around h-full space-y-4 min-w-[280px]">
                                {/* Round Header */}
                                <div className="text-center font-black uppercase text-gray-600 text-sm tracking-[0.2em] mb-4">
                                    {getRoundName(roundIndex, bracket.rounds.length)}
                                </div>

                                {/* Matches */}
                                <div className="flex flex-col justify-around flex-1 relative">
                                    {round.map((match, _matchIndex) => (
                                        <MatchCard key={match.id} match={match} isFinal={roundIndex === bracket.rounds.length - 1} />
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {/* Ticker / Footer (Optional) */}
            <div className="h-12 bg-blue-600 flex items-center px-4 overflow-hidden whitespace-nowrap">
                <div className="animate-marquee text-white font-black uppercase tracking-widest text-lg">
                    🏆 Torneo en curso • Pilotos prepararse en simuladores {bracket?.rounds?.[0]?.[0] ? `• Siguiente carrera: ${bracket.rounds[0][0].player1 || 'TBA'} vs ${bracket.rounds[0][0].player2 || 'TBA'}` : ''} •
                </div>
            </div>
        </div>
    );
}

function MatchCard({ match, isFinal }: { match: Match, isFinal: boolean }) {
    return (
        <div className={cn(
            "relative bg-gray-900 border-2 rounded-xl overflow-hidden transition-all duration-500 w-full",
            match.winner ? "border-green-500/50" : "border-gray-700",
            isFinal && "border-yellow-500 scale-110 shadow-2xl shadow-yellow-500/20"
        )}>
            {/* Player 1 */}
            <div className={cn(
                "p-3 flex justify-between items-center border-b border-gray-800",
                match.winner === match.player1 && match.player1 ? "bg-green-500/20" : ""
            )}>
                <span className={cn("font-bold truncate", match.winner === match.player1 && match.player1 ? "text-white" : "text-gray-400")}>
                    {match.player1 || "TBD"}
                </span>
                {match.score1 !== undefined && <span className="font-mono font-black">{match.score1}</span>}
            </div>

            {/* Player 2 */}
            <div className={cn(
                "p-3 flex justify-between items-center",
                match.winner === match.player2 && match.player2 ? "bg-green-500/20" : ""
            )}>
                <span className={cn("font-bold truncate", match.winner === match.player2 && match.player2 ? "text-white" : "text-gray-400")}>
                    {match.player2 || "TBD"}
                </span>
                {match.score2 !== undefined && <span className="font-mono font-black">{match.score2}</span>}
            </div>
        </div>
    );
}

// Helpers
function getRoundName(index: number, total: number) {
    if (index === total - 1) return "GRAN FINAL";
    if (index === total - 2) return "SEMIFINALES";
    if (index === total - 3) return "CUARTOS";
    return `RONDA ${index + 1}`;
}
