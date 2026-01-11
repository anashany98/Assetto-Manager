import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { getEvent } from '../api/events';
import { TournamentLeaderboard } from '../components/TournamentLeaderboard';
import TournamentBracket from '../components/TournamentBracket';
import { Calendar, MapPin, Trophy, Clock, Users, ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import { cn } from '../lib/utils';

export default function EventDetails() {
    const { id } = useParams<{ id: string }>();
    const eventId = parseInt(id || '0');

    const [activeTab, setActiveTab] = useState<'leaderboard' | 'bracket'>('leaderboard');

    const { data: event, isLoading: loadingEvent } = useQuery({
        queryKey: ['event', eventId],
        queryFn: () => getEvent(eventId),
        enabled: eventId > 0
    });

    if (loadingEvent) return <div className="p-8 text-white">Cargando evento...</div>;
    if (!event) return <div className="p-8 text-white">Evento no encontrado</div>;

    return (
        <div className="p-8 max-w-7xl mx-auto min-h-screen bg-gray-50">
            {/* Header */}
            <Link to="/events" className="inline-flex items-center text-gray-400 hover:text-blue-600 mb-6 transition-colors">
                <ArrowLeft size={20} className="mr-2" />
                Volver a Torneos
            </Link>

            <div className="bg-white rounded-2xl shadow-xl overflow-hidden mb-8 border border-gray-100">
                <div className={cn(
                    "h-4 w-full",
                    event.status === 'active' ? "bg-green-500" : event.status === 'completed' ? "bg-gray-400" : "bg-blue-500"
                )} />

                <div className="p-8 relative overflow-hidden">
                    <div className="relative z-10 flex justify-between items-start">
                        <div>
                            <h1 className="text-4xl font-black text-gray-900 mb-2 uppercase tracking-tight">{event.name}</h1>
                            <p className="text-gray-500 text-lg mb-6">{event.description}</p>

                            <div className="flex flex-wrap gap-6 text-gray-600">
                                <div className="flex items-center bg-gray-100 px-4 py-2 rounded-lg">
                                    <Calendar className="mr-2 text-blue-500" size={20} />
                                    <span className="font-semibold">{new Date(event.start_date).toLocaleDateString()}</span>
                                </div>
                                {event.track_name && (
                                    <div className="flex items-center bg-gray-100 px-4 py-2 rounded-lg">
                                        <MapPin className="mr-2 text-red-500" size={20} />
                                        <span className="font-semibold capitalize">{event.track_name}</span>
                                    </div>
                                )}
                                <div className="flex items-center bg-gray-100 px-4 py-2 rounded-lg">
                                    <Clock className="mr-2 text-gray-500" size={20} />
                                    <span className="font-semibold capitalize">
                                        {event.status === 'active' ? 'En Curso' : event.status === 'completed' ? 'Finalizado' : 'Próximamente'}
                                    </span>
                                </div>
                            </div>
                        </div>
                        {event.status === 'active' && (
                            <div className="px-6 py-3 bg-green-100 text-green-700 font-bold rounded-xl animate-pulse shadow-inner border border-green-200">
                                🟢 EN VIVO
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex space-x-6 mb-8 border-b border-gray-200">
                <button
                    onClick={() => setActiveTab('leaderboard')}
                    className={`pb-4 px-2 font-bold text-lg border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'leaderboard' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <Trophy size={20} /> Clasificación
                </button>
                <button
                    onClick={() => setActiveTab('bracket')}
                    className={`pb-4 px-2 font-bold text-lg border-b-2 transition-colors flex items-center gap-2 ${activeTab === 'bracket' ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-400 hover:text-gray-600'}`}
                >
                    <Users size={20} /> Eliminatorias
                </button>
            </div>

            {/* Content */}
            <div className="bg-white rounded-2xl shadow-xl border border-gray-100 min-h-[500px]">
                {activeTab === 'leaderboard' ? (
                    <TournamentLeaderboard
                        eventId={eventId}
                        eventName={event.name}
                        description={event.description}
                    />
                ) : (
                    <div className="p-4 bg-gray-900 rounded-b-xl h-full min-h-[500px]">
                        <TournamentBracket eventId={eventId} isAdmin={true} />
                    </div>
                )}
            </div>
        </div>
    );
}
